"use client";

import { DAYS, PERIODS, CELL_STYLES, coursesToTimetable } from "@/lib/timetable";
import { useProposalStore } from "@/lib/proposal";

/**
 * 時間割カード（ui-design_pc.pen 04_履修提案 TimetableCard）。
 *
 * 高さは親いっぱいで、5つの限が**均等に伸びる**（`flex-1`）。縦スクロールは
 * 起こさない。列は限ラベル 44px ＋ 曜日6列。
 */
export default function TimetablePanel() {
  const { status, courses } = useProposalStore();
  // 生成中に届く snapshot も描く（逐次描画。design.md §6.1.1 / §7.2）
  const timetable = coursesToTimetable(courses);
  const isLoading = status === "loading";
  // まだ投げていない（§5.2.3 の `idle`）。空の表だけを出すと、提案が終わって
  // 何も無いのか、これからなのかが区別できない（§8.3.2）
  const isIdle = status === "idle";

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border-primary bg-surface-primary">
      {/* 曜日ヘッダー */}
      <div className="flex h-10 shrink-0 border-b border-border-primary bg-surface-gray">
        <div className="w-11 shrink-0" />
        {DAYS.map((d) => (
          <div
            key={d}
            className="flex flex-1 items-center justify-center border-l border-border-primary"
          >
            <span className="text-[13px] font-semibold text-fg-primary">{d}</span>
          </div>
        ))}
      </div>

      {PERIODS.map((p) => (
        <div key={p} className="flex min-h-0 flex-1 border-b border-border-primary last:border-b-0">
          <div className="flex w-11 shrink-0 flex-col items-center justify-center gap-0.5 border-r border-border-primary bg-cell-free">
            <span className="text-sm font-bold leading-none text-fg-primary">{p}</span>
            <span className="text-[9px] text-fg-faint">限</span>
          </div>

          {DAYS.map((d) => {
            const cell = timetable[p]?.[d] ?? null;
            const style = cell?.type ? CELL_STYLES[cell.type] : null;
            return (
              <div
                key={d}
                className={`flex min-w-0 flex-1 flex-col justify-center gap-1 border-r border-border-primary p-2 last:border-r-0 ${
                  style ? style.cell : "bg-surface-primary"
                } ${isLoading ? "animate-pulse" : ""}`}
              >
                {cell && style && (
                  <>
                    <span className="line-clamp-3 text-[11px] font-semibold leading-[14px] text-fg-primary">
                      {cell.name}
                    </span>
                    <span
                      className={`self-start rounded-sm px-1.5 py-0.5 text-[9px] ${style.tag}`}
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

      {isIdle && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-surface-primary/80">
          <p className="max-w-[260px] text-center text-[13px] leading-5 text-fg-tertiary">
            右のAI履修アシスタントに希望条件を送ると、ここに時間割が出ます。
          </p>
        </div>
      )}
    </div>
  );
}
