"use client";

import { DAYS, PERIODS, CELL_STYLES, coursesToSlotTable, type SlotEntry } from "@/lib/timetable";
import { useProposalStore } from "@/lib/proposal";

/** 科目名と、履修区分・クォーターの印 */
function EntryBody({ entry, clamp }: { entry: SlotEntry; clamp: string }) {
  const style = CELL_STYLES[entry.type];
  return (
    <>
      <span className={`${clamp} text-[11px] font-semibold leading-[14px] text-fg-primary`}>
        {entry.name}
      </span>
      <span className="flex flex-wrap items-center gap-1">
        <span className={`rounded-sm px-1.5 py-0.5 text-[9px] ${style.tag}`}>{style.label}</span>
        {entry.quarter && (
          <span className="rounded-sm border border-border-primary bg-surface-primary px-1 py-0.5 text-[9px] font-semibold leading-none text-fg-secondary">
            {entry.quarter}
          </span>
        )}
      </span>
    </>
  );
}

/**
 * 時間割カード（ui-design_pc.pen 04_履修提案 TimetableCard）。
 *
 * 高さは親いっぱいで、5つの限が**均等に伸びる**（`flex-1`）。縦スクロールは
 * 起こさない。列は限ラベル 44px ＋ 曜日6列。
 *
 * **提案の科目はすべて画面に出す**（design.md §8.3）。1マスに複数の科目（3Q と 4Q）が
 * 入り得るので縦に並べ、クォーターの科目には印を付ける。曜日・時限の無い科目
 * （集中講義など）は表の下の「曜日・時限未定」に並べる。どちらかを欠くと、
 * 表の科目の単位の和が「今期登録単位」と合わなくなる。
 */
export default function TimetablePanel() {
  const { status, courses } = useProposalStore();
  // 生成中に届く snapshot も描く（逐次描画。design.md §6.1.1 / §7.2）
  const { table, unscheduled } = coursesToSlotTable(courses);
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
            const entries = table[p]?.[d] ?? [];
            // 1科目ならマス全体を区分の色で塗る。複数なら科目ごとに色の付いた枠を積む
            const single = entries.length === 1 ? entries[0] : null;
            return (
              <div
                key={d}
                className={`flex min-w-0 flex-1 flex-col justify-center gap-1 border-r border-border-primary last:border-r-0 ${
                  entries.length > 1 ? "p-1" : "p-2"
                } ${single ? CELL_STYLES[single.type].cell : "bg-surface-primary"} ${
                  isLoading ? "animate-pulse" : ""
                }`}
              >
                {single && <EntryBody entry={single} clamp="line-clamp-3" />}
                {entries.length > 1 &&
                  entries.map((entry) => (
                    <div
                      key={`${entry.code ?? entry.name}-${entry.quarter ?? ""}`}
                      className={`flex min-h-0 flex-1 flex-col justify-center gap-0.5 rounded-sm px-1.5 py-1 ${
                        CELL_STYLES[entry.type].cell
                      }`}
                    >
                      <EntryBody entry={entry} clamp="line-clamp-2" />
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      ))}

      {unscheduled.length > 0 && (
        <div className="flex shrink-0 items-center gap-3 border-t border-border-primary bg-surface-gray px-3 py-2">
          <span className="shrink-0 text-[11px] font-semibold text-fg-secondary">曜日・時限未定</span>
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {unscheduled.map((entry) => (
              <span
                key={entry.code ?? entry.name}
                className={`flex items-center gap-1.5 rounded-sm px-2 py-1 ${CELL_STYLES[entry.type].cell}`}
              >
                <span className="text-[11px] font-semibold text-fg-primary">{entry.name}</span>
                <span className={`rounded-sm px-1.5 py-0.5 text-[9px] ${CELL_STYLES[entry.type].tag}`}>
                  {CELL_STYLES[entry.type].label}
                </span>
                {entry.quarter && (
                  <span className="text-[9px] font-semibold text-fg-secondary">{entry.quarter}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

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
