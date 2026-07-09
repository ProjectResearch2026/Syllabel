"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, BookOpen, MessageCircle, User } from "lucide-react";

const tabs = [
  { href: "/", icon: CalendarDays, label: "時間割" },
  { href: "/syllabus", icon: BookOpen, label: "シラバス" },
  { href: "/chat", icon: MessageCircle, label: "AIチャット" },
  { href: "/mydata", icon: User, label: "マイデータ" },
];

export default function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#D1D5DB] pb-3 pt-0 px-4 flex justify-center">
      <div className="w-full max-w-sm h-14 bg-white rounded-xl shadow-[0_-1px_8px_rgba(0,0,0,0.07)] px-1.5 flex items-center justify-between">
        {tabs.map(({ href, icon: Icon, label }) => {
          const active =
            href === "/"
              ? pathname === "/"
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center gap-0.5 rounded-lg px-3 py-1.5 transition-colors ${
                active ? "bg-[#1A2B4E]" : "hover:bg-[#F8F9FA]"
              }`}
            >
              <Icon
                size={20}
                className={active ? "text-white" : "text-[#6B7280]"}
              />
              <span
                className={`text-[10px] font-normal ${
                  active ? "text-white" : "text-[#6B7280]"
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
