import type { StudentProfile } from "@/lib/student";
import type { ChatMessage } from "@/lib/chat";
import { apiBase } from "@/lib/api_base";

/**
 * SSE を返す backend エンドポイントのクライアント。design.md §6.1 / §6.1.1。
 *
 * 書式は `data: <JSON>` の1行1イベントで、イベントの種類は用途で2系統に分かれる。
 *
 * - チャット系(`/api/chat/*`): `{"delta": "..."}` / `{"error": "..."}` / `{"done": true}`
 * - 履修提案(`/api/proposal`): `{"snapshot": {...}}` / `{"result": {...}}` に加えて
 *   チャット系と同じ `error` / `done`
 *
 * リクエストには学生プロファイルと対話履歴を毎回含める(サーバ側で永続化しないため)。
 */

type ChatRequest = {
  profile: StudentProfile | null;
  history: Pick<ChatMessage, "role" | "content">[];
  message: string;
};

/**
 * 提案する1科目。design.md §5.3(`backend/app/schemas/proposal.py`)。
 *
 * 必須は `title` と `reason` だけである。集中講義のように曜日・時限が定まらない
 * 科目と、開講情報を突合できなかった科目を、値の捏造ではなく null で表すため。
 */
export type ProposedCourse = {
  /** シラバスコード。api-clean で特定できた場合のみ */
  syllabusCode: string | null;
  title: string;
  day: "月" | "火" | "水" | "木" | "金" | null;
  /** 時限(1〜5) */
  period: number | null;
  /** 開講学期(前期 / 後期 / 通年 / 1Q など) */
  term: string | null;
  credits: number | null;
  /** 履修区分(必修 / 選択必修 / 選択) */
  category: string | null;
  /** この科目を勧める理由。1文 */
  reason: string;
};

/** 時間割提案全体。design.md §5.3。 */
export type TimetableProposal = {
  courses: ProposedCourse[];
  totalCredits: number | null;
  summary: string;
};

/**
 * `POST /api/proposal` のリクエスト。`backend/app/api/proposal.py` の `ProposalRequest`。
 *
 * 課程コードと入学年度を `studentProfile` とは別に送る。履修要項を引くキーは
 * (課程コード, 入学年度)だが、`StudentProfile.program` に入るのは課程名であり
 * 識別子に使えず、入学年度はプロファイルに無いためである(§4.4.2、`lib/programs.ts`)。
 */
type ProposalRequest = {
  studentProfile: StudentProfile;
  programCode: string;
  admissionYear: number;
  /** 希望条件。自由記述 */
  preferences?: string | null;
};

type SseEvent = Record<string, unknown>;

/**
 * `data: <JSON>` の1行1イベントを読み、各イベントを `onEvent` に渡す(§6.1.1)。
 *
 * backend は1イベントを `data: {...}\n\n` として一度に書くため、改行で区切れた行は
 * JSON として完結している。行が途中で切れている場合は次のチャンクと連結する。
 */
async function readSSE(
  url: string,
  body: unknown,
  onEvent: (event: SseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) throw new Error(`API error: ${res.status}`);
  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue; // 壊れたイベントは捨てる
      }
      if (parsed && typeof parsed === "object") onEvent(parsed as SseEvent);
    }
  }
}

/**
 * チャット系SSEの共通処理(§6.1.1)。`delta` を連結して全文を返す。
 *
 * `error` は表示用の文言だけを載せたイベントで、SSE を開いた後の失敗を伝える
 * (状態コードでは返せないため)。呼び出し側が catch できるよう例外にする。
 */
async function streamChat(
  path: string,
  body: unknown,
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  let full = "";
  const failure: { message?: string } = {};

  await readSSE(
    `${apiBase()}${path}`,
    body,
    (event) => {
      if (typeof event.delta === "string") {
        full += event.delta;
        onDelta(event.delta);
      } else if (typeof event.error === "string") {
        failure.message = event.error;
      }
    },
    signal,
  );

  if (failure.message) throw new Error(failure.message);
  return full;
}

/** `POST /api/chat/syllabus/{code}`(講義単位チャット)のSSEを受信する。 */
export function streamCourseChat(
  code: string,
  body: ChatRequest,
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  return streamChat(`/chat/syllabus/${encodeURIComponent(code)}`, body, onDelta, signal);
}

/** `POST /api/chat/syllabus`(シラバス全体チャット)のSSEを受信する。 */
export function streamSyllabusChat(
  body: ChatRequest,
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  return streamChat("/chat/syllabus", body, onDelta, signal);
}

/**
 * `POST /api/chat/proposal` のリクエスト。`backend/app/schemas/chat.py` の
 * `ProposalChatRequest`。
 *
 * **シラバスチャット(`ChatRequest`)と形が違う。** 質問と履歴を分けず、対話全体を
 * `messages` の1本で受け、末尾(role: user)が今回の質問、それより前が履歴である
 * (§6.1)。`proposal` は必須で、無ければ 422 になる — **提案を持っていない状態で
 * この口は成立しない**ため、提案前の入力は `POST /api/proposal` へ向ける(§8.3.1)。
 */
type ProposalChatRequest = {
  studentProfile: StudentProfile | null;
  proposal: TimetableProposal;
  messages: Pick<ChatMessage, "role" | "content">[];
};

/** `POST /api/chat/proposal`(履修提案チャット)のSSEを受信する(§7.3)。 */
export function streamProposalChat(
  body: ProposalChatRequest,
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  return streamChat("/chat/proposal", body, onDelta, signal);
}

/**
 * `POST /api/proposal`(履修提案の生成)のSSEを受信する(§6.1.1)。
 *
 * `snapshot` は組み立て途中の提案で生成中に何度も流れ、`onSnapshot` に渡す
 * (時間割表を逐次描画するため。§7.2)。`result` は検証を通った確定版で1度だけ
 * 流れ、これを戻り値にする。両者はキーの構成が同じで、`snapshot` では未到達の
 * フィールドが null になるだけである。
 */
export async function streamProposal(
  body: ProposalRequest,
  onSnapshot: (proposal: TimetableProposal) => void,
  signal?: AbortSignal,
): Promise<TimetableProposal> {
  const state: { result?: TimetableProposal; error?: string } = {};

  await readSSE(
    `${apiBase()}/proposal`,
    body,
    (event) => {
      if (event.snapshot && typeof event.snapshot === "object") {
        onSnapshot(event.snapshot as TimetableProposal);
      } else if (event.result && typeof event.result === "object") {
        state.result = event.result as TimetableProposal;
      } else if (typeof event.error === "string") {
        state.error = event.error;
      }
    },
    signal,
  );

  if (state.error) throw new Error(state.error);
  if (!state.result) throw new Error("提案が完成しませんでした");
  return state.result;
}
