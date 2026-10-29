"use client";

import { useMemo } from "react";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { useCreditSummary } from "@/lib/creditSummary";
import {
  courseDestinations,
  isUnmatched,
  shortSlotName,
  UNCOUNTED_REASON_LABEL,
  type CourseDestination,
  type UncountedCourse,
} from "@/lib/requirements";
import { useStudentStore, type Course } from "@/lib/student";

/**
 * マイデータの卒業要件の内訳(design.md §8.4.1)。PC(`PcMyDataPage.tsx`)とモバイル
 * (`MobileSettingsPage.tsx`)が共用する。
 *
 * **修得済みの科目ごとに、判定がその単位をどの枠に数えたか・数えなかったかを出す。**
 * 卒業要件の帯の数字が成績表と合わないとき、学生と開発者がその場で原因を切り分けられる
 * ようにするためである。成績表にある科目が
 *
 * - 修得済み科目に無い(名前が崩れている) → 成績表の読み取りの誤り
 * - 「卒業要件に数えていない」に出る → 判定か履修要項データの誤り(理由が出る)
 * - 想定と違う枠に数えられている → 枠への割り当ての誤り
 *
 * のどれかになる。判定はヘッダーと帯が使っているもの(`useCreditSummary()`)をそのまま使い、
 * 手元で判定し直さない。
 */
export function useCreditAccounting(): {
  destinations: Map<Course, CourseDestination[]>;
  uncounted: UncountedCourse[];
  earnedCredits: number;
} | null {
  const profile = useStudentStore((s) => s.profile);
  const { requirements } = useCreditSummary();
  return useMemo(() => {
    if (!profile || requirements.status !== "ready") return null;
    return {
      destinations: courseDestinations(
        profile.completedCourses,
        requirements.counted,
        requirements.uncounted,
      ),
      uncounted: requirements.uncounted,
      earnedCredits: requirements.earnedCredits,
    };
  }, [profile, requirements]);
}

/** 0.5 単位の科目があるので、整数でなければ小数1桁で出す */
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * 修得済みの科目の下に添える1行。数えた枠の短い名前と、数えなかった分の理由を出す。
 * 枠をまたいで分かれた科目・一部だけ数えた科目は、単位数を添えて並べる。
 * 突き合わせられなかった分(`isUnmatched()`)だけを注意の色にし、規定で数えない分は地の色で出す
 */
export function DestinationNote({ dests }: { dests: CourseDestination[] | undefined }) {
  if (!dests || dests.length === 0) return null;
  const split = dests.length > 1;
  return (
    <>
      {dests.map((d, i) =>
        d.kind === "slot" ? (
          <span key={i} className="text-fg-secondary">
            {split
              ? `${shortSlotName(d.name)}に${fmt(d.credits)}単位`
              : `${shortSlotName(d.name)}に算入`}
          </span>
        ) : (
          <span
            key={i}
            className={`flex items-start gap-1 ${isUnmatched(d.reason) ? "text-tag-selective-fg" : "text-fg-tertiary"}`}
          >
            {isUnmatched(d.reason) && (
              <TriangleAlert size={11} className="mt-px shrink-0" aria-hidden="true" />
            )}
            <span>
              {split ? `${fmt(d.credits)}単位は` : ""}卒業要件に数えていません。
              {UNCOUNTED_REASON_LABEL[d.reason]}
            </span>
          </span>
        ),
      )}
    </>
  );
}

/** 卒業要件に数えていない科目の1行(科目名・単位・理由) */
function UncountedRow({ course }: { course: UncountedCourse }) {
  const unmatched = isUnmatched(course.reason);
  return (
    <li className="flex items-start gap-2.5">
      {unmatched && (
        <TriangleAlert size={14} className="mt-0.5 shrink-0 text-tag-selective-fg" aria-hidden="true" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13px] font-semibold text-fg-primary">{course.title}</span>
        <span
          className={`text-[11px] leading-snug ${unmatched ? "text-tag-selective-fg" : "text-fg-tertiary"}`}
        >
          {UNCOUNTED_REASON_LABEL[course.reason]}
        </span>
      </div>
      <span className="shrink-0 text-[11px] text-fg-secondary">{fmt(course.credits)}単位</span>
    </li>
  );
}

/** 件数と単位数(見出し) */
function count(courses: UncountedCourse[]): string {
  const credits = courses.reduce((sum, c) => sum + c.credits, 0);
  return `${courses.length}件・${fmt(credits)}単位`;
}

/**
 * 卒業要件に数えていない科目の2つの囲み。PC とモバイルで同じものを出し、外枠だけ変える。
 *
 * - **突き合わせられなかった科目**(`isUnmatched()`)は開いて注意の色で出す。成績表では
 *   卒業要件に数えられているなら、科目名の表記の違いか履修要項データの誤りである
 * - **規定で数えていない科目**(余剰・算入上限・重複・随意)は畳む。取得単位と卒業要件に
 *   数える単位の差の内訳で、4回生なら余剰だけで20件を超える。開いて並べると、
 *   突き合わせられなかった科目が埋もれる
 */
export function UncountedPanels({
  uncounted,
  frame,
}: {
  uncounted: UncountedCourse[];
  /** 囲みの外枠(角丸・罫線・余白)。色はここで決める */
  frame: string;
}) {
  const unmatched = uncounted.filter((c) => isUnmatched(c.reason));
  const ruled = uncounted.filter((c) => !isUnmatched(c.reason));
  return (
    <>
      {unmatched.length > 0 && (
        <section className={`flex flex-col gap-3 border-tag-selective-border bg-tag-selective-bg ${frame}`}>
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-fg-primary">
              履修要項と突き合わせられなかった科目（{count(unmatched)}）
            </h2>
            <p className="text-xs leading-[1.6] text-fg-secondary">
              卒業要件に数えていません。成績表では卒業要件に数えられているなら、科目名の表記の違いか、このサービスの履修要項データの誤りです。
            </p>
          </div>
          <ul className="flex flex-col gap-2.5">
            {unmatched.map((c, i) => (
              <UncountedRow key={`${c.title}-${i}`} course={c} />
            ))}
          </ul>
        </section>
      )}
      {ruled.length > 0 && (
        <details className={`group border-border-primary bg-surface-primary ${frame}`}>
          <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
            <ChevronRight
              size={14}
              className="shrink-0 text-fg-secondary transition-transform group-open:rotate-90"
              aria-hidden="true"
            />
            <span className="text-sm font-semibold text-fg-primary">
              規定で卒業要件に数えていない科目（{count(ruled)}）
            </span>
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            <p className="text-xs leading-[1.6] text-fg-secondary">
              枠からあふれた余剰・算入の上限・同じ名前の科目・随意科目など、履修要項の規定どおり数えていない単位です。取得単位と卒業要件に数える単位の差の内訳です。
            </p>
            <ul className="flex flex-col gap-2.5">
              {ruled.map((c, i) => (
                <UncountedRow key={`${c.title}-${i}`} course={c} />
              ))}
            </ul>
          </div>
        </details>
      )}
    </>
  );
}

/**
 * 修得済み科目の一覧に添える説明。読み取りの誤りは判定の結果に現れない(判定に届かない)ので、
 * 成績表と見比べてもらうしかない
 */
export const ACCOUNTING_HINT =
  "科目ごとに、卒業要件のどの枠に数えたかを出しています。成績表にあるのにこの一覧に無い科目・名前が崩れている科目は、成績表の読み取りで落ちています（「科目を訂正」で直せます）。";
