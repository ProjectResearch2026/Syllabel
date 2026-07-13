import { DAYS, PERIODS, TIMETABLE, CELL_STYLES } from "@/lib/timetable";

export default function TimetablePanel() {
  return (
    <div className="flex-1 flex flex-col bg-[#F8F9FA] p-5 min-w-0">
      <div className="flex-1 bg-white rounded-xl border border-[#E5E7EB] overflow-hidden flex flex-col">
        {/* Day header */}
        <div className="flex bg-[#1A2B4E] shrink-0">
          <div className="w-11 shrink-0 bg-[#1A2B4E]" />
          {DAYS.map((d) => (
            <div key={d} className="flex-1 h-9 flex items-center justify-center border-l border-[#2D4070]">
              <span className="text-white text-[13px] font-semibold">{d}</span>
            </div>
          ))}
        </div>

        {/* Rows */}
        {PERIODS.map((p) => (
          <div key={p} className="flex flex-1 border-b border-[#E5E7EB]">
            <div className="w-11 shrink-0 bg-[#F9FAFB] border-r border-[#E5E7EB] flex flex-col items-center justify-center gap-0.5">
              <span className="text-[#1A2B4E] text-sm font-bold font-mono leading-none">{p}</span>
              <span className="text-[#9CA3AF] text-[9px]">限</span>
            </div>
            {DAYS.map((d) => {
              const cell = TIMETABLE[p]?.[d] ?? null;
              const style = cell?.type ? CELL_STYLES[cell.type] : null;
              return (
                <div
                  key={d}
                  className={`flex-1 border-r border-[#E5E7EB] last:border-r-0 flex flex-col justify-center gap-1 p-2 ${
                    style ? style.bg : "bg-white"
                  }`}
                >
                  {cell && style && (
                    <>
                      <span className="text-[#1A2B4E] text-[11px] font-semibold leading-tight">
                        {cell.name}
                      </span>
                      <span className={`inline-block self-start px-1.5 py-px rounded-sm text-white text-[9px] ${style.tag}`}>
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
