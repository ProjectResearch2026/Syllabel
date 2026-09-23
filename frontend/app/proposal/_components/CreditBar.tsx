"use client";

import { useStudentStore } from "@/lib/student";
import { useProposalStore } from "@/lib/proposal";
import { useGraduationCredits } from "@/lib/curricula";
import TargetTermSelect from "./TargetTermSelect";

export default function CreditBar() {
  const profile = useStudentStore((s) => s.profile);
  const { status, totalCredits } = useProposalStore();
  const graduationCredits = useGraduationCredits(profile);

  const completedCredits = profile
    ? profile.completedCourses
        .filter((c) => c.status === "passed")
        .reduce((sum, c) => sum + c.credits, 0)
    : null;

  const currentCredits = status === "done" ? totalCredits : null;

  const remainingCredits =
    completedCredits != null
      ? Math.max(0, graduationCredits - completedCredits - (currentCredits ?? 0))
      : null;

  const items = [
    {
      val: completedCredits !== null ? String(completedCredits) : "—",
      label: "取得済み単位",
      color: "text-fg-primary",
    },
    {
      val: currentCredits !== null ? String(currentCredits) : "—",
      label: "今期登録単位",
      color: "text-accent",
    },
    {
      val: remainingCredits !== null ? String(remainingCredits) : "—",
      label: "卒業残り単位",
      color: "text-[#5F6B7A]",
    },
  ];

  return (
    /* ヘッダーカードの直下に貼り付き、下だけ角を丸めて1枚のカードに見せる */
    <div className="flex min-h-12 shrink-0 items-center justify-between rounded-b-lg bg-surface-primary px-8 py-1">
      <div className="flex items-center gap-8">
        {items.map(({ val, label, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`tabular-nums text-xl font-bold ${color}`}>{val}</span>
            <span className="text-xs text-fg-tertiary">{label}</span>
          </div>
        ))}
      </div>
      {/* 提案する学期。ブラウザの今日の日付ではなく成績表から推定する(lib/targetTerm.ts) */}
      <TargetTermSelect disabled={status === "loading"} />
    </div>
  );
}
