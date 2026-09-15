"use client";

import { DAYS, PERIODS, CELL_STYLES, coursesToTimetable } from "@/lib/timetable";
import { useProposalStore } from "@/lib/proposal";

export default function TimetablePanel() {
  const { status, courses } = useProposalStore();
  // 生成中に届く snapshot も描く（逐次描画。design.md §6.1.1 / §7.2）
  const timetable = coursesToTimetable(courses);
  const isLoading = status === "loading";

  return (
    <div className="flex-1 flex flex-col bg-[#F8F9FA] px-5 py-4 min-w-0">
      <div className="flex-1 bg-white rounded-lg border border-[#D1D5DB] overflow-hidden flex flex-col">
        {/* Day header */}
        <div className="flex h-10 bg-[#F8F9FA] border-b border-[#D1D5DB] shrink-0">
          <div className="w-11 shrink-0" />
          {DAYS.map((d) => (
            <div
              key={d}
              className="flex-1 flex items-center justify-center border-l border-[#D1D5DB]"
            >
              <span className="text-[#1A2B4E] text-[13px] font-semibold">{d}</span>
            </div>
          ))}
        </div>

        {/* Rows */}
        {PERIODS.map((p) => (
          <div key={p} className="flex flex-1 border-b border-[#D1D5DB] last:border-b-0">
            <div className="w-11 shrink-0 bg-[#F9FAFB] border-r border-[#D1D5DB] flex flex-col items-center justify-center gap-0.5">
              <span className="text-[#1A2B4E] text-sm font-bold font-mono leading-none">{p}</span>
              <span className="text-[#9CA3AF] text-[9px]">限</span>
            </div>
            {DAYS.map((d) => {
              const cell = timetable[p]?.[d] ?? null;
              const style = cell?.type ? CELL_STYLES[cell.type] : null;
              return (
                <div
                  key={d}
                  className={`flex-1 border-r border-[#D1D5DB] last:border-r-0 flex flex-col justify-center gap-1 p-2 ${
                    style ? style.cell : "bg-white"
                  } ${isLoading ? "animate-pulse" : ""}`}
                >
                  {cell && style && (
                    <>
                      <span className="text-[#1A2B4E] text-[11px] font-semibold leading-tight">
                        {cell.name}
                      </span>
                      <span
                        className={`inline-block self-start px-1.5 py-0.5 rounded-sm text-white text-[9px] ${style.tag}`}
                      >
                        {style.label}
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
