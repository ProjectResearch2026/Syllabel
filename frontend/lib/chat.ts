import { create } from "zustand";
import type { ProposedCourse } from "@/lib/chatApi";

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
  streaming?: boolean;
};

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
