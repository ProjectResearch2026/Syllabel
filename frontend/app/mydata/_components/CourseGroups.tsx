"use client";

import { useEffect, useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { useCreditSummary } from "@/lib/creditSummary";
import { groupCoursesBySlot, type SlotGroup, type UncountedGroupItem } from "@/lib/courseGroups";
import { programCodeOf, resolveAdmissionYear } from "@/lib/programs";
import { isUnmatched, UNCOUNTED_REASON_LABEL } from "@/lib/requirements";
import { useStudentStore } from "@/lib/student";
import { fetchCurricula, type CurriculaCourse } from "@/lib/syllabus-api";

/**
 * マイデータの修得済み科目を卒業要件の枠ごとに並べる(design.md §8.4.1)。PC
 * (`PcMyDataPage.tsx`)とモバイル(`MobileSettingsPage.tsx`)が共用する。
 *
 * 判定はヘッダーと時間割の帯が使っているもの(`useCreditSummary()`)をそのまま使い、
 * 枠の名前・並び・単位数を帯とそろえる。判定が届くまで(届かないとき)は null を返し、
 * 呼び出し側は従来の一覧を出す。
 */
export function useCourseGroups(): {
  slots: SlotGroup[];
  uncounted: UncountedGroupItem[];
} | null {
  const profile = useStudentStore((s) => s.profile);
  const { requirements } = useCreditSummary();
  const curriculum = useCurriculumCourses();
  return useMemo(() => {
    if (!profile || requirements.status !== "ready") return null;
    return groupCoursesBySlot(
      profile.completedCourses,
      requirements.slots.map((s) => s.key),
      requirements.counted,
      requirements.uncounted,
      curriculum,
    );
  }, [profile, requirements, curriculum]);
}

/**
 * 区分を引くための履修要項の科目。学部フリーゾーン・オールフリーゾーンの科目に区分を添えるだけに
 * 使うので、引けないあいだ・引けなかったときは空のまま進める(区分を添えないだけ)。
 * `GET /api/curricula` は ETag が効くので、検索画面と同じ要求はブラウザのキャッシュで済む
 */
function useCurriculumCourses(): CurriculaCourse[] {
  const profile = useStudentStore((s) => s.profile);
  const programCode = programCodeOf(profile?.program);
  const admissionYear = resolveAdmissionYear(profile);
  const key = `${programCode ?? ""}:${admissionYear ?? ""}`;
  const [fetched, setFetched] = useState<{ key: string; courses: CurriculaCourse[] } | null>(null);

  useEffect(() => {
    if (!programCode || !admissionYear) return;
    let active = true;
    fetchCurricula(programCode, admissionYear)
      .then((data) => {
        if (active) setFetched({ key, courses: data.courses });
      })
      .catch(() => {
        // 区分を添えないだけで、枠ごとの並びはそのまま出す
      });
    return () => {
      active = false;
    };
  }, [programCode, admissionYear, key]);

  return useMemo(() => (fetched?.key === key ? fetched.courses : []), [fetched, key]);
}

/** 0.5 単位の科目があるので、整数でなければ小数1桁で出す */
export function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** その枠に数えた単位。科目の単位が枠に分かれたときは「4単位のうち2単位」とする */
export function creditText(credits: number, total: number | undefined): string {
  return total == null || total === credits
    ? `${fmt(credits)}単位`
    : `${fmt(total)}単位のうち${fmt(credits)}単位`;
}

/** 枠の見出しの単位数。足りない枠は不足を添える */
export function SlotCredits({ group, className = "" }: { group: SlotGroup; className?: string }) {
  const rest = group.required - group.earned;
  return (
    <span className={`shrink-0 tabular-nums ${className}`}>
      <span className="font-semibold text-fg-primary">{fmt(group.earned)}</span>
      <span className="text-fg-muted"> / {group.required}単位</span>
      {rest > 0 && <span className="ml-1.5 text-accent">あと{fmt(rest)}単位</span>}
    </span>
  );
}

/** 卒業要件に数えていない科目の見出し(件数・単位数) */
export function uncountedHeading(items: UncountedGroupItem[]): string {
  const credits = items.reduce((sum, i) => sum + i.credits, 0);
  return `卒業要件に数えていない科目（${items.length}件・${fmt(credits)}単位）`;
}

/**
 * 数えていない理由。履修要項と突き合わせられなかった科目(`isUnmatched()`)は、成績表では
 * 数えられている単位を落としているおそれがあるので、注意の色と印で出す
 */
export function UncountedReasonText({ item, className = "" }: { item: UncountedGroupItem; className?: string }) {
  const unmatched = isUnmatched(item.reason);
  return (
    <span
      className={`flex items-start gap-1 leading-snug ${
        unmatched ? "text-tag-selective-fg" : "text-fg-tertiary"
      } ${className}`}
    >
      {unmatched && <TriangleAlert size={11} className="mt-px shrink-0" aria-hidden="true" />}
      {UNCOUNTED_REASON_LABEL[item.reason]}
    </span>
  );
}
