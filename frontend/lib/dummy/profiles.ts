import type { Course, CourseTerm, StudentProfile } from "@/lib/student";
import type { HalfTerm } from "@/lib/targetTerm";

/**
 * 展示用のダミー学生プロファイル（龍谷祭のデモ。要件§7）。
 *
 * **課程6 × 提案を受ける学年4 × 提案する学期2 = 48件。** 来場者は学年・課程・学期を
 * 選ぶ。学期の初期値は今日の日付から決める（`defaultDemoTerm()`）。
 *
 * 中身は `profiles.json` で、`backend/scripts/generate_dummy_profiles.py` が履修要項
 * （`curricula/`）と api-clean の開講実績から生成する（手で書き換えない）。
 * 生成物が履修要項と食い違わないことは `backend/tests/test_dummy_profiles.py` が確かめる。
 *
 * - **提案する学期はすべて 2026年度**（開講科目データ `offerings/` が 2026年度分だけ）。
 *   入学年度は学年から決まり、2026年度に1年生なら 2026年度入学、4年生なら 2023年度入学
 * - 成績は提案する学期の直前の学期まで付いている。前期の提案は3月中旬、後期の提案は
 *   9月初旬に公開される成績表にあたる
 * - **1年前期は入学直後で成績が1件も無い**（成績表がまだ無い）
 * - おおむね3人に1人が不合格の科目を、5人に1人が履修辞退（J）の科目を持つ。
 *   落とした必修は、次に同じ学期が来たときに再履修している
 *
 * 48件ぶん（約100KB）をはじめから読み込まないよう、選んだときに `import()` する。
 */

export type DemoKey = {
  programCode: string;
  /** 提案を受ける学年 */
  grade: 1 | 2 | 3 | 4;
  /** 提案する学期 */
  term: HalfTerm;
};

/** 科目は成績の評価ではなく履修状態で持つ(生成スクリプトが決める。design.md §5.2.1) */
type Row = [title: string, year: number, term: CourseTerm, credits: number, status: Course["status"]];

type DemoRecord = DemoKey & {
  program: string;
  admissionYear: number;
  courses: Row[];
};

type DemoFile = { targetYear: number; profiles: DemoRecord[] };

/** 学年・課程・学期から1件を読み込む */
export async function loadDemoProfile(key: DemoKey): Promise<StudentProfile> {
  const data = (await import("./profiles.json")).default as DemoFile;
  const hit = data.profiles.find(
    (p) => p.programCode === key.programCode && p.grade === key.grade && p.term === key.term,
  );
  if (!hit) throw new Error(`ダミーデータがありません: ${key.programCode} ${key.grade}年 ${key.term}`);
  return {
    grade: hit.grade,
    admissionYear: hit.admissionYear,
    program: hit.program,
    completedCourses: hit.courses.map(([title, year, term, credits, status]) => ({
      title,
      year,
      term,
      credits,
      status,
    })),
    demo: { key, target: { year: data.targetYear, term: hit.term } },
  };
}

/**
 * 学期の初期値。**成績表の公開(3月中旬・9月初旬)に合わせて3〜8月は前期、9〜2月は後期**
 * とする。ダミーはその日に手に入る最新の成績表を持つ学生なので、公開前の成績表を
 * 持たせないよう公開の月で切り替える
 */
export function defaultDemoTerm(now: Date = new Date()): HalfTerm {
  const month = now.getMonth() + 1;
  return month >= 3 && month <= 8 ? "前期" : "後期";
}

/** 選択肢の見出し。1年前期は成績が無いので、そうと分かる名前にする */
export function demoLabel(key: Pick<DemoKey, "grade" | "term">): string {
  return key.grade === 1 && key.term === "前期" ? "1年前期（新入生・成績なし）" : `${key.grade}年${key.term}`;
}

/** 成績が1件も無いデモの学生(1年前期)か */
export function isFreshmanDemo(profile: StudentProfile | null | undefined): boolean {
  return profile?.demo != null && profile.completedCourses.length === 0;
}

/** デモの学生が提案を受ける年度。`profiles.json` の `targetYear` と同じ値に保つ */
export const DEMO_TARGET_YEAR = 2026;

/**
 * `demoSummary()` の短い版。時間割の画面の「提案する学期」に添える1行で、スマホでは
 * これが2行に折れると時間割の5限がボトムドックの下に隠れていた
 */
export function demoShortSummary(key: Pick<DemoKey, "grade" | "term">): string {
  if (key.grade === 1 && key.term === "前期") return "デモ：入学直後（成績なし）";
  const admissionYear = DEMO_TARGET_YEAR - key.grade + 1;
  const last = key.term === "前期" ? `${key.grade - 1}年後期` : `${key.grade}年前期`;
  return `デモ：${admissionYear}年度入学・${last}までの成績`;
}

/**
 * デモの学生がどんな学生かの一文。提案する学期が過ぎていても不自然にならないよう、
 * **いつの時点の学生か**を言う(龍谷祭は10月頃で、前期の学生の提案はもう終わった学期になる)
 */
export function demoSummary(key: Pick<DemoKey, "grade" | "term">): string {
  const admissionYear = DEMO_TARGET_YEAR - key.grade + 1;
  if (key.grade === 1 && key.term === "前期") {
    return `${DEMO_TARGET_YEAR}年4月に入学したばかりの学生です。成績はまだありません`;
  }
  const last = key.term === "前期" ? `${key.grade - 1}年後期` : `${key.grade}年前期`;
  return `${admissionYear}年度入学。${last}までの成績を持ち、${DEMO_TARGET_YEAR}年度${key.term}の履修を組む学生です`;
}
