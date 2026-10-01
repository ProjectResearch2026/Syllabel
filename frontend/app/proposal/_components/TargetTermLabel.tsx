"use client";

import { Calendar } from "lucide-react";
import { termLabel, useTargetTerm } from "@/lib/targetTerm";
import { useStudentStore } from "@/lib/student";
import { demoShortSummary } from "@/lib/dummy/profiles";

/**
 * 履修提案の対象学期(次に登録する学期)の表示。design.md §8.3。
 *
 * **提案するのは取り込んだ成績表の次の学期であり、学生には選び直させない**
 * (`lib/targetTerm.ts`)。どの学期の提案かが分かるよう、見える場所に出すだけにする。
 * 成績表が無い手入力のときだけ今日の日付で決めるので、その旨を添える。デモの学生は
 * どの時点の学生かを添える(龍谷祭の時期には、前期の学生の提案はもう終わった学期になる)。
 */
export default function TargetTermLabel({
  variant = "pc",
}: {
  /** モバイルは単位バーの直下の1行（ui-design_phone.pen TargetTermRow） */
  variant?: "pc" | "mobile";
}) {
  const { target, basis } = useTargetTerm();
  const demo = useStudentStore((s) => s.profile?.demo);
  const hint =
    basis === "today"
      ? "今日の日付から決めています"
      : demo
        ? demoShortSummary(demo.key)
        : null;

  if (variant === "mobile") {
    return (
      <div className="flex flex-col gap-1 border-b border-border-primary bg-surface-primary px-4 py-2">
        <p className="flex items-center gap-2.5">
          <span className="text-xs font-bold text-fg-primary">提案する学期</span>
          <span className="text-xs font-bold text-fg-primary">{termLabel(target)}</span>
        </p>
        {hint && <span className="text-[10px] text-fg-faint">{hint}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <p className="flex items-center gap-2">
        <Calendar size={16} className="shrink-0 text-accent" aria-hidden="true" />
        <span className="text-xs text-fg-tertiary">提案する学期</span>
        <span className="text-[13px] font-semibold text-fg-primary">{termLabel(target)}</span>
      </p>
      {hint && <span className="text-[10px] text-fg-faint">{hint}</span>}
    </div>
  );
}
