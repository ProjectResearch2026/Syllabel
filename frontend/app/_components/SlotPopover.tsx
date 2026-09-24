"use client";

import { useEffect } from "react";
import { BookOpen, ChevronRight, Search, Sparkles, Timer } from "lucide-react";
import { motion } from "motion/react";

const POPOVER_WIDTH = 252;
const MARGIN = 16;
const GAP = 12;
/** メニューのおおよその高さ。セルの下に入りきらないときは上に出す */
const POPOVER_HEIGHT = 180;

export type SlotTarget = {
  day: string;
  period: number;
  /** 長押しされたセルのビューポート座標 */
  rect: { top: number; left: number; width: number; height: number };
};

/**
 * 空きコマのその場メニュー（ui-design_phone.pen STEP3）。モバイルは長押し、PC は
 * 空きコマを押したときに出す（`variant`）。
 *
 * 「探す」「絞り込む」と並べて AI を置くことで、AI が特別扱いにならないようにしている。
 * 押したセルだけがスクリムの上に残り、何を対象にした操作かが見て分かる。
 */
export default function SlotPopover({
  target,
  onClose,
  onSearch,
  onFilter,
  onAskAi,
  variant = "mobile",
}: {
  target: SlotTarget;
  onClose: () => void;
  onSearch: () => void;
  onFilter: () => void;
  onAskAi: () => void;
  /** PC は右のAIパネルに文脈を渡す。モバイルはシートを開く */
  variant?: "mobile" | "pc";
}) {
  const pc = variant === "pc";
  // 出している方の画面でだけ Esc で閉じる（両方が同時に mount され得る）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const item = `flex w-full items-center gap-2.5 px-3.5 py-[11px] text-left ${
    pc ? "hover:bg-surface-gray" : "active:bg-surface-gray"
  }`;

  const { day, period, rect } = target;
  const centered = rect.left + rect.width / 2 - POPOVER_WIDTH / 2;
  const left = Math.min(
    Math.max(centered, MARGIN),
    Math.max(MARGIN, window.innerWidth - POPOVER_WIDTH - MARGIN),
  );
  const below = rect.top + rect.height + GAP;
  const top =
    below + POPOVER_HEIGHT > window.innerHeight - MARGIN
      ? Math.max(MARGIN, rect.top - GAP - POPOVER_HEIGHT)
      : below;

  return (
    <div className={`fixed inset-0 z-50 ${pc ? "hidden md:block" : "md:hidden"}`}>
      {/* スクリム */}
      <motion.button
        type="button"
        aria-label="閉じる"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        className="absolute inset-0 bg-scrim-menu"
      />

      {/* 押したセルをスクリムの上に残す */}
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
        style={{ top, left, width: POPOVER_WIDTH }}
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
          className={item}
        >
          <Search size={16} className="shrink-0 text-fg-secondary" />
          <span className="text-[13px] text-fg-primary">この時間に入る科目を探す</span>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={onFilter}
          className={item}
        >
          <BookOpen size={16} className="shrink-0 text-fg-secondary" />
          <span className="text-[13px] text-fg-primary">シラバスで絞り込む</span>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={onAskAi}
          className={`flex w-full items-center gap-2.5 border-t border-border-subtle bg-accent-light px-3.5 py-3 text-left ${
            pc ? "hover:brightness-95" : "active:opacity-80"
          }`}
        >
          <Sparkles size={16} className="shrink-0 text-accent" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[13px] font-bold text-accent">AIに相談する</span>
            <span className="text-[10px] text-[#b0555f]">
              「{day}{period}」を文脈にして{pc ? "右のパネルで聞く" : "シートを開く"}
            </span>
          </span>
          <ChevronRight size={14} className="shrink-0 text-accent" />
        </button>
      </motion.div>
    </div>
  );
}
