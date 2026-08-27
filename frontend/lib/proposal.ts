import { create } from "zustand";
import type { ProposedCourse } from "@/lib/chatApi";

export type ProposalStatus = "idle" | "loading" | "done" | "error";

type ProposalStore = {
  status: ProposalStatus;
  courses: ProposedCourse[];
  totalCredits: number;
  message: string;
  setStatus: (status: ProposalStatus) => void;
  setResult: (courses: ProposedCourse[], totalCredits: number, message: string) => void;
  reset: () => void;
};

export const useProposalStore = create<ProposalStore>((set) => ({
  status: "idle",
  courses: [],
  totalCredits: 0,
  message: "",
  setStatus: (status) => set({ status }),
  setResult: (courses, totalCredits, message) =>
    set({ status: "done", courses, totalCredits, message }),
  reset: () => set({ status: "idle", courses: [], totalCredits: 0, message: "" }),
}));
