import { create } from "zustand";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
  items?: { name: string; note: string }[];
  streaming?: boolean;
};

type ChatStore = {
  proposalMessages: ChatMessage[];
  syllabusMessages: ChatMessage[];
  // 講義コードをキーにした講義単位チャット
  courseMessages: Record<string, ChatMessage[]>;

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
  proposalMessages: [],
  syllabusMessages: [],
  courseMessages: {},

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
    set({ proposalMessages: [], syllabusMessages: [], courseMessages: {} }),
}));
