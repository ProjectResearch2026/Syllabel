import { create } from "zustand";

type SyllabusUIStore = {
  activeTag: string;
  setActiveTag: (tag: string) => void;
};

export const useSyllabusUIStore = create<SyllabusUIStore>((set) => ({
  activeTag: "すべて",
  setActiveTag: (tag) => set({ activeTag: tag }),
}));
