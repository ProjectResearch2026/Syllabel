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
   * モデルの思考(SSE の `thinking`。design.md §6.1.1)。本文が届く前は吹き出しの中に
   * 小さく流し、本文が始まったら1行に畳む。思考が出ないモデル・設定では無い
   */
  thinking?: string;
  /** ツールの進み具合(SSE の `activity`)。呼び出しごとに1件で、届いた順 */
  activities?: AgentActivity[];
  streaming?: boolean;
};

/**
 * 進み具合を1件足す。同じ呼び出し(`id`)の書きかけの引数は、前のものを置き換える
 * (書いているあいだ引数が伸びていくのを1つのチップで見せる)
 */
export function upsertActivity(
  activities: AgentActivity[] | undefined,
  activity: AgentActivity,
): AgentActivity[] {
  const list = activities ?? [];
  const at = list.findIndex((a) => a.id === activity.id);
  if (at < 0) return [...list, activity];
  return list.map((a, i) => (i === at ? activity : a));
}

/**
 * 吹き出し1件に SSE の本文・思考・進み具合を流し込む口を作る。`patch` はその吹き出しを
 * 書き換える関数。`content()` は届いた本文の全体(空なら何も届かなかった)
 */
export function replyStream(patch: (update: Partial<ChatMessage>) => void): {
  handlers: AgentStreamHandlers;
  content: () => string;
} {
  let content = "";
  let thinking = "";
  let activities: AgentActivity[] = [];
  return {
    handlers: {
      onDelta: (delta) => {
        content += delta;
        patch({ content });
      },
      onThinking: (delta) => {
        thinking += delta;
        patch({ thinking });
      },
      onActivity: (activity) => {
        activities = upsertActivity(activities, activity);
        patch({ activities });
      },
    },
    content: () => content,
  };
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
