"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import type { StudentProfile } from "@/lib/student";
import DemoPicker from "./DemoPicker";

/**
 * 「ダミーデータで試す」のダイアログ。デモの学生を選ぶ欄を画面の中央に重ねて開く。
 * PC とモバイルの取り込み画面で共用する。
 *
 * ボタンの下に開いていた頃は、欄の下半分が画面の外に出て、スクロールしないと
 * 「この学生で試す」まで届かなかった。中央に開けば、縦が短い画面でもダイアログの
 * 高さが画面に収まる(収まらなければダイアログの中だけスクロールする)。
 *
 * 取り込みの段の動き(transform)の中に置くと fixed の基準が画面ではなく段になるため、
 * 段の外に置くこと。
 */
export default function DemoDialog({
  open,
  onClose,
  onLoad,
}: {
  open: boolean;
  onClose: () => void;
  onLoad: (profile: StudentProfile) => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          onKeyDown={(e) => e.key === "Escape" && onClose()}
        >
          <motion.div
            className="absolute inset-0 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="demo-dialog-title"
            className="relative flex max-h-[calc(100dvh-32px)] w-full max-w-[440px] flex-col gap-4 overflow-y-auto rounded-2xl bg-surface-primary p-5 shadow-xl md:p-6"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            transition={{ duration: 0.16, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 id="demo-dialog-title" className="text-lg font-bold text-fg-primary">
                  ダミーデータで試す
                </h2>
                <p className="text-xs text-fg-secondary">展示用のダミー学生で、成績表なしで体験できます。</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="閉じる"
                className="grid size-8 shrink-0 place-items-center rounded-full text-fg-secondary transition-colors hover:bg-surface-soft"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <DemoPicker onLoad={onLoad} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
