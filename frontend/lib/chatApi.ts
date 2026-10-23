import type { StudentProfile } from "@/lib/student";
import type { ChatMessage } from "@/lib/chat";
import { apiBase } from "@/lib/api_base";

/**
 * SSE と JSON を返す backend エンドポイントのクライアント。design.md §6.1 / §6.1.1。
 *
 * SSE の書式は `data: <JSON>` の1行1イベントで、イベントの種類は次のとおり。
 *
 * - 共通: `{"delta": "..."}`(本文)/ `{"thinking": "..."}`(モデルの思考)/
 *   `{"activity": {...}}`(ツールの進み具合)/ `{"error": "..."}` / `{"done": true}`
 * - 時間割のアシスタント(`/api/timetable/assistant`)だけ: `{"build": {...}}`(組み立ての
 *   開始)/ `{"step": {...}}`(組み立ての1手)/ `{"timetable": {...}}`(組み上がった時間割)/
 *   `{"conditions": {...}}`(条件の差し替え)
 *
 * リクエストには学生プロファイルと対話履歴を毎回含める(サーバ側で永続化しないため)。
 */

/** 提案する学期(次に登録する学期。`lib/targetTerm.ts`)。`grade` はその学期の学年 */
export type TargetTermBody = { year: number; term: "前期" | "後期"; grade: 1 | 2 | 3 | 4 };

/**
 * シラバスチャットのリクエスト。`backend/app/schemas/chat.py` の `ChatRequest`。
 *
 * 課程コード・入学年度・対象学期は、揃えば送る。backend はそれで学生の文脈を作り、
 * 検索結果にその学生にとっての区分・入る要件枠・履修できるかを付け、プロンプトに
 * 卒業要件の充足状況を入れる(§7.4.1)。揃わなければ送らない(学年と課程だけで答える)
 */
type ChatRequest = {
  profile: StudentProfile | null;
  history: Pick<ChatMessage, "role" | "content">[];
  message: string;
  programCode?: string;
  admissionYear?: number;
  targetTerm?: TargetTermBody;
};

/** 開講コマ1つ。design.md §5.3(`backend/app/schemas/proposal.py` の `CourseSlot`) */
export type CourseSlot = {
  /** そのコマの開講学期(後期 / 3Q など) */
  term: string | null;
  day: "月" | "火" | "水" | "木" | "金" | "土";
  period: number;
};

/**
 * 提案する1科目。design.md §5.3(`backend/app/schemas/proposal.py`)。
 *
 * 必須は `title` と `reason` だけである。集中講義のように曜日・時限が定まらない
 * 科目と、開講情報を突合できなかった科目を、値の捏造ではなく null で表すため。
 *
 * `day` / `period` / `term` は**1コマ目**である。「後期 金4・金5」のように複数の
 * コマを持つ科目の全コマは `slots` にある(時間割に置くときは `lib/timetable.ts` の
 * `occupiedSlots()` を通す)。
 */
export type ProposedCourse = {
  /** シラバスコード。api-clean で特定できた場合のみ */
  syllabusCode: string | null;
  title: string;
  day: "月" | "火" | "水" | "木" | "金" | "土" | null;
  /** 時限(1〜5) */
  period: number | null;
  /** 開講学期(前期 / 後期 / 通年 / 1Q など) */
  term: string | null;
  /** 開講コマのすべて(原文の順)。集中講義は空。slots を返さない旧い backend では無い */
  slots?: CourseSlot[];
  credits: number | null;
  /** 履修区分(必修 / 選択必修 / 選択) */
  category: string | null;
  /**
   * 区分(`専門基礎科目` など。履修要項の表記)。`category` がどの区分についての値かを
   * 画面に示すために持つ。旧い backend・履修要項に無い科目では無い
   */
  courseCategory?: string | null;
  /** 教養教育科目の分野(`人文科学系科目` など)。教養教育科目以外は null */
  subcategory?: string | null;
  /** この科目を勧める理由。1文 */
  reason: string;
  /**
   * 誰が時間割に入れた科目か。組み立て(`/api/timetable/build`)は学生が自分で入れた科目
   * (`student`)を外さない。無ければ `assistant` とみなす
   */
  source?: "assistant" | "student";
};

