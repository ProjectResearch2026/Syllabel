import { create } from "zustand";
import type { DemoKey } from "@/lib/dummy/profiles";
import type { TargetTerm } from "@/lib/targetTerm";

export type CourseTerm =
  | "前期"
  | "後期"
  | "通年"
  | "1Q"
  | "2Q"
  | "3Q"
  | "4Q"
  | "サ集";

/**
 * 成績表に載る科目1件(design.md §5.2.1)。
 *
 * **成績の評価(点数・評価記号)は持たない。** 評価は取り込み時に合否(`status`)を
 * 決めるためだけにパーサーの中で使い、画面にも backend にも出さない(要件§4.2)。
 * 科目は科目名で識別する(卒業要件の判定もタグも、履修要項の科目名と突き合わせる)。
 */
export type Course = {
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
};

/**
 * 履修状態の表示名。科目の行のバッジに出す(成績の評価の代わり。design.md §5.2.1)。
 * 登録済みは成績発表を待っている科目なので「発表待ち」と言う
 */
export const COURSE_STATUS_LABEL: Record<Course["status"], string> = {
  passed: "合格",
  failed: "不合格",
  withdrawn: "履修辞退",
  registered: "発表待ち",
};

export type StudentProfile = {
  grade: 1 | 2 | 3 | 4 | null;
  /** PDF の入学日欄または学年欄から読み取った入学年度。マイデータで学年を変えたら今日基準で算出し直す */
  admissionYear: number | null;
  program: string | null;
  completedCourses: Course[];
  /**
   * 成績表の作成日(`YYYY-MM-DD`)。右上の月日と帳票ヘッダの年度から組み立てる。
   * **ダウンロード日ではない**(ポータルは作成済みの PDF を配る)。次の登録学期の
   * 推定に使う(`lib/targetTerm.ts`)。読み取れなかったとき・デモでは null
   */
  issuedOn?: string | null;
  /**
   * 成績表の「在籍年数 / 休学年数 / 在学年数」(0.5 年刻み)。**次の登録学期の決定には
   * 使わない** — 学期単位ではなく、その年度を丸1年と数える(2024年4月入学で 2026年9月
   * 作成は 3.0)ため学期が分からない(`lib/targetTerm.ts`)。読み取れなかったとき・デモでは null
   */
  enrollment?: EnrollmentYears | null;
  /**
   * デモの学生(`lib/dummy/profiles.ts`)だけが持つ。来場者が選んだ学年・課程・学期と、
   * 提案する学期。**デモでは提案する学期を今日の日付から決めない** — ダミーの成績は
   * 決まった時点のもので、日付で決めると成績の続きではない学期を提案してしまう。
   * `grade` はこのとき提案する学期の学年である
   */
  demo?: { key: DemoKey; target: TargetTerm } | null;
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
