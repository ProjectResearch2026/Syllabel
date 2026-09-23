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
  /**
   * 履修状態。`registered` は成績表の `***`(登録科目)/ `*`(継続履修中)で、
   * **登録済みで成績が未確定**の科目である。修得でも未修得でもないため、単位計算にも
   * 【再履修の対象】にも入れず、履修提案の候補から外す(design.md §5.2.1)
   */
  status: "passed" | "failed" | "withdrawn" | "registered";
  rawScore?: string;
};

export type StudentProfile = {
  grade: 1 | 2 | 3 | 4 | null;
  /** PDF の入学日欄または学年欄から読み取った入学年度。手入力フォームでは今日基準で算出 */
  admissionYear: number | null;
  program: string | null;
  completedCourses: Course[];
  /**
   * 成績表の作成日(`YYYY-MM-DD`)。右上の月日と帳票ヘッダの年度から組み立てる。
   * **ダウンロード日ではない**(ポータルは作成済みの PDF を配る)。次の登録学期の
   * 推定に使う(`lib/targetTerm.ts`)。手入力・デモでは null
   */
  issuedOn?: string | null;
  /**
   * 成績表の「在籍年数 / 休学年数 / 在学年数」(0.5 年刻み)。在籍年数×2 が入学から
   * 経過した学期数で、成績の有無に左右されない。次の登録学期の検算に使う。
   * 手入力・デモでは null
   */
  enrollment?: EnrollmentYears | null;
};

export type EnrollmentYears = {
  enrolledYears: number;
  leaveYears: number | null;
  studyYears: number | null;
};

type StudentStore = {
  profile: StudentProfile | null;
  setProfile: (profile: StudentProfile) => void;
  clearProfile: () => void;
};

/**
 * 未修得(不合格・履修辞退)か。【再履修の対象】に当たる。**登録済み(`registered`)は
 * 含めない** — 成績が未確定なだけで、落としたわけではない
 */
export function isUnearned(course: Pick<Course, "status">): boolean {
  return course.status === "failed" || course.status === "withdrawn";
}

export const useStudentStore = create<StudentStore>((set) => ({
  profile: null,
  setProfile: (profile) => set({ profile }),
  clearProfile: () => set({ profile: null }),
}));
