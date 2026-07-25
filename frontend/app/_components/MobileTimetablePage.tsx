"use client";

import Link from "next/link";
import { Bell, FileUp } from "lucide-react";
import { useStudentStore } from "@/lib/student";

const GRADUATION_CREDITS = 124;
const DAYS = ["月", "火", "水", "木", "金"] as const;
const PERIODS = [1, 2, 3, 4, 5] as const;

export default function MobileTimetablePage() {
  const profile = useStudentStore((s) => s.profile);

  if (!profile) {
    return (
      <div className="flex flex-col bg-white min-h-full">
        <header className="sticky top-0 z-20 flex items-center justify-between px-5 h-14 bg-white border-b border-[#D1D5DB]">
          <span className="text-[#1A2B4E] text-xl font-bold">時間割</span>
          <Bell size={22} className="text-[#1A2B4E]" />
        </header>

        <div className="flex flex-col items-center justify-center flex-1 gap-6 px-8 py-16">
          <div className="w-20 h-20 rounded-full bg-[#EEF0F5] flex items-center justify-center">
            <FileUp size={36} className="text-[#1A2B4E]" />
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <h2 className="text-lg font-bold text-[#1A2B4E]">成績表をインポートしてください</h2>
            <p className="text-sm text-[#4B5563] leading-relaxed">
              龍谷大学ポータルからダウンロードした
              <br />
              成績表PDFを取り込むと、時間割と単位情報が表示されます
            </p>
          </div>
          <Link
            href="/import"
            className="w-full h-[52px] rounded-lg bg-[#E60012] flex items-center justify-center gap-2 active:bg-[#b7000c] transition-colors"
          >
            <FileUp size={20} className="text-white" />
            <span className="text-[15px] font-bold text-white">成績表を取り込む</span>
          </Link>
        </div>
      </div>
    );
  }

  const totalCredits = profile.completedCourses.reduce((sum, c) => sum + c.credits, 0);
  const remaining = Math.max(0, GRADUATION_CREDITS - totalCredits);

  const now = new Date();
  const nendo = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const semester = now.getMonth() < 9 ? "前期" : "後期";

  return (
    <div className="flex flex-col bg-white min-h-full">
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-5 h-14 bg-white border-b border-[#D1D5DB]">
        <div className="flex flex-col">
          <span className="text-[#1A2B4E] text-xl font-bold">時間割</span>
          {profile.program && (
            <span className="text-[#6B7280] text-[10px] leading-none">{profile.grade}回生・{profile.program}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[#E60012] text-xs">{nendo}年度 {semester}</span>
          <Bell size={22} className="text-[#1A2B4E]" />
        </div>
      </header>

      {/* CreditBar */}
      <div className="flex items-center justify-around px-5 h-[52px] bg-white border-b border-[#D1D5DB]">
        {[
          { val: totalCredits, label: "取得済み単位" },
          { val: GRADUATION_CREDITS, label: "卒業必要単位" },
          { val: remaining, label: "卒業残り単位" },
        ].map(({ val, label }) => (
          <div key={label} className="flex flex-col items-center gap-0.5">
            <span className="text-[#1A2B4E] text-xl font-bold font-mono leading-none">{val}</span>
            <span className="text-[#6B7280] text-[10px]">{label}</span>
          </div>
        ))}
      </div>

      {/* Timetable — 提案前は空グリッド */}
      <div className="flex flex-col">
        {/* DayHeader */}
        <div className="flex h-8 bg-[#F8F9FA] border-b border-[#D1D5DB]">
          <div className="w-7 shrink-0 border-r border-[#D1D5DB]" />
          {DAYS.map((d) => (
            <div key={d} className="flex-1 flex items-center justify-center border-r border-[#D1D5DB]">
              <span className="text-[#1A2B4E] text-[13px] font-semibold">{d}</span>
            </div>
          ))}
        </div>

        {PERIODS.map((p) => (
          <div key={p} className="flex h-[72px] border-b border-[#D1D5DB]">
            <div className="w-7 shrink-0 bg-[#F9FAFB] border-r border-[#D1D5DB] flex flex-col items-center justify-center">
              <span className="text-[#1A2B4E] text-[13px] font-bold font-mono leading-none">{p}</span>
              <span className="text-[#4B5563] text-[9px]">限</span>
            </div>
            {DAYS.map((d) => (
              <div key={d} className="flex-1 border-r border-[#D1D5DB] bg-white" />
            ))}
          </div>
        ))}
      </div>

      {/* 提案へのCTA */}
      <div className="flex flex-col gap-2 px-4 py-4 border-t border-[#E5E7EB] bg-[#F8F9FA]">
        <p className="text-xs text-[#6B7280] text-center">
          {profile.grade}回生 · {profile.program} · 取得済み {totalCredits} 単位
        </p>
        <Link
          href="/proposal"
          className="w-full h-12 rounded-lg bg-[#1A2B4E] flex items-center justify-center gap-2 active:bg-[#0f1b30] transition-colors"
        >
          <span className="text-sm font-bold text-white">AIに履修提案を作ってもらう</span>
        </Link>
      </div>
    </div>
  );
}
