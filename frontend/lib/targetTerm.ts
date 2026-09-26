import { useMemo } from "react";
import { useStudentStore, type StudentProfile } from "@/lib/student";

/**
 * 次に履修登録する学期(履修提案の対象学期)。design.md §5.2.1 / §7.2。
 *
 * **提案するのは、取り込んだ成績表の次の学期である。** 学生は提案を受ける直前の
 * 学期の成績表を取り込む前提であり、学期は成績表から一意に決まる。**画面では
 * 表示するだけで、選び直させない。**
 *
 * **成績の有無からは推定しない。** 「最新の成績の次の学期」は、休学・留学などで
 * 成績が1件も付かなかった学期があると1年前の学期を指してしまう。成績表には成績と
 * 無関係に学期を決められる欄が2つあるので、それを使う。
 *
 * 1. **在籍年数**(`profile.enrollment.enrolledYears`)— 在籍年数×2 が入学から
 *    経過した学期数なので、入学年度の前期からその数だけ進めた学期が次の学期。
 *    成績表が何学期ぶんかをそのまま表す値であり、**休学中も増える**(在学年数 =
 *    在籍年数 − 休学年数)ので休学を挟んでもずれない。これを正とする
 * 2. **作成日**(`profile.issuedOn`)— 在籍年数が読めなかったときに使う。月で決める。
 *    4月は前期の登録期間、5〜9月は後期、10〜3月は翌年度の前期
 *
 * 実物4枚(2024・2025・2026年の9月作成、2026年3月作成)では両者は一致した。
 * どちらも無い(手入力・デモ)ときだけ今日の日付で決め、画面でその旨を示す。
 */

export type HalfTerm = "前期" | "後期";

/** `year` は**年度**(4月始まり)。2027年3月は 2026年度 */
export type TargetTerm = { year: number; term: HalfTerm };

export type TargetTermBasis = "enrollment" | "issuedOn" | "today";

export type TargetTermEstimate = {
  target: TargetTerm;
  /** 何から決めたか。`today` は成績表が無い(手入力・デモ)ときだけ */
  basis: TargetTermBasis;
};

export function termLabel(t: TargetTerm): string {
  return `${t.year}年度 ${t.term}`;
}

/** 年度内の通し番号(前期=0, 後期=1)を年度をまたいで数えるための値 */
function ordinal(t: TargetTerm): number {
  return t.year * 2 + (t.term === "後期" ? 1 : 0);
}

function fromOrdinal(n: number): TargetTerm {
  return { year: Math.floor(n / 2), term: n % 2 === 0 ? "前期" : "後期" };
}

export function shiftTerm(t: TargetTerm, by: number): TargetTerm {
  return fromOrdinal(ordinal(t) + by);
}

/** 暦日から、その日に次に登録する学期を決める */
export function termFromDate(date: { year: number; month: number }): TargetTerm {
  const fiscalYear = date.month >= 4 ? date.year : date.year - 1;
  if (date.month === 4) return { year: fiscalYear, term: "前期" };
  if (date.month >= 5 && date.month <= 9) return { year: fiscalYear, term: "後期" };
  return { year: fiscalYear + 1, term: "前期" };
}

/** 入学年度と在籍年数(0.5 年刻み)から、次に登録する学期を決める */
export function termFromEnrollment(admissionYear: number, enrolledYears: number): TargetTerm {
  return shiftTerm({ year: admissionYear, term: "前期" }, Math.round(enrolledYears * 2));
}

function parseIssuedOn(issuedOn: string): { year: number; month: number } | null {
  const m = issuedOn.match(/^(\d{4})-(\d{2})-\d{2}$/);
  return m ? { year: parseInt(m[1], 10), month: parseInt(m[2], 10) } : null;
}

function fiscalYearOf(date: { year: number; month: number }): number {
  return date.month >= 4 ? date.year : date.year - 1;
}

function today(now: Date): { year: number; month: number } {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/** プロファイルから次の登録学期(成績表の次の学期)を決める */
export function estimateTargetTerm(
  profile: Pick<StudentProfile, "issuedOn" | "enrollment" | "admissionYear"> | null,
  now: Date = new Date(),
): TargetTermEstimate {
  if (profile?.enrollment && profile.admissionYear != null) {
    return {
      target: termFromEnrollment(profile.admissionYear, profile.enrollment.enrolledYears),
      basis: "enrollment",
    };
  }
  const issued = profile?.issuedOn ? parseIssuedOn(profile.issuedOn) : null;
  if (issued) return { target: termFromDate(issued), basis: "issuedOn" };
  return { target: termFromDate(today(now)), basis: "today" };
}

/**
 * 対象学期の学年。プロファイルの `grade` は**成績表の作成時点**(手入力・デモは
 * 今日時点)の学年なので、対象学期が次の年度に入るぶんだけ繰り上げる。
 *   例: 2027年3月作成(2026年度・3回生)の成績表で 2027年度前期 → 4回生
 * 休学による据え置きは考慮しない(学年欄が作成時点の学年を持つため、影響するのは
 * 作成後に休学した場合だけである)。
 */
export function gradeAt(
  profile: Pick<StudentProfile, "grade" | "issuedOn"> | null,
  target: TargetTerm,
  now: Date = new Date(),
): 1 | 2 | 3 | 4 | null {
  if (!profile || profile.grade == null) return null;
  const issued = profile.issuedOn ? parseIssuedOn(profile.issuedOn) : null;
  const reference = fiscalYearOf(issued ?? today(now));
  const grade = profile.grade + (target.year - reference);
  return Math.min(4, Math.max(1, grade)) as 1 | 2 | 3 | 4;
}

/**
 * 画面が使う対象学期。`grade` は対象学期の学年(`gradeAt()`)で、履修提案に渡す。
 * 学生が選び直すことはない(成績表の次の学期に固定)。
 */
export function useTargetTerm() {
  const profile = useStudentStore((s) => s.profile);
  const { target, basis } = useMemo(() => estimateTargetTerm(profile), [profile]);
  return { target, basis, grade: gradeAt(profile, target) };
}
