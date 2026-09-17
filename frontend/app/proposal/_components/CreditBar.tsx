"use client";

import { Calendar } from "lucide-react";
import { useStudentStore } from "@/lib/student";
import { useProposalStore } from "@/lib/proposal";
import { useGraduationCredits } from "@/lib/curricula";

function currentSemesterLabel(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const academicYear = month >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  const term = month >= 4 && month <= 8 ? "前期" : "後期";
  return `${academicYear}年度 ${term}`;
}

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
    <div className="flex h-12 shrink-0 items-center justify-between rounded-b-lg bg-surface-primary px-8">
      <div className="flex items-center gap-8">
        {items.map(({ val, label, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`font-mono text-xl font-bold ${color}`}>{val}</span>
            <span className="text-xs text-fg-tertiary">{label}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Calendar size={16} className="text-accent" />
        <span className="text-[13px] font-semibold text-fg-primary">{currentSemesterLabel()}</span>
      </div>
    </div>
  );
}
