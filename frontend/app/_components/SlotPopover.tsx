"use client";

import { useEffect, useRef } from "react";
import { ChevronRight, Search, Sparkles, Timer } from "lucide-react";
import { motion } from "motion/react";
import { useAnchoredMenu } from "./useAnchoredMenu";

const POPOVER_WIDTH = 252;
const GAP = 12;

export type SlotTarget = {
  day: string;
  period: number;
  /** 押されたセルのビューポート座標 */
  rect: { top: number; left: number; width: number; height: number };
};

/**
 * 空きコマのその場メニュー（ui-design_phone.pen STEP3）。PC・モバイルとも空きコマを
 * 押したときに出す（科目の `CourseMenu` と同じ）。
 *
 * 「この時間に入る科目を探す」と並べて AI を置くことで、AI が特別扱いにならないようにしている。
 * 押したセルだけがスクリムの上に残り、何を対象にした操作かが見て分かる。
 */
export default function SlotPopover({
  target,
  onClose,
  onSearch,
  onAskAi,
  variant = "mobile",
}: {
  target: SlotTarget;
  onClose: () => void;
  onSearch: () => void;
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

  // 開いた直後のスクリムへの click は、開いたタップの続きなので閉じない(`CourseMenu` と同じ)
  const openedAt = useRef(0);
  useEffect(() => {
    openedAt.current = Date.now();
  }, [target]);
  const handleClose = () => {
    if (Date.now() - openedAt.current < 350) return;
    onClose();
  };

  const item = `flex w-full items-center gap-2.5 px-3.5 py-[11px] text-left ${
    pc ? "hover:bg-surface-gray" : "active:bg-surface-gray"
  }`;

  const { day, period, rect } = target;
  // 置き場所は実際の高さで決め、開いているあいだは裏をスクロールさせない
  const { menuRef, style: menuStyle } = useAnchoredMenu(rect, POPOVER_WIDTH, GAP);

  return (
    <div className={`fixed inset-0 z-50 touch-none ${pc ? "hidden md:block" : "md:hidden"}`}>
      {/* スクリム */}
      <motion.button
        type="button"
        aria-label="閉じる"
        onClick={handleClose}
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
        ref={menuRef}
        className="absolute touch-pan-y overflow-y-auto overscroll-contain rounded-[14px] bg-surface-primary shadow-popover"
        style={menuStyle}
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