/** 避ける時限。`day` が null ならどの曜日でも(「1限は避けたい」) */
export type PeriodRule = { day: "月" | "火" | "水" | "木" | "金" | "土" | null; period: number };

/**
 * 時間割の形についての条件。`backend/app/timetable/conditions.py` の `Conditions`。
 * frontend はアシスタントから届いた値(`conditions` イベント)をそのまま持ち、次の
 * リクエストに載せる。中身を画面で組み立てることはしない(条件は会話で変える)
 */
export type TimetableConditions = {
  scope?: "必修のみ" | "不足を埋める" | "広く";
  freeDays?: string[];
  freeDayCount?: number;
  avoidPeriods?: PeriodRule[];
  maxDays?: number | null;
  maxPeriodsPerDay?: number;
  targetCredits?: number | null;
  include?: string[];
  exclude?: string[];
};

/** 時間割についての事実。`backend/app/timetable/report.py` の `Report`。値は backend が計算する */
export type TimetableReport = {
  days: Record<string, string[]>;
  freeDays: string[];
  otherFreeDayOptions: string[];
  unscheduled: string[];
  conditions: { condition: string; status: "met" | "unmet"; detail: string }[];
  requirements: { slot: string; before: number; after: number; required: number }[];
  remainingShortfall: { slot: string; shortfall: number; reason: string | null }[];
  credits: { total: number; limit: number | null; cap: number | null; registered: number };
  retakes: string[];
  needsConfirmation: string[];
};

/** 組み立ての1手。`backend/app/timetable/report.py` の `Step` */
export type TimetableStep = {
  kind: "keep" | "remove" | "required" | "include" | "free_day" | "fill" | "unmet";
  course: ProposedCourse | null;
  day: string | null;
  others: string[];
  slot: string | null;
  shortfallAfter: number | null;
  note: string | null;
  condition: string | null;
  detail: string | null;
};

/** ツールの進み具合。`id` は呼び出しごとの値で、書きかけの引数が届くたびに同じ id で流れ直す */
export type AgentActivity = {
  id: string;
  tool: string;
  /** backend が決めた固定の文言(「シラバスを検索しています」など) */
  label: string;
  /** モデルが書いた引数。書きかけの間も届く */
  args: Record<string, unknown>;
};

/** 組み立ての起点(§7.2)。`backend/app/timetable/builder.py` の `Mode` */
export type BuildMode = "rebuild" | "adjust" | "remove";

/** 組み上がった時間割(`timetable` イベント)と `/api/timetable/build` の応答の共通部分 */
export type BuiltTimetable = {
  courses: ProposedCourse[];
  totalCredits: number;
  report: TimetableReport;
};

/**
 * 時間割の文脈(§6.1)。`/api/timetable/*` の3本が同じものを受ける。
 * `backend/app/api/timetable.py` の `TimetableContextRequest`。
 *
 * 課程コードと入学年度を `studentProfile` とは別に送る。履修要項を引くキーは
 * (課程コード, 入学年度)だが、`StudentProfile.program` に入るのは課程名であり
 * 識別子に使えず、入学年度はプロファイルに無いためである(§4.4.2、`lib/programs.ts`)。
 */
