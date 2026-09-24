"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { proposalDetailHref } from "@/lib/syllabusQuery";
import { DAYS, PERIODS, CELL_STYLES, coursesToSlotTable, quarterLanes, type SlotEntry } from "@/lib/timetable";
import { useProposalStore } from "@/lib/proposal";
import { courseContext, slotContext, useAiStore, type AiContext } from "@/lib/ai";
import SlotPopover, { type SlotTarget } from "@/app/_components/SlotPopover";

/** 科目の同一性。key に使い、科目が入れ替わったマスだけを作り直して現れる動きを流す */
function entryKey(entry: SlotEntry): string {
  return `${entry.code ?? entry.name}-${entry.quarter ?? ""}`;
}

/**
 * AI の文脈に入っている科目か。複数コマの科目はどのマスで選んでも同じ科目として
 * 光らせるので、クォーターの印は見ない（モバイルの `TimetableGrid` と同じ）
 */
function isSelected(entry: SlotEntry, selection: AiContext | null): boolean {
  if (selection?.kind !== "course") return false;
  return selection.code ? selection.code === entry.code : selection.label === entry.name;
}

/**
 * 科目が入るときの動き。マスの位置(曜日・時限の順)で少しずつずらし、表が
 * 組み上がっていくように見せる。CSS の動きはマウント時に1回だけなので、
 * 同じ科目が残っているマスは流れ直さない
 */
const ENTER = "motion-safe:animate-pop-in";
function enterDelay(order: number): React.CSSProperties {
  return { animationDelay: `${Math.min(order, 20) * 30}ms` };
}

/**
 * 列の割り付け。限ラベル 44px ＋ 曜日6列の等分。`flex-1` で割ると、マスごとの内側の
 * 余白(1科目は p-2、複数は p-1、上段／下段は 0)の差だけ列の幅がずれる
 */
const GRID_COLS = "grid grid-cols-[2.75rem_repeat(6,minmax(0,1fr))]";

/** 選択中の枠。マスの内側に引き、隣のマスの線に隠れないようにする */
const RING = "z-10 ring-2 ring-inset ring-accent";

/**
 * 科目名と、履修区分・クォーターの印。上段／下段に分けたマスでは段の帯がクォーターを
 * 示すので、印は出さない(`showQuarter={false}`)
 */
function EntryBody({
  entry,
  clamp,
  showQuarter = true,
}: {
  entry: SlotEntry;
  clamp: string;
  showQuarter?: boolean;
}) {
  const style = CELL_STYLES[entry.type];
  return (
    <>
      <span className={`${clamp} text-[11px] font-semibold leading-[14px] text-fg-primary`}>
        {entry.name}
      </span>
      <span className="flex flex-wrap items-center gap-1">
        <span className={`rounded-sm px-1.5 py-0.5 text-[9px] ${style.tag}`}>{style.label}</span>
        {showQuarter && entry.quarter && (
          <span className="rounded-sm border border-border-primary bg-surface-primary px-1 py-0.5 text-[9px] font-semibold leading-none text-fg-secondary">
            {entry.quarter}
          </span>
        )}
      </span>
    </>
  );
}

/**
 * 科目の枠。**押すとまず選択になり、右のAIパネルの文脈がその科目に絞られる。**
 * 選択中の科目をもう一度押すと講義詳細(`/syllabus/[code]`)を開く(design.md §8.3.4。
 * モバイルの `TimetableGrid` と同じ2回押し)。同じタブのクライアント遷移で開くので、
 * 提案と対話は残ったまま「時間割に戻る」で戻れる(`proposalDetailHref()`)。
 */
function CourseButton({
  entry,
  selected,
  onPick,
  className,
  style,
  children,
}: {
  entry: SlotEntry;
  selected: boolean;
  onPick: (entry: SlotEntry) => void;
  className: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      style={style}
      onClick={() => onPick(entry)}
      aria-pressed={selected}
      aria-label={
        selected && entry.code
          ? `${entry.name}のシラバスを開く`
          : `${entry.name}をAIの文脈にする`
      }
      title={selected && entry.code ? "もう一度押すとシラバスを開きます" : undefined}
      className={`${className} text-left transition-[filter] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${
        selected ? RING : ""
      }`}
    >
      {children}
    </button>
  );
}

