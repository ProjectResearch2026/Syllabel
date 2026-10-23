import { create } from "zustand";
import type { AgentActivity, AgentStreamHandlers, ProposedCourse } from "@/lib/chatApi";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
  items?: { name: string; note: string }[];
  /**
   * AIが返した候補科目。SSEに courses が含まれるときだけ入り、
   * AIシートの提案カード（ui-design_phone.pen STEP5 ProposalCard）として描画される。
   */
  proposals?: ProposedCourse[];
  /**
   * AI が考えている様子(思考とツールの呼び出し。design.md §8.3.7)。届いた順に並べ、
   * 吹き出しの本文の上に1行ずつ出す。思考の出ないモデル・設定では無い
   */
  trace?: TraceItem[];
  streaming?: boolean;
};

/**
 * AI が考えている様子の1項目。思考はツールの呼び出しを挟むたびに別の項目になる
 * (「考える → 検索する → 結果を読んで考える」を届いた順に見せる)。
 * `startedAt` / `endedAt` は `Date.now()` で、思考にかかった時間を出すのに使う。
 * `endedAt` が無いあいだは続いている
 */
export type TraceItem =
  | { kind: "thinking"; text: string; startedAt: number; endedAt?: number }
  | { kind: "tool"; activity: AgentActivity; startedAt: number; endedAt?: number };

/**
 * 末尾の答えを作り直す(再生成)ときの起点。末尾が答え終えた AI の吹き出しで、その直前が
 * 学生の発話のときだけ返す。案内や「希望条件なしで提案する」の説明は、学生の発話への
 * 答えではないので作り直さない。`prior` は学生の発話より前の会話で、作り直しはここに
 * 同じ発話(`text`)を送り直す — 失敗した答えも前の答えも、次のリクエストの履歴に載せない
 */
export function regenerateFrom(
  messages: ChatMessage[],
): { prior: ChatMessage[]; text: string } | null {
  const last = messages[messages.length - 1];
  const asked = messages[messages.length - 2];
  if (last?.role !== "assistant" || last.streaming || asked?.role !== "user") return null;
  return { prior: messages.slice(0, -2), text: asked.content };
}

/** 続いている項目を、いまの時刻で終える */
function closeOpen(trace: TraceItem[], now: number): TraceItem[] {
  return trace.map((item) => (item.endedAt === undefined ? { ...item, endedAt: now } : item));
}

/** 思考の断片を足す。直前が続いている思考ならつなげ、そうでなければ新しい項目にする */
export function appendThinking(trace: TraceItem[], delta: string, now: number): TraceItem[] {
  const last = trace[trace.length - 1];
  if (last?.kind === "thinking" && last.endedAt === undefined) {
    return [...trace.slice(0, -1), { ...last, text: last.text + delta }];
  }
  return [...closeOpen(trace, now), { kind: "thinking", text: delta, startedAt: now }];
}

/**
 * ツールの進み具合を足す。同じ呼び出し(`id`)の書きかけの引数は、前のものを置き換える
 * (書いているあいだ引数が伸びていくのを1行で見せる)
 */
export function upsertTool(trace: TraceItem[], activity: AgentActivity, now: number): TraceItem[] {
  const at = trace.findIndex((item) => item.kind === "tool" && item.activity.id === activity.id);
  if (at >= 0) {
    return trace.map((item, i) => (i === at ? { ...item, activity } as TraceItem : item));
  }
  // 思考はツールを呼ぶところで終わる。並べて呼ばれたツールどうしは終えない
  const closed = trace.map((item) =>
    item.kind === "thinking" && item.endedAt === undefined ? { ...item, endedAt: now } : item,
  );
  return [...closed, { kind: "tool", activity, startedAt: now }];
}

/**
 * 吹き出し1件に SSE の本文・思考・進み具合を流し込む口を作る。`patch` はその吹き出しを
 * 書き換える関数。`content()` は届いた本文の全体(空なら何も届かなかった)。
 *
 * **書き換えは画面の描画1回(1フレーム)にまとめる。** 本文・思考は1文字ずつ届くので、
 * 届くたびに store を書き換えると、会話の欄が描き直しに追われて表示が遅れる。
 * 受信を終えるときは `end()` で続いている項目を終え、溜まった分を当てる。失敗の文言を
 * 書く前には `flush()` で溜まった分を当てる(後から当たって上書きしないように)。
 */
