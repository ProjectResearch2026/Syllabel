"use client";

import { ChevronRight, Plus } from "lucide-react";
import {
  CELL_STYLES,
  DAYS,
  PERIODS,
  quarterLanes,
  type CourseType,
  type SlotEntry,
  type SlotTable,
} from "@/lib/timetable";
import { useLongPress } from "@/lib/useLongPress";
import { entryKey, UnscheduledRow, type SelectedCourse } from "./TimetableGrid";
import type { SlotTarget } from "./SlotPopover";

/** 区分の濃い色。カードの左の線とクォーターの印に使う（`CELL_STYLES.tag` の地色と同じ） */
const ACCENT: Record<CourseType, { border: string; text: string; bar: string }> = {
  required: { border: "border-l-required-tag", text: "text-required-tag border-required-tag", bar: "bg-required-tag" },
  selective: { border: "border-l-elective-tag", text: "text-elective-tag border-elective-tag", bar: "bg-elective-tag" },
  elective: { border: "border-l-fg-secondary", text: "text-fg-secondary border-fg-secondary", bar: "bg-fg-secondary" },
  done: { border: "border-l-done-tag", text: "text-done-tag border-done-tag", bar: "bg-done-tag" },
};

/** 空いているコマの見取り図の色 */
const EMPTY_BAR = "bg-black/10";

/**
 * 曜日タブの下の見取り図。1〜5限を縦に並べ、埋まっているコマを区分の色で塗る。
 * クォーターで分けたコマは左右半分ずつ（左＝3Q・右＝4Q）
 */
function MiniPeriods({ table, day }: { table: SlotTable; day: string }) {
  return (
    <span aria-hidden="true" className="flex flex-col gap-0.5">
      {PERIODS.map((period) => {
        const entries = table[period]?.[day] ?? [];
        const lanes = quarterLanes(entries);
        if (lanes) {
          return (
            <span key={period} className="flex w-[22px] gap-px">
              {[lanes.first.entry, lanes.second.entry].map((entry, i) => (
                <span
                  key={i}
                  className={`h-[5px] flex-1 rounded-[1px] ${entry ? ACCENT[entry.type].bar : EMPTY_BAR}`}
                />
              ))}
            </span>
          );
        }
        return (
          <span
            key={period}
            className={`h-[5px] w-[22px] rounded-[1px] ${entries[0] ? ACCENT[entries[0].type].bar : EMPTY_BAR}`}
          />
        );
      })}
    </span>
  );
}

/**
 * 時間割の曜日表示（モバイル。ui-design_phone.pen 04-3 曜日表示）。
 *
 * 週表示（`TimetableGrid`）は6列で1マスが約60pxしかなく、科目名が途中で折り返し、
 * タグがマスの高さを取る。曜日表示は**選んだ曜日の1〜5限を縦に並べ**、科目名を省略
 * せずに出す。曜日タブの下の見取り図で、どの曜日のどのコマが埋まっているかも分かる。
 *
 * 中身と操作は週表示と同じ。`coursesToSlotTable()` の形を描き、クォーターの科目だけの
 * コマは1枚のカードに「3Q」「4Q」の2行で並べる（`quarterLanes()`）。科目をタップすると
 * 選択（もう一度で講義詳細）、空きコマを長押しするとその場のメニューを出す。
 */
