"use client";

import { Bell, FileUp, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useStudentStore } from "@/lib/student";
import MobileImportFlow from "@/app/import/_components/MobileImportFlow";

const GRADUATION_CREDITS = 124;
const DAYS = ["月", "火", "水", "木", "金"] as const;
const PERIODS = [1, 2, 3, 4, 5] as const;

type CellType = "required" | "elective-required" | "elective" | "free";
type Cell = { name: string; type: CellType } | null;

const CELL_STYLES: Record<CellType, { cell: string; tag: string; label: string | null }> = {
  required: { cell: "bg-[#FFE8E9]", tag: "bg-[#E60012]", label: "必修" },
  "elective-required": { cell: "bg-[#EAEEF5]", tag: "bg-[#1A2B4E]", label: "選択必修" },
  elective: { cell: "bg-[#F3F4F6]", tag: "bg-[#4B5563]", label: "選択" },
  free: { cell: "bg-[#F9FAFB]", tag: "", label: null },
};

const EMPTY_TIMETABLE: Record<number, Record<string, Cell>> = {
  1: { 月: null, 火: null, 水: null, 木: null, 金: null },
  2: { 月: null, 火: null, 水: null, 木: null, 金: null },
  3: { 月: null, 火: null, 水: null, 木: null, 金: null },
  4: { 月: null, 火: null, 水: null, 木: null, 金: null },
  5: { 月: null, 火: null, 水: null, 木: null, 金: null },
};

export default function MobileTimetablePage() {
  const router = useRouter();
  const profile = useStudentStore((s) => s.profile);

  if (!profile) {
    return <MobileImportFlow />;
  }

  const earned = profile.completedCourses
    .filter((c) => c.status === "passed")
    .reduce((sum, c) => sum + c.credits, 0);
  const remaining = Math.max(0, GRADUATION_CREDITS - earned);

  const credits = [
    { val: String(earned), label: "取得済み単位" },
    { val: String(remaining), label: "卒業残り単位" },
  ];

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
          <button
            onClick={() => router.push("/import")}
            className="flex items-center gap-1 text-[#6B7280]"
            aria-label="成績表を再インポート"
          >
            <FileUp size={18} />
          </button>
          <Bell size={22} className="text-[#1A2B4E]" />
        </div>
      </header>

      {/* CreditBar */}
      <div className="flex items-center justify-around px-5 h-[52px] bg-white border-b border-[#D1D5DB]">
        {credits.map(({ val, label }) => (
          <div key={label} className="flex flex-col items-center gap-0.5">
            <span className="text-[#1A2B4E] text-xl font-bold font-mono leading-none">{val}</span>
            <span className="text-[#6B7280] text-[10px]">{label}</span>
          </div>
        ))}
      </div>

      {/* Timetable */}
      <div className="flex flex-col">
        {/* DayHeader */}
        <div className="flex h-8 bg-[#F8F9FA] border-b border-[#D1D5DB]">
          <div className="w-7 shrink-0 border-r border-[#D1D5DB]" />
          {DAYS.map((d) => (
            <div
              key={d}
              className="flex-1 flex items-center justify-center border-r border-[#D1D5DB]"
            >
              <span className="text-[#1A2B4E] text-[13px] font-semibold">{d}</span>
            </div>
          ))}
        </div>

        {/* Rows */}
        {PERIODS.map((p) => (
          <div key={p} className="flex h-[72px] border-b border-[#D1D5DB]">
            <div className="w-7 shrink-0 bg-[#F9FAFB] border-r border-[#D1D5DB] flex flex-col items-center justify-center">
              <span className="text-[#1A2B4E] text-[13px] font-bold font-mono leading-none">{p}</span>
              <span className="text-[#4B5563] text-[9px]">限</span>
            </div>
            {DAYS.map((d) => {
              const cell = EMPTY_TIMETABLE[p]?.[d] ?? null;
              const style = cell ? CELL_STYLES[cell.type] : null;
              return (
                <div
                  key={d}
                  className={`flex-1 border-r border-[#D1D5DB] flex flex-col justify-center items-start gap-0.5 px-1 py-1.5 ${
                    style ? style.cell : "bg-white"
                  }`}
                >
                  {cell && (
                    <>
                      <span className="w-full text-[#1A2B4E] text-[10px] font-semibold leading-tight break-words">
                        {cell.name}
                      </span>
                      {style?.label && (
                        <span
                          className={`px-1 py-px rounded-sm text-white text-[8px] leading-none ${style.tag}`}
                        >
                          {style.label}
                        </span>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* CTA: 履修提案 */}
      <div className="p-5">
        <button
          onClick={() => router.push("/proposal")}
          className="w-full h-[52px] rounded-lg bg-[#1A2B4E] flex items-center justify-center gap-2 active:opacity-80 transition-opacity"
        >
          <Sparkles size={18} className="text-white" />
          <span className="text-[15px] font-bold text-white">AIに履修提案を依頼する</span>
        </button>
      </div>
    </div>
  );
}
