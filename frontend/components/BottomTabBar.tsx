"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, BookOpen, User } from "lucide-react";
import { useAiStore } from "@/lib/ai";

/*
 * ui-design_phone.pen「★ AI導線マップ」に従い AI専用タブは持たない。
 * 旧「AIチャット」タブの役割は Ask Bar から開くシート（STEP4/5）が担う。
 */
const tabs = [
  { href: "/", icon: CalendarDays, label: "時間割", match: (p: string) => p === "/" },
  { href: "/syllabus", icon: BookOpen, label: "シラバス", match: (p: string) => p.startsWith("/syllabus") },
  { href: "/mydata", icon: User, label: "マイデータ", match: (p: string) => p.startsWith("/mydata") },
];

export default function BottomTabBar() {
  const pathname = usePathname();
  const aiMode = useAiStore((s) => s.mode);

  // インポートフローは戻るボタンを持つ全画面フローのためタブバーを表示しない
  if (pathname.startsWith("/import")) return null;
  // AIがフルスクリーンのときは非表示（ハーフシートのときは見えたまま）
  if (aiMode === "full") return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex h-20 items-end justify-center border-t border-border-primary bg-surface-primary px-4 pb-3">
      <div className="flex h-14 flex-1 items-center justify-around rounded-xl bg-surface-primary p-1.5 shadow-tabbar">
        {tabs.map(({ href, icon: Icon, label, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center gap-[3px] rounded-lg px-3 py-1.5 transition-colors ${
                active ? "bg-accent" : ""
              }`}
            >
              <Icon size={20} className={active ? "text-fg-inverse" : "text-[#6b7280]"} />
              <span
                className={`text-[10px] leading-none ${
                  active ? "text-fg-inverse" : "text-[#6b7280]"
                }`}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