export default function TimetableDayView({
  table,
  unscheduled,
  loading,
  day,
  onChangeDay,
  selected,
  onTapCourse,
  onTapEmpty,
  onLongPressEmpty,
}: {
  table: SlotTable;
  unscheduled: SlotEntry[];
  loading?: boolean;
  day: string;
  onChangeDay: (day: string) => void;
  selected: SelectedCourse | null;
  onTapCourse: (entry: SlotEntry, day: string | null, period: number | null) => void;
  onTapEmpty?: () => void;
  onLongPressEmpty: (target: SlotTarget) => void;
}) {
  const bindLongPress = useLongPress({ onLongPress: onLongPressEmpty, onTap: onTapEmpty });
  const isSelected = (entry: SlotEntry) => selected?.key === entryKey(entry);

  const courseCount = PERIODS.reduce((n, p) => n + (table[p]?.[day]?.length ?? 0), 0);
  const emptyCount = PERIODS.filter((p) => (table[p]?.[day]?.length ?? 0) === 0).length;

  /** カードの1行。`quarter` はクォーターで分けたコマのときだけ渡す */
  const courseRow = (entry: SlotEntry, period: number, quarter: string | null, divider: boolean) => {
    const style = CELL_STYLES[entry.type];
    return (
      <button
        key={entryKey(entry)}
        type="button"
        onClick={() => onTapCourse(entry, day, period)}
        className={`flex w-full items-center gap-2 border-l-4 px-3 py-2.5 text-left ${style.cell} ${
          ACCENT[entry.type].border
        } ${divider ? "border-b border-b-border-primary" : ""} ${
          isSelected(entry) ? "relative z-10 ring-2 ring-inset ring-accent" : ""
        }`}
      >
        {quarter && (
          <span
            className={`w-7 shrink-0 rounded-[3px] border bg-surface-primary py-0.5 text-center text-[10px] font-bold leading-tight ${
              ACCENT[entry.type].text
            }`}
          >
            {quarter}
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <span className="text-sm font-semibold leading-snug text-fg-primary">{entry.name}</span>
          <span className="flex items-center gap-1">
            <span className={`rounded-[3px] px-1.5 py-0.5 text-[10px] leading-tight ${style.tag}`}>
              {style.label}
            </span>
            {/* 縦に積んだコマ（分けられなかったもの）ではクォーターを印で出す */}
            {!quarter && entry.quarter && (
              <span className="rounded-[3px] border border-fg-primary bg-surface-primary px-1 text-[10px] font-semibold leading-tight text-fg-primary">
                {entry.quarter}
              </span>
            )}
          </span>
        </span>
        <ChevronRight size={16} className="shrink-0 text-fg-muted" aria-hidden="true" />
      </button>
    );
  };

  return (
    <div className="flex select-none flex-col bg-surface-primary">
      {/* 曜日タブ（週の見取り図つき） */}
      <div role="tablist" aria-label="曜日" className="flex gap-1.5 border-y border-border-primary bg-surface-gray px-3 py-2">
        {DAYS.map((d) => {
          const active = d === day;
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChangeDay(d)}
              className={`flex flex-1 flex-col items-center gap-[5px] rounded-lg pt-1.5 pb-[7px] ${
                active ? "bg-surface-primary ring-[1.5px] ring-accent" : ""
              }`}
            >
              <span className={`text-sm ${active ? "font-bold text-accent" : "font-semibold text-fg-primary"}`}>
                {d}
              </span>
              <MiniPeriods table={table} day={d} />
            </button>
          );
        })}
      </div>

      <div className={`flex flex-col gap-2 px-3 pt-2.5 pb-3 ${loading ? "animate-pulse" : ""}`}>
        <div className="flex items-center justify-between">
          <span className="text-base font-bold text-fg-primary">{day}曜日</span>
          <span className="text-xs text-fg-muted">
            {courseCount}科目 ・ 空き{emptyCount}コマ
          </span>
        </div>

        {PERIODS.map((period) => {
          const entries = table[period]?.[day] ?? [];
          const lanes = quarterLanes(entries);

          let body: React.ReactNode;
          if (entries.length === 0) {
            body = (
              <div
                {...bindLongPress(day, period)}
                aria-label={`${day}曜${period}限の空きコマ`}
                className="flex h-12 flex-1 items-center gap-1.5 rounded-lg border border-border-primary px-3"
              >
                <Plus size={14} className="text-fg-muted" aria-hidden="true" />
                <span className="text-xs text-fg-muted">空きコマ ・ 長押しで科目を探す</span>
              </div>
            );
          } else {
            const rows = lanes
              ? [lanes.first, lanes.second].map(({ quarter, entry }, i) =>
                  entry ? (
                    courseRow(entry, period, quarter, i === 0)
                  ) : (
                    // クォーターで分けたコマの空いている側。空きコマと同じく長押しでメニュー
                    <div
                      key={quarter}
                      {...bindLongPress(day, period)}
                      aria-label={`${day}曜${period}限の空きコマ（${quarter}）`}
                      className={`flex items-center gap-2 px-3 py-2 ${i === 0 ? "border-b border-border-primary" : ""}`}
                    >
                      <span className="w-7 shrink-0 rounded-[3px] border border-border-primary py-0.5 text-center text-[10px] font-bold leading-tight text-fg-muted">
                        {quarter}
                      </span>
                      <span className="text-xs text-fg-muted">空き</span>
                    </div>
                  ),
                )
              : entries.map((entry, i) => courseRow(entry, period, null, i < entries.length - 1));
            body = (
              <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-border-primary">{rows}</div>
            );
          }

          return (
            <div key={period} className="flex items-center gap-2.5">
              <span className="w-11 shrink-0 text-center text-sm font-bold text-fg-primary">{period}限</span>
              {body}
            </div>
          );
        })}
      </div>

      <UnscheduledRow unscheduled={unscheduled} isSelected={isSelected} onTapCourse={onTapCourse} />
    </div>
  );
}
