"use client";

import { CalendarCheck } from "lucide-react";
import { useStudentStore } from "@/lib/student";
import { useProposalStore } from "@/lib/proposal";

export default function ContextBanner() {
  const profile = useStudentStore((s) => s.profile);
  const { status, totalCredits } = useProposalStore();

  if (!profile) {
    return (
      <div className="flex items-center gap-2.5 px-4 py-2.5 bg-[#F8F9FA] border-l-[3px] border-[#D1D5DB] shrink-0">
        <CalendarCheck size={18} className="text-[#9CA3AF] shrink-0" />
        <span className="text-[#9CA3AF] text-xs">
          成績表を取り込むとデータが連携されます
        </span>
      </div>
    );
  }

  const earnedCredits = profile.completedCourses
    .filter((c) => c.status === "passed")
    .reduce((sum, c) => sum + c.credits, 0);

  const currentCredits = status === "done" ? totalCredits : null;

  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 bg-[#F8F9FA] border-l-[3px] border-[#E60012] shrink-0">
      <CalendarCheck size={18} className="text-[#E60012] shrink-0" />
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[#1A2B4E] text-xs font-semibold">時間割データ連携中</span>
        <span className="text-[#6B7280] text-[10px]">
          {currentCredits != null
            ? `今期登録${currentCredits}単位・取得済み${earnedCredits}単位を参照しています`
            : `取得済み${earnedCredits}単位を参照しています`}
        </span>
      </div>
    </div>
  );
}
