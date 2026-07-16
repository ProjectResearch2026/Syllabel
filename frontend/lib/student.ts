import { create } from "zustand";

export type CompletedCourse = {
  code: string;
  title: string;
  credits: number;
  grade: string;
};

export type StudentProfile = {
  grade: number;
  program: string;
  completedCourses: CompletedCourse[];
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
