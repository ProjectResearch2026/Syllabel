"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, BookOpen, MessageCircle, User } from "lucide-react";

const tabs = [
  { href: "/", icon: CalendarDays, label: "時間割" },
  { href: "/proposal", icon: CalendarDays, label: "履修提案" },
  { href: "/syllabus", icon: BookOpen, label: "シラバス" },
  { href: "/chat", icon: MessageCircle, label: "AIチャット" },
  { href: "/mydata", icon: User, label: "マイデータ" },
];

export default function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#D1D5DB] safe-area-inset-bottom">
      <div className="flex h-16 items-end pb-2">
        {tabs.map(({ href, icon: Icon, label }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1"
            >
              <div
                className={`flex items-center justify-center w-10 h-7 rounded-full transition-colors ${
                  active ? "bg-[#EEF1F8]" : ""
                }`}
              >
                <Icon
                  size={20}
                  className={active ? "text-[#1A2B4E]" : "text-[#9CA3AF]"}
                />
              </div>
              <span
                className={`text-[10px] font-medium leading-none transition-colors ${
                  active ? "text-[#1A2B4E]" : "text-[#9CA3AF]"
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