export function replyStream(patch: (update: Partial<ChatMessage>) => void): {
  handlers: AgentStreamHandlers;
  content: () => string;
  flush: () => void;
  end: () => void;
} {
  let content = "";
  let trace: TraceItem[] = [];
  let pending: Partial<ChatMessage> = {};
  let scheduled: number | null = null;

  const flush = () => {
    if (scheduled !== null) {
      cancelFrame(scheduled);
      scheduled = null;
    }
    if (Object.keys(pending).length === 0) return;
    const update = pending;
    pending = {};
    patch(update);
  };
  const queue = (update: Partial<ChatMessage>) => {
    pending = { ...pending, ...update };
    if (scheduled === null) scheduled = requestFrame(flush);
  };
  // ツールの結果を読んで次に進んだ(本文か次の思考が来た)ら、ツールの項目を終える
  const closeTools = (now: number) => {
    if (trace.some((item) => item.kind === "tool" && item.endedAt === undefined)) {
      trace = trace.map((item) =>
        item.kind === "tool" && item.endedAt === undefined ? { ...item, endedAt: now } : item,
      );
    }
  };

  return {
    handlers: {
      onDelta: (delta) => {
        const now = Date.now();
        if (trace.some((item) => item.endedAt === undefined)) {
          trace = closeOpen(trace, now);
          queue({ trace });
        }
        content += delta;
        queue({ content });
      },
      onThinking: (delta) => {
        const now = Date.now();
        closeTools(now);
        trace = appendThinking(trace, delta, now);
        queue({ trace });
      },
      onActivity: (activity) => {
        trace = upsertTool(trace, activity, Date.now());
        queue({ trace });
      },
    },
    content: () => content,
    flush,
    end: () => {
      if (trace.some((item) => item.endedAt === undefined)) {
        trace = closeOpen(trace, Date.now());
        queue({ trace });
      }
      flush();
    },
  };
}

// 描画のたびに1回。タブが裏にあって requestAnimationFrame が止まるときに備え、無い環境では
// タイマーで代える
function requestFrame(callback: () => void): number {
  return typeof requestAnimationFrame === "function"
    ? requestAnimationFrame(callback)
    : (setTimeout(callback, 16) as unknown as number);
}

function cancelFrame(handle: number): void {
  if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(handle);
  else clearTimeout(handle);
}

type ChatStore = {
  /**
   * AIアシスタントシート（Ask Bar から開く一本の会話）の履歴。
   * ui-design_phone.pen「★ AI導線マップ」で AI専用タブを廃止したため、
   * 旧「AIチャット」タブの対話履歴はここが担う。
   */
  assistantMessages: ChatMessage[];
  proposalMessages: ChatMessage[];
  syllabusMessages: ChatMessage[];
  // 講義コードをキーにした講義単位チャット
  courseMessages: Record<string, ChatMessage[]>;

  addAssistantMessage: (message: ChatMessage) => void;
  setAssistantMessages: (messages: ChatMessage[]) => void;
  clearAssistantMessages: () => void;

  addProposalMessage: (message: ChatMessage) => void;
  setProposalMessages: (messages: ChatMessage[]) => void;
  clearProposalMessages: () => void;

  addSyllabusMessage: (message: ChatMessage) => void;
  setSyllabusMessages: (messages: ChatMessage[]) => void;
  clearSyllabusMessages: () => void;

  addCourseMessage: (code: string, message: ChatMessage) => void;
  setCourseMessages: (code: string, messages: ChatMessage[]) => void;
  clearCourseMessages: (code: string) => void;

  clearAll: () => void;
};

export const useChatStore = create<ChatStore>((set) => ({
  assistantMessages: [],
  proposalMessages: [],
  syllabusMessages: [],
  courseMessages: {},

  addAssistantMessage: (message) =>
    set((state) => ({ assistantMessages: [...state.assistantMessages, message] })),
  setAssistantMessages: (messages) => set({ assistantMessages: messages }),
  clearAssistantMessages: () => set({ assistantMessages: [] }),

  addProposalMessage: (message) =>
    set((state) => ({ proposalMessages: [...state.proposalMessages, message] })),
  setProposalMessages: (messages) => set({ proposalMessages: messages }),
  clearProposalMessages: () => set({ proposalMessages: [] }),

  addSyllabusMessage: (message) =>
    set((state) => ({ syllabusMessages: [...state.syllabusMessages, message] })),
  setSyllabusMessages: (messages) => set({ syllabusMessages: messages }),
  clearSyllabusMessages: () => set({ syllabusMessages: [] }),

  addCourseMessage: (code, message) =>
    set((state) => ({
      courseMessages: {
        ...state.courseMessages,
        [code]: [...(state.courseMessages[code] ?? []), message],
      },
    })),
  setCourseMessages: (code, messages) =>
    set((state) => ({
      courseMessages: { ...state.courseMessages, [code]: messages },
    })),
  clearCourseMessages: (code) =>
    set((state) => {
      const next = { ...state.courseMessages };
      delete next[code];
      return { courseMessages: next };
    }),

  clearAll: () =>
    set({
      assistantMessages: [],
      proposalMessages: [],
      syllabusMessages: [],
      courseMessages: {},
    }),
}));
