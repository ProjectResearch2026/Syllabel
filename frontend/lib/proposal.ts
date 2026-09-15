import { create } from "zustand";
import type { ProposedCourse } from "@/lib/chatApi";

export type ProposalStatus = "idle" | "loading" | "done" | "error";

type ProposalStore = {
  status: ProposalStatus;
  courses: ProposedCourse[];
  totalCredits: number;
  message: string;
  setStatus: (status: ProposalStatus) => void;
  /**
   * 組み立て途中の提案（`snapshot`）を反映する。status は "loading" のまま据え置き、
   * 時間割表だけを逐次描画させる（design.md §6.1.1 / §7.2）。
   */
  setSnapshot: (courses: ProposedCourse[], totalCredits: number, message: string) => void;
  setResult: (courses: ProposedCourse[], totalCredits: number, message: string) => void;
  reset: () => void;
};

export const useProposalStore = create<ProposalStore>((set) => ({
  status: "idle",
  courses: [],
  totalCredits: 0,
  message: "",
  setStatus: (status) => set({ status }),
  setSnapshot: (courses, totalCredits, message) => set({ courses, totalCredits, message }),
  setResult: (courses, totalCredits, message) =>
    set({ status: "done", courses, totalCredits, message }),
  reset: () => set({ status: "idle", courses: [], totalCredits: 0, message: "" }),
}));
