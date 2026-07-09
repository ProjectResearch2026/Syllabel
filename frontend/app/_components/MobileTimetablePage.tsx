"use client";

import { Bell } from "lucide-react";
import { DAYS, PERIODS, TIMETABLE, CELL_STYLES } from "@/lib/timetable";
import type { CourseType } from "@/lib/timetable";

const TAG_STYLES: Record<NonNullable<CourseType>, { cell: string; tag: string; label: string }> = {
  required: { cell: "bg-[#FFE8E9]", tag: "bg-[#E60012]", label: "必修" },
  elective: { cell: "bg-[#E8F0FF]", tag: "bg-[#1A2B4E]", label: "選択" },
};

export default function MobileTimetablePage() {
  return (
    <div className="flex flex-col min-h-[calc(100dvh-0px)] bg-white">
      {/* Header */}
      <header className="flex items-center justify-between px-5 h-14 bg-white border-b border-[#D1D5DB] shrink-0">
        <span className="text-[#1A2B4E] text-xl font-bold">時間割</span>
        <div className="flex items-center gap-3">
          <span className="text-[#1A2B4E] text-xs">2024年度 後期</span>
          <Bell size={22} className="text-[#1A2B4E]" />
        </div>
      </header>

      {/* CreditBar */}
      <div className="flex items-center justify-around px-5 bg-white border-b border-[#D1D5DB] shrink-0 py-2">
        {[
          { val: "62", label: "取得済み単位" },
          { val: "18", label: "今期登録単位" },
          { val: "46", label: "卒業残り単位" },
        ].map(({ val, label }) => (
          <div key={label} className="flex flex-col items-center gap-0.5">
            <span className="text-[#1A2B4E] text-xl font-bold font-mono leading-none">{val}</span>
            <span className="text-[#6B7280] text-[10px]">{label}</span>
          </div>
        ))}
      </div>

      {/* Timetable */}
      <div className="flex-1 overflow-auto">
        <div className="flex flex-col">
          {/* DayHeader */}
          <div className="flex bg-[#1A2B4E] shrink-0">
            <div className="w-7 shrink-0" />
            {DAYS.map((d) => (
              <div key={d} className="flex-1 h-8 flex items-center justify-center">
                <span className="text-white text-[13px] font-semibold">{d}</span>
              </div>
            ))}
          </div>

          {/* Rows */}
          {PERIODS.map((p) => (
            <div key={p} className="flex border-b border-[#E5E7EB]" style={{ height: 72 }}>
              <div className="w-7 shrink-0 bg-[#F9FAFB] border-r border-[#E5E7EB] flex flex-col items-center justify-center">
                <span className="text-[#1A2B4E] text-[13px] font-bold font-mono leading-none">{p}</span>
                <span className="text-[#9CA3AF] text-[9px]">限</span>
              </div>
              {DAYS.map((d) => {
                const cell = TIMETABLE[p]?.[d] ?? null;
                const style = cell?.type ? TAG_STYLES[cell.type] : null;
                return (
                  <div
                    key={d}
                    className={`flex-1 border-r border-[#E5E7EB] last:border-r-0 flex flex-col justify-center gap-0.5 px-1 py-1.5 ${
                      style ? style.cell : "bg-white"
                    }`}
                  >
                    {cell && (
                      <>
                        <span className="text-[#1A2B4E] text-[10px] font-semibold leading-tight break-words">
                          {cell.name}
                        </span>
                        {style && (
                          <span
                            className={`inline-block px-1 py-px rounded-sm text-white text-[8px] ${style.tag}`}
                            style={{ alignSelf: "flex-start" }}
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
      </div>
    </div>
  );
}