/**
 * 時間割カード（ui-design_pc.pen 04_履修提案 TimetableCard）。
 *
 * 高さは親いっぱいで、5つの限が**均等に伸びる**（`flex-1`）。縦スクロールは
 * 起こさない。列は限ラベル 44px ＋ 曜日6列。
 *
 * **提案の科目はすべて画面に出す**（design.md §8.3）。1マスに複数の科目（3Q と 4Q）が
 * 入り得る。クォーターの科目だけのマスは上段＝3Q・下段＝4Q に分け(`quarterLanes()`)、
 * それ以外で複数入ったマスは縦に並べてクォーターの科目に印を付ける。曜日・時限の無い科目
 * （集中講義など）は表の下の「曜日・時限未定」に並べる。どちらかを欠くと、
 * 表の科目の単位の和が「今期登録単位」と合わなくなる。
 *
 * **科目・空きコマは右のAIパネルの文脈になる**（モバイルの AI_STEP2・STEP3 と同じ）。
 * 選択は `useAiStore` の `selection` に置き、パネルの「参照中」と共有する。
 * 空きコマを押すとその場のメニュー（`SlotPopover`）を出す。
 */
export default function TimetablePanel() {
  const router = useRouter();
  const { status, courses } = useProposalStore();
  const selection = useAiStore((s) => s.selection);
  const setSelection = useAiStore((s) => s.setSelection);
  const [slotTarget, setSlotTarget] = useState<SlotTarget | null>(null);
  // 生成中に届く snapshot も描く（逐次描画。design.md §6.1.1 / §7.2）
  const { table, unscheduled } = coursesToSlotTable(courses);
  const isLoading = status === "loading";
  // まだ投げていない（§5.2.3 の `idle`）。空の表だけを出すと、提案が終わって
  // 何も無いのか、これからなのかが区別できない（§8.3.2）
  const isIdle = status === "idle";

  const pickCourse = (entry: SlotEntry) => {
    if (isSelected(entry, selection)) {
      if (entry.code) router.push(proposalDetailHref(entry.code));
      return;
    }
    setSelection(courseContext(entry.name, entry.code));
  };

  const pickSlot = (e: React.MouseEvent<HTMLButtonElement>, day: string, period: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setSlotTarget({
      day,
      period,
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    });
  };

  const goSyllabus = (target: SlotTarget, openFilters: boolean) => {
    const params = new URLSearchParams({ day: target.day, period: String(target.period) });
    if (openFilters) params.set("filters", "open");
    setSlotTarget(null);
    router.push(`/syllabus?${params.toString()}`);
  };

  const slotSelected = (day: string, period: number) =>
    selection?.kind === "slot" && selection.slot?.day === day && selection.slot.period === period;

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border-primary bg-surface-primary">
      {/* 曜日ヘッダー */}
      <div className={`${GRID_COLS} h-10 shrink-0 border-b border-border-primary bg-surface-gray`}>
        <div />
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
        <div key={p} className={`${GRID_COLS} min-h-0 flex-1 border-b border-border-primary last:border-b-0`}>
          <div className="flex flex-col items-center justify-center gap-0.5 border-r border-border-primary bg-cell-free">
            <span className="text-sm font-bold leading-none text-fg-primary">{p}</span>
            <span className="text-[9px] text-fg-faint">限</span>
          </div>

          {DAYS.map((d, di) => {
            const order = di * PERIODS.length + (p - PERIODS[0]);
            const entries = table[p]?.[d] ?? [];
            // 1科目ならマス全体を区分の色で塗り、マスごとリンクにする。
            // 複数なら科目ごとに色の付いた枠を積み、枠ごとにリンクにする
            const single = entries.length === 1 ? entries[0] : null;
            const cellClass = `flex min-w-0 flex-1 flex-col justify-center gap-1 border-r border-border-primary last:border-r-0 ${
              entries.length > 1 ? "p-1" : "p-2"
            } ${single ? `${CELL_STYLES[single.type].cell} ${ENTER}` : "bg-surface-primary"}`;
            // クォーターの科目だけのマスは、上段＝前半(3Q)・下段＝後半(4Q)と位置を
            // 決めて描く。空いている段は空きコマと同じく押すとその場のメニューを出す
            const lanes = quarterLanes(entries);
            if (lanes) {
              return (
                <div
                  key={d}
                  className="flex min-w-0 flex-1 flex-col border-r border-border-primary last:border-r-0"
                >
                  {[lanes.first, lanes.second].map(({ quarter, entry }, i) => {
                    const laneClass = `flex min-h-0 flex-1 ${i === 0 ? "border-b border-border-primary" : ""}`;
                    if (!entry) {
                      return (
                        <button
                          key={quarter}
                          type="button"
                          onClick={(e) => pickSlot(e, d, p)}
                          aria-label={`${d}曜${p}限の空きコマ（${quarter}）`}
                          className={`${laneClass} bg-surface-primary transition-colors hover:bg-surface-gray focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${
                            slotSelected(d, p) ? RING : ""
                          }`}
                        />
                      );
                    }
                    return (
                      <CourseButton
                        key={entryKey(entry)}
                        entry={entry}
                        selected={isSelected(entry, selection)}
                        onPick={pickCourse}
                        className={`${laneClass} ${CELL_STYLES[entry.type].cell} ${ENTER}`}
                        style={enterDelay(order)}
                      >
                        <span className="flex w-[22px] shrink-0 items-center justify-center border-r border-border-primary bg-black/6 text-[9px] font-bold text-fg-primary">
                          {quarter}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col justify-center gap-[3px] px-2 py-1.5">
                          <EntryBody entry={entry} clamp="line-clamp-2" showQuarter={false} />
                        </span>
                      </CourseButton>
                    );
                  })}
                </div>
              );
            }
            if (single) {
              return (
                <CourseButton
                  key={`${d}:${entryKey(single)}`}
                  entry={single}
                  selected={isSelected(single, selection)}
                  onPick={pickCourse}
                  className={cellClass}
                  style={enterDelay(order)}
                >
                  <EntryBody entry={single} clamp="line-clamp-3" />
                </CourseButton>
              );
            }
            if (entries.length === 0) {
              return (
                <button
                  key={d}
                  type="button"
                  onClick={(e) => pickSlot(e, d, p)}
                  aria-label={`${d}曜${p}限の空きコマ`}
                  className={`${cellClass} transition-colors hover:bg-surface-gray focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${
                    slotSelected(d, p) ? RING : ""
                  }`}
                />
              );
            }
            return (
              <div key={d} className={cellClass}>
                {entries.map((entry) => (
                  <CourseButton
                    key={entryKey(entry)}
                    entry={entry}
                    selected={isSelected(entry, selection)}
                    onPick={pickCourse}
                    className={`flex min-h-0 flex-1 flex-col justify-center gap-0.5 rounded-sm px-1.5 py-1 ${
                      CELL_STYLES[entry.type].cell
                    } ${ENTER}`}
                    style={enterDelay(order)}
                  >
                    <EntryBody entry={entry} clamp="line-clamp-2" />
                  </CourseButton>
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
              <CourseButton
                key={entry.code ?? entry.name}
                entry={entry}
                selected={isSelected(entry, selection)}
                onPick={pickCourse}
                className={`flex items-center gap-1.5 rounded-sm px-2 py-1 ${CELL_STYLES[entry.type].cell} ${ENTER}`}
              >
                <span className="text-[11px] font-semibold text-fg-primary">{entry.name}</span>
                <span className={`rounded-sm px-1.5 py-0.5 text-[9px] ${CELL_STYLES[entry.type].tag}`}>
                  {CELL_STYLES[entry.type].label}
                </span>
                {entry.quarter && (
                  <span className="text-[9px] font-semibold text-fg-secondary">{entry.quarter}</span>
                )}
              </CourseButton>
            ))}
          </div>
        </div>
      )}

      {/* 生成中は表の上を光が流れる。4〜5分待つ場面なので、止まっていないことを示す
          (§7.2)。マスごとの点滅にしないのは、届いた科目が現れる動きと重なるため */}
      {isLoading && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden"
        >
          <div className="h-full w-full bg-linear-to-r from-transparent via-white/60 to-transparent motion-safe:animate-shimmer" />
        </div>
      )}

      <AnimatePresence>
        {isIdle && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none absolute inset-0 grid place-items-center bg-surface-primary/80"
          >
            <p className="max-w-[260px] text-center text-[13px] leading-5 text-fg-tertiary">
              右のAI履修アシスタントに希望条件を送ると、ここに時間割が出ます。
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {slotTarget && (
        <SlotPopover
          variant="pc"
          target={slotTarget}
          onClose={() => setSlotTarget(null)}
          onSearch={() => goSyllabus(slotTarget, false)}
          onFilter={() => goSyllabus(slotTarget, true)}
          onAskAi={() => {
            setSelection(slotContext(slotTarget.day, slotTarget.period));
            setSlotTarget(null);
          }}
        />
      )}
    </div>
  );
}
