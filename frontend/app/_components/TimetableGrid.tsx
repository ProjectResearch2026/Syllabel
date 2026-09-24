"use client";

import {
  CELL_STYLES,
  DAYS,
  PERIODS,
  quarterLanes,
  type QuarterLanes,
  type SlotEntry,
  type SlotTable,
} from "@/lib/timetable";
import { useLongPress } from "@/lib/useLongPress";
import type { SlotTarget } from "./SlotPopover";

/** 選択中の科目。複数コマの科目はどのマスで選んでも同じ科目として光らせる */
export type SelectedCourse = { day: string; period: number; key: string };

/**
 * 列の割り付け。限ラベル 28px ＋ 曜日6列の等分。`flex-1` で割ると、マスごとの内側の
 * 余白の差だけ列の幅がずれる
 */
const GRID_COLS = "grid grid-cols-[1.75rem_repeat(6,minmax(0,1fr))]";

/** 科目の同一性。シラバスコードが無い科目は名前で見分ける */
export function entryKey(entry: SlotEntry): string {
  return entry.code ?? entry.name;
}

/**
 * 履修区分のタグとクォーターの印（ui-design_phone.pen Tags / Quarter）。上段／下段に
 * 分けたマスでは段の帯がクォーターを示すので、印は出さない（`showQuarter={false}`）
 */
function Tags({ entry, showQuarter = true }: { entry: SlotEntry; showQuarter?: boolean }) {
  const style = CELL_STYLES[entry.type];
  return (
    <span className="flex flex-wrap items-center gap-0.5">
      <span className={`rounded-sm px-1 py-px text-[8px] leading-tight ${style.tag}`}>{style.label}</span>
      {showQuarter && entry.quarter && (
        <span className="rounded-sm border border-fg-primary bg-surface-primary px-[3px] text-[8px] font-semibold leading-tight text-fg-primary">
          {entry.quarter}
        </span>
      )}
    </span>
  );
}