export type TimetableContext = {
  studentProfile: StudentProfile;
  programCode: string;
  admissionYear: number;
  targetTerm: TargetTermBody;
  /** 今の時間割。学生が自分で入れた科目は `source: "student"` */
  timetable: ProposedCourse[];
  conditions: TimetableConditions;
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

/** SSE の本文以外のイベントを受け取る口。どれも省略できる */
export type AgentStreamHandlers = {
  onDelta?: (delta: string) => void;
  onThinking?: (thinking: string) => void;
  onActivity?: (activity: AgentActivity) => void;
};

/** 時間割のアシスタントだけが流すイベントの口 */
export type TimetableStreamHandlers = AgentStreamHandlers & {
  /** 組み立てが始まった。続いて `onStep` が手順の数だけ、最後に `onTimetable` が来る */
  onBuild?: (build: { mode: BuildMode }) => void;
  onStep?: (step: TimetableStep) => void;
  onTimetable?: (timetable: BuiltTimetable) => void;
  onConditions?: (conditions: TimetableConditions) => void;
};

/**
 * SSE の共通処理(§6.1.1)。`delta` を連結して全文を返し、ほかのイベントは口に渡す。
 *
 * `error` は表示用の文言だけを載せたイベントで、SSE を開いた後の失敗を伝える
 * (状態コードでは返せないため)。呼び出し側が catch できるよう例外にする。
 */
async function streamAgent(
  path: string,
  body: unknown,
  handlers: TimetableStreamHandlers,
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
        handlers.onDelta?.(event.delta);
      } else if (typeof event.thinking === "string") {
        handlers.onThinking?.(event.thinking);
      } else if (isObject(event.activity)) {
        handlers.onActivity?.(event.activity as AgentActivity);
      } else if (isObject(event.build)) {
        handlers.onBuild?.(event.build as { mode: BuildMode });
      } else if (isObject(event.step)) {
        handlers.onStep?.(event.step as TimetableStep);
      } else if (isObject(event.timetable)) {
        handlers.onTimetable?.(event.timetable as BuiltTimetable);
      } else if (isObject(event.conditions)) {
        handlers.onConditions?.(event.conditions as TimetableConditions);
      } else if (typeof event.error === "string") {
        failure.message = event.error;
      }
    },
    signal,
  );

  if (failure.message) throw new Error(failure.message);
  return full;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** `POST /api/chat/syllabus/{code}`(講義単位チャット)のSSEを受信する。 */
export function streamCourseChat(
  code: string,
  body: ChatRequest,
  handlers: AgentStreamHandlers,
  signal?: AbortSignal,
): Promise<string> {
  return streamAgent(`/chat/syllabus/${encodeURIComponent(code)}`, body, handlers, signal);
}

/** `POST /api/chat/syllabus`(シラバス全体チャット)のSSEを受信する。 */
export function streamSyllabusChat(
  body: ChatRequest,
  handlers: AgentStreamHandlers,
  signal?: AbortSignal,
): Promise<string> {
  return streamAgent("/chat/syllabus", body, handlers, signal);
}

/**
 * `POST /api/timetable/assistant`(時間割の画面の会話のすべて。§7.2)のSSEを受信する。
 *
 * 質問だけの発話にも、時間割を組み直す発話にも、同じ口で答える。対話全体を
 * `messages` の1本で送り、末尾(role: user)が今回の発話である。時間割が空でも成立する。
 */
export function streamTimetableAssistant(
  body: TimetableContext & { messages: Pick<ChatMessage, "role" | "content">[] },
  handlers: TimetableStreamHandlers,
  signal?: AbortSignal,
): Promise<string> {
  return streamAgent("/timetable/assistant", body, handlers, signal);
}

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return (await res.json()) as T;
}

/** `/api/timetable/build` の応答 */
export type BuildResponse = {
  timetable: ProposedCourse[];
  totalCredits: number;
  report: TimetableReport;
  /** 組み立てで実際に使った条件(全休の曜日を backend が選んだときはその曜日が入る) */
  conditions: TimetableConditions;
  steps: TimetableStep[];
  /** レポートから backend が作った決まった説明(「希望条件なしで提案する」の吹き出し) */
  message: string;
};

/**
 * `POST /api/timetable/build`。条件から時間割を組み立てる(§7.2)。モデルを呼ばないので
 * 数秒で返る。`rebuild` は学生が入れた科目だけを残して組み直し、`adjust` は今の時間割を
 * 残して条件に反する分を直す。`remove` は条件に反する分を外すだけで、空いた分を埋めない
 */
export function buildTimetable(
  body: TimetableContext & { mode?: BuildMode },
  signal?: AbortSignal,
): Promise<BuildResponse> {
  return postJson("/timetable/build", body, signal);
}

/** `POST /api/timetable/check`。与えた時間割のレポート(学生が手で直した後の事実) */
export async function checkTimetable(
  body: TimetableContext,
  signal?: AbortSignal,
): Promise<TimetableReport> {
  const res = await postJson<{ report: TimetableReport }>("/timetable/check", body, signal);
  return res.report;
}
