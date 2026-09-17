"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, RotateCcw } from "lucide-react";
import { useStudentStore } from "@/lib/student";
import { useChatStore } from "@/lib/chat";
import { useChatHistoryStore } from "@/lib/chatHistory";

/**
 * PC版ヘッダー（ui-design_pc.pen AppHeader）。
 *
 * 地はページ全体と同じグレーで、その上に**白いカードが浮く**。カードの外周
 * 8px/16px の余白はヘッダー自身が持つため、ページ側は `PageBody` の
 * `px-4 pb-2` だけを気にすればよい。
 *
 * 時間割とシラバス一覧では、ヘッダーカードの直下に帯（単位バー／検索バー）が
 * 続いて**1枚のカードに見える**（下の角丸と余白を落とす）。それ以外の画面では
 * ヘッダーカードが単独で浮く。
 *
 * **取り込みが済むまでナビを出さない。** 成績表を取り込む前は時間割もシラバスの
 * タグ付けも中身が無く、押しても空の画面に着くだけで、取り込みという
 * 唯一やることから注意を逸らす。取り込みが終わった時点（完了画面）から出す。
 */

const navItems: {
  href: string;
  label: string;
  match: (p: string) => boolean;
}[] = [
  {
    href: "/proposal",
    label: "時間割",
    match: (p) => p.startsWith("/proposal"),
  },
  {
    href: "/syllabus",
    label: "シラバス",
    match: (p) => p.startsWith("/syllabus"),
  },
  {
    href: "/mydata",
    label: "マイデータ",
    match: (p) =>
      p === "/" ||
      p.startsWith("/mydata") ||
      p.startsWith("/import") ||
      p.startsWith("/privacy"),
  },
];

/** 直下に帯が続く画面。ヘッダーカードと帯を地続きに見せる */
function isAttached(pathname: string): boolean {
  return pathname.startsWith("/proposal") || pathname === "/syllabus";
}

/** 取り込みフロー。PC ではトップも取り込み画面（`app/page.tsx`） */
function isImportFlow(pathname: string): boolean {
  return pathname === "/" || pathname.startsWith("/import");
}

export default function Header() {
  const pathname = usePathname();
  const profile = useStudentStore((s) => s.profile);
  const clearProfile = useStudentStore((s) => s.clearProfile);
  const clearAll = useChatStore((s) => s.clearAll);
  const clearHistory = useChatHistoryStore((s) => s.clearAll);
  const attached = isAttached(pathname);
  const showNav = !(isImportFlow(pathname) && !profile);

  const handleReset = () => {
    if (confirm("入力データと対話履歴をすべて消去しますか?")) {
      clearProfile();
      clearAll();
      clearHistory();
      window.location.href = "/";
    }
  };

  return (
    <header
      className={`sticky top-0 z-50 h-[68px] shrink-0 bg-surface-gray px-4 pt-2 ${
        attached ? "pb-0" : "pb-2"
      }`}
    >
      <div
        className={`flex h-full items-center justify-between gap-2 bg-surface-primary px-8 ${
          attached ? "rounded-t-lg" : "rounded-lg"
        }`}
      >
        {/* Logo */}
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <GraduationCap size={24} className="text-fg-primary" />
          <span className="font-display text-base font-bold leading-none text-fg-primary">
            龍谷大学 履修支援AI
          </span>
        </Link>

        {/* Nav links。取り込み前は出さない（行き先に中身が無い） */}
        {showNav && (
          <nav className="flex items-center gap-7">
            {navItems.map((item) => {
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-col items-center gap-1 px-1"
                >
                  <span
                    className={`text-sm leading-none transition-colors ${
                      active
                        ? "font-semibold text-accent"
                        : "font-normal text-fg-secondary hover:text-fg-primary"
                    }`}
                  >
                    {item.label}
                  </span>
                  <span
                    className={`h-[2px] w-[60px] ${active ? "bg-accent" : "bg-transparent"}`}
                  />
                </Link>
              );
            })}
          </nav>
        )}

        {/* Right area。設計から学生アバターは外れ、リセットだけが残る */}
        <div className="flex shrink-0 items-center gap-4">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-[13px] text-fg-secondary transition-colors hover:text-fg-primary"
          >
            <RotateCcw size={18} />
            <span>リセット</span>
          </button>
        </div>
      </div>
    </header>
  );
}
