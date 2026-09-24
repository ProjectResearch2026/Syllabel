"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, BookOpen, ChevronRight, Sparkles, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { CELL_STYLES, type SlotEntry } from "@/lib/timetable";

const MENU_WIDTH = 252;
const MARGIN = 16;
const GAP = 8;

export type CourseTarget = {
  entry: SlotEntry;
  /** 押したマス。曜日・時限未定の科目は null */
  day: string | null;
  period: number | null;
  /** 押した科目のビューポート座標 */
  rect: { top: number; left: number; width: number; height: number };
};

/**
 * 時間割の科目を押したときのその場メニュー(PC・モバイル共通)。
 *
 * 時間割は学生が自分で直せる。ここから科目を**外す**か、**別の科目に変更する**
 * (シラバスで次の科目を選ぶ。`useProposalStore` の `replacing`)。外すのは
 * 取り消せないので、押したらもう一度確かめる。
 *
 * 見た目は空きコマのメニュー(`SlotPopover`)に揃え、AI への相談も同じく
 * 並びの1つとして置く(モバイルだけ。PC は AI パネルが常に横にある)。
 */
export default function CourseMenu({
  target,
  onClose,
  onOpenSyllabus,
  onReplace,
  onRemove,
  onAskAi,
}: {
  target: CourseTarget;
  onClose: () => void;
  onOpenSyllabus: () => void;
  onReplace: () => void;
  onRemove: () => void;
  onAskAi?: () => void;
}) {
  const { entry, day, period, rect } = target;
  const [confirming, setConfirming] = useState(false);
  const style = CELL_STYLES[entry.type];
  // 開いた直後のスクリムへの click は、開いたタップの続きなので閉じない
  const openedAt = useRef(0);
  useEffect(() => {
    openedAt.current = Date.now();
  }, [target]);
  const handleClose = () => {
    if (Date.now() - openedAt.current < 350) return;
    onClose();
  };

  const centered = rect.left + rect.width / 2 - MENU_WIDTH / 2;
  const left = Math.min(
    Math.max(centered, MARGIN),
    Math.max(MARGIN, window.innerWidth - MENU_WIDTH - MARGIN),
  );
  // 下に入りきらなければ科目の上に出す(メニューの高さはおよそ 230px)
  const below = rect.top + rect.height + GAP;
  const top = below + 230 > window.innerHeight ? Math.max(MARGIN, rect.top - GAP - 230) : below;

  const item = "flex w-full items-center gap-2.5 px-3.5 py-[11px] text-left transition-colors hover:bg-surface-gray active:bg-surface-gray";

  return (
    <div className="fixed inset-0 z-50">
      <motion.button
        type="button"
        aria-label="閉じる"
        onClick={handleClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        className="absolute inset-0 cursor-default bg-scrim-menu"
      />

      {/* 押した科目をスクリムの上に残す */}
      <div
        className={`pointer-events-none absolute flex items-center justify-center rounded-lg px-1 ring-2 ring-accent ${style.cell}`}
        style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
      >
        <span className="line-clamp-2 text-center text-[10px] font-semibold leading-tight text-fg-primary">
          {entry.name}
        </span>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 400, mass: 0.6 }}
        className="absolute overflow-hidden rounded-[14px] bg-surface-primary shadow-popover"
        style={{ top, left, width: MENU_WIDTH }}
        role="menu"
        aria-label={`${entry.name}の操作`}
      >
        <div className="flex flex-col gap-0.5 border-b border-border-subtle px-3.5 pb-[9px] pt-[11px]">
          <span className="line-clamp-2 text-[13px] font-bold leading-snug text-fg-primary">{entry.name}</span>
          <span className="flex items-center gap-1.5 text-[11px] text-fg-muted">
            <span className={`rounded-sm px-1.5 py-px text-[9px] ${style.tag}`}>{style.label}</span>
            {day && period != null ? `${day}曜 ${period}限` : "曜日・時限未定"}
            {entry.quarter && ` ・ ${entry.quarter}`}
            {entry.credits != null && ` ・ ${entry.credits}単位`}
          </span>
        </div>

        {entry.code && (
          <button type="button" role="menuitem" onClick={onOpenSyllabus} className={item}>
            <BookOpen size={16} className="shrink-0 text-fg-secondary" />
            <span className="text-[13px] text-fg-primary">シラバスを開く</span>
          </button>
        )}

        <button type="button" role="menuitem" onClick={onReplace} className={item}>
          <ArrowLeftRight size={16} className="shrink-0 text-fg-secondary" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[13px] text-fg-primary">別の科目に変更する</span>
            <span className="text-[10px] text-fg-tertiary">シラバスから入れ替える科目を選びます</span>
          </span>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={() => (confirming ? onRemove() : setConfirming(true))}
          className={`${item} ${confirming ? "bg-accent-light" : ""}`}
        >
          <Trash2 size={16} className="shrink-0 text-accent" />
          <span className="text-[13px] font-semibold text-accent">
            {confirming ? "もう一度押すと外します" : "時間割から外す"}
          </span>
        </button>

        {onAskAi && (
          <button
            type="button"
            role="menuitem"
            onClick={onAskAi}
            className="flex w-full items-center gap-2.5 border-t border-border-subtle bg-accent-light px-3.5 py-3 text-left active:opacity-80"
          >
            <Sparkles size={16} className="shrink-0 text-accent" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[13px] font-bold text-accent">AIに相談する</span>
              <span className="text-[10px] text-[#b0555f]">この科目を文脈にしてシートを開く</span>
            </span>
            <ChevronRight size={14} className="shrink-0 text-accent" />
          </button>
        )}
      </motion.div>
    </div>
  );
}
