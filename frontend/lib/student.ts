import { create } from "zustand";

export type CourseTerm =
  | "前期"
  | "後期"
  | "通年"
  | "1Q"
  | "2Q"
  | "3Q"
  | "4Q"
  | "サ集";

export type Course = {
  code?: string;
  title: string;
  year: number;
  term: CourseTerm;
  credits: number;
  status: "passed" | "failed" | "withdrawn";
  rawScore?: string;
};

export type StudentProfile = {
  grade: 1 | 2 | 3 | 4 | null;
  /** PDF の入学日欄または学年欄から読み取った入学年度。手入力フォームでは今日基準で算出 */
  admissionYear: number | null;
  program: string | null;
  completedCourses: Course[];
};

type StudentStore = {
  profile: StudentProfile | null;
  setProfile: (profile: StudentProfile) => void;
  clearProfile: () => void;
};

export const useStudentStore = create<StudentStore>((set) => ({
  profile: null,
  setProfile: (profile) => set({ profile }),
  clearProfile: () => set({ profile: null }),
}));
