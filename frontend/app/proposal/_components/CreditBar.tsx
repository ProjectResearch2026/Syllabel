"use client";

import { Calendar } from "lucide-react";
import { useStudentStore } from "@/lib/student";

function currentSemesterLabel(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const academicYear = month >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  const term = month >= 4 && month <= 8 ? "前期" : "後期";
  return `${academicYear}年度 ${term}`;
}

export default function CreditBar() {
  const profile = useStudentStore((s) => s.profile);

  const completedCredits = profile
    ? profile.completedCourses
        .filter((c) => c.status === "passed")
        .reduce((sum, c) => sum + c.credits, 0)
    : null;

  const items = [
    {
      val: completedCredits !== null ? String(completedCredits) : "—",
      label: "取得済み単位",
      color: "text-[#1A2B4E]",
    },
    {
      // 履修提案API接続後に動的値に置き換える
      val: "—",
      label: "今期登録単位",
      color: "text-[#E60012]",
    },
    {
      // GET /api/curricula で卒業要件取得後に算出する
      val: "—",
      label: "卒業残り単位",
      color: "text-[#5F6B7A]",
    },
  ];

  return (
    <div className="flex items-center justify-between px-8 h-12 bg-white border-b border-[#D1D5DB] shrink-0">
      <div className="flex items-center gap-8">
        {items.map(({ val, label, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`text-xl font-bold font-mono ${color}`}>{val}</span>
            <span className="text-[#6B7280] text-xs">{label}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Calendar size={16} className="text-[#E60012]" />
        <span className="text-[#1A2B4E] text-sm font-semibold">{currentSemesterLabel()}</span>
      </div>
    </div>
  );
}