/** 表に置けない科目も画面から落とさない（§8.3.4）。週表示と曜日表示で共用する */
export function UnscheduledRow({
  unscheduled,
  isSelected,
  onTapCourse,
}: {
  unscheduled: SlotEntry[];
  isSelected: (entry: SlotEntry) => boolean;
  onTapCourse: (entry: SlotEntry, day: string | null, period: number | null) => void;
}) {
  if (unscheduled.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 border-b border-border-primary bg-cell-free px-3 py-2">
      <span className="text-[11px] font-bold text-fg-primary">曜日・時限未定</span>
      <div className="flex flex-wrap gap-1.5">
        {unscheduled.map((entry) => (
          <button
            key={entryKey(entry)}
            type="button"
            onClick={() => onTapCourse(entry, null, null)}
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
  );
}

/**
 * 時間割グリッド（モバイルの週表示。ui-design_phone.pen 04-3 週表示 / AI STEP1〜3）。
 *
 * **PC と同じく `coursesToSlotTable()` の形を描く**（design.md §8.3.4）。クォーターの
 * 科目だけのマスは上段＝3Q・下段＝4Q に分け（`quarterLanes()`）、左の細い帯に
 * クォーターを縦書きで出す。分けたマスのある行だけ高くし（72px → 96px）、科目名2行と
 * タグを半分の高さに収める。それ以外で複数入ったマスは縦に積み、クォーターの印を
 * 付ける。曜日・時限の無い科目は表の下の「曜日・時限未定」に並べる。
 *
 * 操作は2つ。
 *  - 科目をタップ → 選択。Ask Bar の文脈がその科目に絞られる（STEP2）。
 *    選択中の科目をもう一度タップすると講義詳細を開く
 *  - 空きコマ（分けたマスの空いている段も）を長押し → その場のメニュー（STEP3）
 */
export default function TimetableGrid({
  table,
  unscheduled,
  loading,
  selected,
  onTapCourse,
  onTapEmpty,
  onLongPressEmpty,
}: {
  table: SlotTable;
  unscheduled: SlotEntry[];
  loading?: boolean;
  selected: SelectedCourse | null;
  onTapCourse: (entry: SlotEntry, day: string | null, period: number | null) => void;
  /** 空きコマを軽く押した。選択を外す */
  onTapEmpty?: () => void;
  onLongPressEmpty: (target: SlotTarget) => void;
}) {
  const bindLongPress = useLongPress({ onLongPress: onLongPressEmpty, onTap: onTapEmpty });
  const isSelected = (entry: SlotEntry) => selected?.key === entryKey(entry);

  /** 上段／下段に分けたマス */
  const laneCell = (day: string, period: number, lanes: QuarterLanes) => (
    <div
      key={day}
      className={`flex min-w-0 flex-1 flex-col border-r border-border-primary last:border-r-0 ${
        loading ? "animate-pulse" : ""
      }`}
    >
      {[lanes.first, lanes.second].map(({ quarter, entry }, i) => {
        const laneClass = `flex min-h-0 flex-1 ${i === 0 ? "border-b border-border-primary" : ""}`;
        if (!entry) {
          return (
            <div
              key={quarter}
              {...bindLongPress(day, period)}
              aria-label={`${day}曜${period}限の空きコマ（${quarter}）`}
              className={`${laneClass} bg-surface-primary`}
            />
          );
        }
        return (
          <button
            key={entryKey(entry)}
            type="button"
            onClick={() => onTapCourse(entry, day, period)}
            className={`${laneClass} text-left ${CELL_STYLES[entry.type].cell} ${
              isSelected(entry) ? "relative z-10 rounded-sm ring-2 ring-accent" : ""
            }`}
          >
            <span
              aria-hidden="true"
              className="flex w-[11px] shrink-0 flex-col items-center justify-center border-r border-border-primary bg-black/6 text-[8px] font-bold leading-none text-fg-primary"
            >
              <span>{quarter[0]}</span>
              <span>Q</span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-[3px] py-0.5">
              <span className="sr-only">{quarter}</span>
              <span className="line-clamp-2 text-[9px] font-semibold leading-[1.15] text-fg-primary">
                {entry.name}
              </span>
              <Tags entry={entry} showQuarter={false} />
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="flex select-none flex-col bg-surface-primary">
      {/* 曜日ヘッダー */}
      <div className={`${GRID_COLS} h-8 border-b border-border-primary bg-surface-gray`}>
        <div className="border-r border-border-primary" />
        {DAYS.map((day) => (
          <div
            key={day}
            className="flex flex-1 items-center justify-center border-r border-border-primary last:border-r-0"
          >
            <span className="text-[13px] font-semibold text-fg-primary">{day}</span>
          </div>
        ))}
      </div>

      {PERIODS.map((period) => {
        const lanesOf = Object.fromEntries(
          DAYS.map((day) => [day, quarterLanes(table[period]?.[day] ?? [])]),
        );
        const tall = DAYS.some((day) => lanesOf[day]);

        return (
          <div key={period} className={`${GRID_COLS} border-b border-border-primary ${tall ? "h-24" : "h-[72px]"}`}>
            <div className="flex flex-col items-center justify-center border-r border-border-primary bg-cell-free">
              <span className="tabular-nums text-[13px] font-bold leading-none text-fg-primary">{period}</span>
              <span className="text-[9px] text-fg-secondary">限</span>
            </div>

            {DAYS.map((day) => {
              const lanes = lanesOf[day];
              if (lanes) return laneCell(day, period, lanes);

              const entries = table[period]?.[day] ?? [];
              const first = entries[0];
              const multi = entries.length > 1;
              const ringed = entries.some(isSelected);
              const cellClass = `relative flex min-w-0 flex-1 flex-col justify-center border-r border-border-primary last:border-r-0 ${
                multi ? "gap-1 p-1" : "gap-0.5 px-1 py-1.5"
              } ${first ? CELL_STYLES[first.type].cell : "bg-surface-primary"} ${
                loading ? "animate-pulse" : ""
              } ${ringed ? "z-10 rounded-lg ring-2 ring-accent" : ""}`;

              // 空きコマ。長押しメニューは空きコマだけ（STEP3）
              if (!first) {
                return (
                  <div
                    key={day}
                    {...bindLongPress(day, period)}
                    aria-label={`${day}曜${period}限の空きコマ`}
                    className={cellClass}
                  />
                );
              }
              if (!multi) {
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => onTapCourse(first, day, period)}
                    className={`${cellClass} text-left`}
                  >
                    <span className="line-clamp-2 text-[10px] font-semibold leading-tight text-fg-primary">
                      {first.name}
                    </span>
                    <Tags entry={first} />
                  </button>
                );
              }
              return (
                <div key={day} className={cellClass}>
                  {entries.map((entry) => (
                    <button
                      key={`${entryKey(entry)}-${entry.quarter ?? ""}`}
                      type="button"
                      onClick={() => onTapCourse(entry, day, period)}
                      className={`flex min-w-0 flex-col gap-0.5 rounded-sm text-left ${
                        isSelected(entry) ? "ring-1 ring-accent" : ""
                      }`}
                    >
                      <span className="line-clamp-1 text-[9px] font-semibold leading-tight text-fg-primary">
                        {entry.name}
                      </span>
                      <Tags entry={entry} />
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}

      <UnscheduledRow unscheduled={unscheduled} isSelected={isSelected} onTapCourse={onTapCourse} />
    </div>
  );
}
