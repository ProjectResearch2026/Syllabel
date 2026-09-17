"use client";

import { useEffect, useRef } from "react";
import { TextAlignJustify } from "lucide-react";
import type { ArchivedChat } from "@/lib/chatHistory";

/**
 * 「最近のチャット」（ui-design_pc.pen Chat/HistoryMenu）。
 *
 * チャットパネルのハンバーガーから開くポップオーバー。いま話している会話を
 * 先頭に太字で置き、その下に過去の会話を新しい順に並べる。
 *
 * **選ぶと会話ごと入れ替わる**（読み返すだけでなく、その続きから話せる）。
 * いまの会話は履歴へしまわれるので、取り違えても戻ってこられる。
 */
export default function ChatHistoryMenu({
  current,
  entries,
  onSelect,
  onClose,
}: {
  /** いま話している会話の見出し。ユーザーがまだ何も言っていなければ null */
  current: string | null;
  /** 過去の会話（新しい順） */
  entries: ArchivedChat[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // 外側を押す / Esc で閉じる。ポップオーバーは閉じ方が無いと居座る
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // 開いた当のクリックで即閉じないよう、次のタスクから購読する
    const id = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown);
    }, 0);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const isEmpty = !current && entries.length === 0;

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="最近のチャット"
      className="absolute left-2 top-11 z-30 flex w-[300px] max-w-[calc(100%-1rem)] flex-col gap-0.5 rounded-xl border border-border-primary bg-surface-primary p-2 shadow-menu"
    >
      <p className="px-3 py-2 text-xs font-semibold text-fg-secondary">最近のチャット</p>

      {isEmpty ? (
        <p className="px-3 pb-2 pt-1 text-[13px] leading-[18px] text-fg-faint">
          まだ会話がありません。
        </p>
      ) : (
        <>
          {current && (
            <div
              className="flex items-center gap-3 rounded-lg bg-surface-gray px-3 py-2"
              aria-current="true"
            >
              <TextAlignJustify
                size={16}
                className="shrink-0 text-fg-secondary"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-[18px] text-fg-primary">
                {current}
              </span>
            </div>
          )}

          {entries.map((chat) => (
            <button
              key={chat.id}
              type="button"
              role="menuitem"
              onClick={() => onSelect(chat.id)}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-gray"
            >
              <TextAlignJustify
                size={16}
                className="shrink-0 text-fg-secondary"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-[13px] leading-[18px] text-fg-primary">
                {chat.title}
              </span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}
