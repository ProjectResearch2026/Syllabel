"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, BookOpen, CalendarDays, User } from "lucide-react";
import { useAiStore } from "@/lib/ai";
import { useSyllabusUIStore } from "@/lib/syllabusUI";
import { listHref } from "@/lib/syllabusQuery";
import ContextChip from "./ai/ContextChip";

/*
 * モバイルのボトムドック（ui-design_phone.pen Nav/BottomDock）。
 *
 * Ask Bar とタブを**1枚の浮いたカード**にまとめる。タブは PC ヘッダーのナビと同じ
 * 3つ・同じ行き先で、AI専用タブは持たない（★ AI導線マップ）。旧「AIチャット」タブの
 * 役割は Ask Bar から開くシート（STEP4/5）が担う。
 *
 * Ask Bar は AI を持つ画面（時間割・シラバス一覧・講義詳細）だけに出る。画面側の
 * `MobileAiAssistant` が mount 中に `dock` を登録する。
 */
const tabs = [
  { href: "/proposal", icon: CalendarDays, label: "時間割", match: (p: string) => p.startsWith("/proposal") },
  { href: "/syllabus", icon: BookOpen, label: "シラバス", match: (p: string) => p.startsWith("/syllabus") },
  {
    href: "/mydata",
    icon: User,
    label: "マイデータ",
    match: (p: string) => p.startsWith("/mydata") || p.startsWith("/privacy"),
  },
];

/** ドックの高さ。本文の末尾にこの分の余白を置き、最後の行がドックに隠れないようにする */
const HEIGHT_WITH_ASK = "h-[135px]";
const HEIGHT_TABS_ONLY = "h-[76px]";

export default function BottomDock() {
  const pathname = usePathname();
  const mode = useAiStore((s) => s.mode);
  const dock = useAiStore((s) => s.dock);
  const selection = useAiStore((s) => s.selection);
  const openHalf = useAiStore((s) => s.openHalf);
  // シラバスへは最後の検索条件を付けて戻る(§8)
  const listQuery = useSyllabusUIStore((s) => s.listQuery);

  // 取り込み（`/`）は戻るボタンを持つ手順の画面なのでドックを出さない（PC ヘッダーも
  // 取り込み前はナビを出さない）
  if (pathname === "/") return null;

  const context = dock ? (selection ?? dock.base) : null;
  const hasChip = context?.kind === "course" || context?.kind === "slot";

  const tabRow = (
    <div className="flex h-[58px] px-2 pb-2.5">
      {tabs.map(({ href, icon: Icon, label, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href === "/syllabus" ? listHref(listQuery) : href}
            aria-current={active ? "page" : undefined}
            className="flex h-12 flex-1 flex-col items-center gap-1"
          >
            <span className={`h-[3px] w-9 rounded-b-sm ${active ? "bg-accent" : "bg-transparent"}`} />
            <span className="flex flex-col items-center gap-[3px] pt-1">
              <Icon size={22} className={active ? "text-accent" : "text-fg-tertiary"} aria-hidden="true" />
              <span
                className={`text-[10px] leading-none ${
                  active ? "font-bold text-accent" : "text-fg-tertiary"
                }`}
              >
                {label}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );

  return (
    <div className="md:hidden">
      {/* 本文の末尾の余白。ドックは fixed なので流れの中に高さを持たない */}
      <div aria-hidden="true" className={dock ? HEIGHT_WITH_ASK : HEIGHT_TABS_ONLY} />

      {/* AI のシートが開いているあいだ（ハーフ・全画面とも）は隠す。会話の最中に別の画面へ
          移ることはなく、タブはシートの高さを削るだけだった */}
      {mode !== "closed" ? null : (
        <nav data-bottom-dock className="fixed inset-x-0 bottom-0 z-50 px-2 pb-2.5 pt-2">
          <div className="flex flex-col rounded-2xl border border-border-primary bg-surface-gray shadow-dock">
            <AnimatePresence>
              {dock && context && (
                <div className="px-3 py-2">
                  {/* シートと形状モーフィングを共有する。押すとこの位置からシートが開く */}
                  <motion.button
                    layoutId="ai-bar"
                    type="button"
                    onClick={() => openHalf(context)}
                    style={{ borderRadius: 9999 }}
                    transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                    className={`flex h-[43px] w-full items-center gap-2 bg-surface-primary pl-3 pr-1.5 text-left transition-colors active:bg-surface-soft ${
                      hasChip ? "ring-[1.5px] ring-accent" : ""
                    }`}
                  >
                    {hasChip && <ContextChip context={context} size="sm" />}
                    <span className="min-w-0 flex-1 truncate text-[13px] text-fg-muted">{dock.label}</span>
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent">
                      <ArrowUp size={16} className="text-fg-inverse" aria-hidden="true" />
                    </span>
                  </motion.button>
                </div>
              )}
            </AnimatePresence>
            {tabRow}
          </div>
        </nav>
      )}
    </div>
  );
}
