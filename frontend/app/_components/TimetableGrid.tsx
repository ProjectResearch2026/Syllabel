"use client";

import { useCallback, useRef } from "react";
import { CELL_STYLES, DAYS, PERIODS, type Timetable } from "@/lib/timetable";
import type { SlotTarget } from "./SlotPopover";

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE = 10;

/**
 * 時間割グリッド（ui-design_phone.pen CalendarPage / STEP1〜3）。
 *
 * 操作は2つ。
 *  - 科目をタップ → 選択。Ask Bar の文脈がその科目に絞られる（STEP2）
 *  - 空きコマを長押し → その場のメニュー（STEP3）
 */
export default function TimetableGrid({
  timetable,
  loading,
  selected,
  onSelectCourse,
  onLongPressEmpty,
}: {
  timetable: Timetable;
  loading?: boolean;
  selected: { day: string; period: number } | null;
  onSelectCourse: (day: string, period: number, name: string, code?: string) => void;
  onLongPressEmpty: (target: SlotTarget) => void;
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

  return (
    <div className="flex flex-col select-none">
      {/* 曜日ヘッダー */}
      <div className="flex h-8 border-b border-border-primary bg-surface-gray">
        <div className="w-7 shrink-0 border-r border-border-primary" />
        {DAYS.map((day) => (
          <div
            key={day}
            className="flex flex-1 items-center justify-center border-r border-border-primary last:border-r-0"
          >
            <span className="font-display text-[13px] font-semibold text-fg-primary">{day}</span>
          </div>
        ))}
      </div>

      {PERIODS.map((period) => (
        <div key={period} className="flex h-[72px] border-b border-border-primary">
          <div className="flex w-7 shrink-0 flex-col items-center justify-center border-r border-border-primary bg-cell-free">
            <span className="font-mono text-[13px] font-bold leading-none text-fg-primary">
              {period}
            </span>
            <span className="text-[9px] text-fg-secondary">限</span>
          </div>

          {DAYS.map((day) => {
            const cell = timetable[period]?.[day] ?? null;
            const style = cell ? CELL_STYLES[cell.type] : null;
            const isSelected = selected?.day === day && selected?.period === period;

            return (
              <div
                key={day}
                onContextMenu={(e) => e.preventDefault()}
                onPointerDown={(e) => {
                  // 長押しメニューは空きコマだけ（STEP3）
                  if (!cell) startPress(e, day, period);
                }}
                onPointerMove={trackMove}
                onPointerCancel={cancel}
                onPointerLeave={cancel}
                onPointerUp={() => {
                  const wasLongPress = fired.current;
                  cancel();
                  if (wasLongPress) return;
                  if (cell) onSelectCourse(day, period, cell.name, cell.code);
                }}
                className={`relative flex flex-1 flex-col justify-center gap-0.5 border-r border-border-primary px-1 py-1.5 last:border-r-0 ${
                  style ? style.cell : "bg-surface-primary"
                } ${loading ? "animate-pulse" : ""} ${
                  isSelected ? "z-10 rounded-lg ring-2 ring-accent" : ""
                }`}
              >
                {cell && style && (
                  <>
                    <span className="line-clamp-2 font-cell text-[10px] font-semibold leading-tight text-fg-primary">
                      {cell.name}
                    </span>
                    <span
                      className={`self-start rounded-sm px-1 py-px text-[8px] ${style.tag}`}
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
  );
}
