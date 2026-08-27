"use client";

import { BookOpen, ChevronRight, Search, Sparkles, Timer } from "lucide-react";
import { motion } from "motion/react";

const POPOVER_WIDTH = 252;
const MARGIN = 16;
const GAP = 12;

export type SlotTarget = {
  day: string;
  period: number;
  /** 長押しされたセルのビューポート座標 */
  rect: { top: number; left: number; width: number; height: number };
};

/**
 * 空きコマ長押しのその場メニュー（ui-design_phone.pen STEP3）。
 *
 * 「探す」「絞り込む」と並べて AI を置くことで、AI が特別扱いにならないようにしている。
 * 長押ししたセルだけがスクリムの上に残り、何を対象にした操作かが見て分かる。
 */
export default function SlotPopover({
  target,
  onClose,
  onSearch,
  onFilter,
  onAskAi,
}: {
  target: SlotTarget;
  onClose: () => void;
  onSearch: () => void;
  onFilter: () => void;
  onAskAi: () => void;
}) {
  const { day, period, rect } = target;
  const centered = rect.left + rect.width / 2 - POPOVER_WIDTH / 2;
  const left = Math.min(
    Math.max(centered, MARGIN),
    Math.max(MARGIN, window.innerWidth - POPOVER_WIDTH - MARGIN),
  );

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      {/* スクリム。タブバーは覆わない */}
      <motion.button
        type="button"
        aria-label="閉じる"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        className="absolute inset-x-0 bottom-20 top-0 bg-scrim-menu"
      />

      {/* 長押ししたセルをスクリムの上に残す */}
      <div
        className="pointer-events-none absolute grid place-items-center rounded-lg bg-surface-primary ring-2 ring-accent"
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        }}
      >
        <span className="text-[11px] font-bold text-fg-muted">空きコマ</span>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 400, mass: 0.6 }}
        className="absolute overflow-hidden rounded-[14px] bg-surface-primary shadow-popover"
        style={{ top: rect.top + rect.height + GAP, left, width: POPOVER_WIDTH }}
        role="menu"
      >
        <div className="flex items-center gap-1.5 border-b border-border-subtle px-3.5 pb-[9px] pt-[11px]">
          <Timer size={13} className="text-fg-muted" />
          <span className="text-[11px] font-bold text-fg-muted">
            {day}曜 {period}限 ・ 空きコマ
          </span>
        </div>

        <button
          type="button"
          role="menuitem"
          onClick={onSearch}
          className="flex w-full items-center gap-2.5 px-3.5 py-[11px] text-left active:bg-surface-gray"
        >
          <Search size={16} className="shrink-0 text-fg-secondary" />
          <span className="text-[13px] text-fg-primary">この時間に入る科目を探す</span>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={onFilter}
          className="flex w-full items-center gap-2.5 px-3.5 py-[11px] text-left active:bg-surface-gray"
        >
          <BookOpen size={16} className="shrink-0 text-fg-secondary" />
          <span className="text-[13px] text-fg-primary">シラバスで絞り込む</span>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={onAskAi}
          className="flex w-full items-center gap-2.5 border-t border-border-subtle bg-accent-light px-3.5 py-3 text-left active:opacity-80"
        >
          <Sparkles size={16} className="shrink-0 text-accent" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[13px] font-bold text-accent">AIに相談する</span>
            <span className="text-[10px] text-[#b0555f]">
              「{day}{period}」を文脈にしてシートを開く
            </span>
          </span>
          <ChevronRight size={14} className="shrink-0 text-accent" />
        </button>
      </motion.div>
    </div>
  );
}
