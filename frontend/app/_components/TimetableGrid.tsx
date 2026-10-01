"use client";

import { useCallback, useRef } from "react";
import { CELL_STYLES, DAYS, PERIODS, type SlotEntry, type SlotTable } from "@/lib/timetable";
import type { SlotTarget } from "./SlotPopover";
import type { CourseTarget } from "./CourseMenu";

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE = 10;
/** 1コマの高さ(px)。画面に収めるときは呼び出し側が `rowHeight` で詰める */
export const DEFAULT_ROW_HEIGHT = 72;
/** 詰めても下回らない高さ。科目名2行と区分のバッジが収まる */
export const MIN_ROW_HEIGHT = 52;
/** 画面に余りがあるときに伸ばす上限。科目名が長くても3行で収まる */
export const MAX_ROW_HEIGHT = 96;

/** 選択中の科目。複数コマの科目はどのマスで選んでも同じ科目として光らせる */
export type SelectedCourse = { day: string; period: number; key: string };

/** 科目の同一性。シラバスコードが無い科目は名前で見分ける(`courseKey()` と同じ規則) */
export function entryKey(entry: SlotEntry): string {
  return entry.code ?? entry.name;
}

function rectOf(el: Element): CourseTarget["rect"] {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/** 履修区分のタグとクォーターの印（ui-design_phone.pen Tags / Quarter） */
function Tags({ entry }: { entry: SlotEntry }) {
  const style = CELL_STYLES[entry.type];
  return (
    <span className="flex flex-wrap items-center gap-0.5">
      <span className={`rounded-sm px-1 py-px text-[8px] leading-tight ${style.tag}`}>{style.label}</span>
      {entry.quarter && (
        <span className="rounded-sm border border-fg-primary bg-surface-primary px-[3px] text-[8px] font-semibold leading-tight text-fg-primary">
          {entry.quarter}
        </span>
      )}
    </span>
  );
}

/**
 * 時間割グリッド（モバイル。ui-design_phone.pen 04 TimetableWrapper / AI STEP1〜3）。
 *
 * **PC と同じく `coursesToSlotTable()` の形を描く**（design.md §8.3.4）。1マスに複数の
 * 科目（3Q と 4Q）を縦に積み、クォーターの科目には印を付ける。曜日・時限の無い科目は
 * 表の下の「曜日・時限未定」に並べる。以前のモバイルは1マス1科目で、後から来た科目に
 * 上書きされて提案の科目が画面から消えていた。
 *
 * 操作は2つ。
 *  - 科目をタップ → 選択。Ask Bar の文脈がその科目に絞られる（STEP2）。
 *    同時にその場のメニュー（`CourseMenu`）で、シラバスを開く・別の科目に変更する・
 *    時間割から外す・AIに相談する を選べる
 *  - 空きコマを長押し → その場のメニュー（STEP3）
 */
export default function TimetableGrid({
  table,
  unscheduled,
  loading,
  selected,
  onTapCourse,
  onTapEmpty,
  onLongPressEmpty,
  rowHeight,
}: {
  table: SlotTable;
  unscheduled: SlotEntry[];
  loading?: boolean;
  selected: SelectedCourse | null;
  onTapCourse: (target: CourseTarget) => void;
  /** 空きコマを軽く押した。選択を外す */
  onTapEmpty?: () => void;
  onLongPressEmpty: (target: SlotTarget) => void;
  /** 1コマの高さ(px)。省略時は `DEFAULT_ROW_HEIGHT` */
  rowHeight?: number;
}) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const origin = useRef<{ x: number; y: number } | null>(null);

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
  }, []);

  const startPress = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, day: string, period: number) => {
      const el = e.currentTarget;
      fired.current = false;
      origin.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        const rect = el.getBoundingClientRect();
        fired.current = true;
        timer.current = null;
        onLongPressEmpty({
          day,
          period,
          rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        });
      }, LONG_PRESS_MS);
    },
    [onLongPressEmpty],
  );

  const trackMove = useCallback(
    (e: React.PointerEvent) => {
      if (!origin.current) return;
      const moved =
        Math.abs(e.clientX - origin.current.x) > MOVE_TOLERANCE ||
        Math.abs(e.clientY - origin.current.y) > MOVE_TOLERANCE;
      if (moved) cancel();
    },
    [cancel],
  );

  const isSelected = (entry: SlotEntry) => selected?.key === entryKey(entry);

  return (
    <div className="flex select-none flex-col bg-surface-primary">
      {/* 曜日ヘッダー */}
      <div className="flex h-8 border-b border-border-primary bg-surface-gray">
        <div className="w-7 shrink-0 border-r border-border-primary" />
        {DAYS.map((day) => (
          <div
            key={day}
            className="flex flex-1 items-center justify-center border-r border-border-primary last:border-r-0"
          >
            <span className="text-[13px] font-semibold text-fg-primary">{day}</span>
          </div>
        ))}
      </div>

      {PERIODS.map((period) => (
        <div
          key={period}
          className="flex border-b border-border-primary"
          style={{ height: rowHeight ?? DEFAULT_ROW_HEIGHT }}
        >
          <div className="flex w-7 shrink-0 flex-col items-center justify-center border-r border-border-primary bg-cell-free">
            <span className="tabular-nums text-[13px] font-bold leading-none text-fg-primary">{period}</span>
            <span className="text-[9px] text-fg-secondary">限</span>
          </div>

          {DAYS.map((day) => {
            const entries = table[period]?.[day] ?? [];
            const first = entries[0];
            const multi = entries.length > 1;
            const ringed = entries.some(isSelected);

            return (
              <div
                key={day}
                onContextMenu={(e) => e.preventDefault()}
                onPointerDown={(e) => {
                  // 長押しメニューは空きコマだけ（STEP3）
                  if (!first) startPress(e, day, period);
                }}
                onPointerMove={trackMove}
                onPointerCancel={cancel}
                onPointerLeave={cancel}
                onPointerUp={() => {
                  const wasLongPress = fired.current;
                  cancel();
                  if (wasLongPress) return;
                  if (!first) onTapEmpty?.();
                }}
                // 科目は pointerup ではなく click で開く。pointerup でメニューを開くと、
                // タップのあとに届く click がメニューのスクリムに当たって即座に閉じる
                onClick={(e) => {
                  if (first && !multi) onTapCourse({ entry: first, day, period, rect: rectOf(e.currentTarget) });
                }}
                className={`relative flex min-w-0 flex-1 flex-col justify-center border-r border-border-primary last:border-r-0 ${
                  multi ? "gap-1 p-1" : "gap-0.5 px-1 py-1.5"
                } ${first ? CELL_STYLES[first.type].cell : "bg-surface-primary"} ${
                  loading ? "animate-pulse" : ""
                } ${ringed ? "z-10 rounded-lg ring-2 ring-accent" : ""}`}
              >
                {multi
                  ? entries.map((entry) => (
                      <button
                        key={`${entryKey(entry)}-${entry.quarter ?? ""}`}
                        type="button"
                        onClick={(e) => onTapCourse({ entry, day, period, rect: rectOf(e.currentTarget) })}
                        className={`flex min-w-0 flex-col gap-0.5 rounded-sm text-left ${
                          isSelected(entry) ? "ring-1 ring-accent" : ""
                        }`}
                      >
                        <span className="line-clamp-1 text-[9px] font-semibold leading-tight text-fg-primary">
                          {entry.name}
                        </span>
                        <Tags entry={entry} />
                      </button>
                    ))
                  : first && (
                      <>
                        <span className="line-clamp-2 text-[10px] font-semibold leading-tight text-fg-primary">
                          {first.name}
                        </span>
                        <Tags entry={first} />
                      </>
                    )}
              </div>
            );
          })}
        </div>
      ))}

      {/* 表に置けない科目も画面から落とさない（§8.3.4） */}
      {unscheduled.length > 0 && (
        <div className="flex flex-col gap-1.5 border-b border-border-primary bg-cell-free px-3 py-2">
          <span className="text-[11px] font-bold text-fg-primary">曜日・時限未定</span>
          <div className="flex flex-wrap gap-1.5">
            {unscheduled.map((entry) => (
              <button
                key={entryKey(entry)}
                type="button"
                onClick={(e) => onTapCourse({ entry, day: null, period: null, rect: rectOf(e.currentTarget) })}
                className={`flex items-center gap-1 rounded border bg-surface-primary px-1.5 py-1 ${
                  isSelected(entry) ? "border-accent" : "border-border-primary"
                }`}
              >
                <span className="text-[10px] font-semibold text-fg-primary">{entry.name}</span>
                <Tags entry={entry} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
