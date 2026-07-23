"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, BookOpen, MessageCircle, User } from "lucide-react";

const tabs = [
  { href: "/", icon: CalendarDays, label: "時間割", match: (p: string) => p === "/" },
  { href: "/syllabus", icon: BookOpen, label: "シラバス", match: (p: string) => p.startsWith("/syllabus") },
  { href: "/chat", icon: MessageCircle, label: "AIチャット", match: (p: string) => p.startsWith("/chat") },
  { href: "/mydata", icon: User, label: "マイデータ", match: (p: string) => p.startsWith("/mydata") },
];

export default function BottomTabBar() {
  const pathname = usePathname();

  // インポートフローは戻るボタンを持つ全画面フローのためタブバーを表示しない
  if (pathname.startsWith("/import")) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 h-[76px] flex items-end justify-center bg-white border-t border-[#D1D5DB] px-4 pb-3">
      <div className="flex-1 h-14 flex items-center justify-between rounded-xl bg-white p-1.5 shadow-[0_-1px_8px_0_rgba(0,0,0,0.07)]">
        {tabs.map(({ href, icon: Icon, label, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center gap-[3px] px-3 py-1.5 rounded-lg transition-colors ${
                active ? "bg-[#E60012]" : ""
              }`}
            >
              <Icon
                size={20}
                strokeWidth={active ? 2.25 : 2}
                className={active ? "text-white" : "text-[#6B7280]"}
              />
              <span
                className={`text-[10px] leading-none ${
                  active ? "text-white font-medium" : "text-[#6B7280]"
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
