"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useAiStore } from "@/lib/ai";
import AiSheet from "./AiSheet";

/**
 * AIアシスタントを全画面共通のオーバーレイとして載せる層。
 * ページ遷移を伴わないので、背後の画面（スクロール位置・選択状態）はそのまま残る。
 */
export default function AiLayer() {
  const mode = useAiStore((s) => s.mode);
  const close = useAiStore((s) => s.close);
  const open = mode !== "closed";

  // シートが開いている間は背後の画面をスクロールさせない
  useEffect(() => {
    if (mode === "closed") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mode]);

  useEffect(() => {
    if (mode === "closed") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, close]);

  return (
    <>
      {/* スクリム。ハーフのときはタブバーを覆わない（背後が見えたままであることが設計意図） */}
      <AnimatePresence>
        {open && (
          <motion.button
            key="ai-scrim"
            type="button"
            aria-label="閉じる"
            onClick={close}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={`fixed inset-x-0 top-0 z-40 bg-scrim ${
              mode === "full" ? "bottom-0" : "bottom-20"
            }`}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {open && <AiSheet key="ai-sheet" />}
      </AnimatePresence>
    </>
  );
}
