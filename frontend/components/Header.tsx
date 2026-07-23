"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, RotateCcw } from "lucide-react";
import { useStudentStore } from "@/lib/student";
import { useChatStore } from "@/lib/chat";

const navItems: { href: string; label: string; match: (p: string) => boolean }[] = [
  { href: "/proposal", label: "時間割", match: (p) => p.startsWith("/proposal") },
  { href: "/syllabus", label: "シラバス", match: (p) => p.startsWith("/syllabus") },
  { href: "/chat", label: "AIチャット", match: (p) => p.startsWith("/chat") },
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

export default function Header() {
  const pathname = usePathname();
  const clearProfile = useStudentStore((s) => s.clearProfile);
  const clearAll = useChatStore((s) => s.clearAll);

  const handleReset = () => {
    if (confirm("入力データと対話履歴をすべて消去しますか?")) {
      clearProfile();
      clearAll();
      window.location.href = "/";
    }
  };

  return (
    <header className="sticky top-0 z-50 h-[60px] bg-white border-b border-[#D1D5DB] flex items-center">
      <div className="w-full px-8 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <GraduationCap size={24} className="text-[#1A2B4E]" />
          <span className="text-[#1A2B4E] font-bold text-base leading-tight">
            龍谷大学 履修支援AI
          </span>
        </Link>

        {/* Nav links */}
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
                      ? "text-[#E60012] font-semibold"
                      : "text-[#6B7280] font-normal hover:text-[#1A2B4E]"
                  }`}
                >
                  {item.label}
                </span>
                <span
                  className={`h-[2px] w-[60px] rounded-full ${
                    active ? "bg-[#E60012]" : "bg-transparent"
                  }`}
                />
              </Link>
            );
          })}
        </nav>

        {/* Right area */}
        <div className="flex items-center gap-4 shrink-0">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-[#6B7280] hover:text-[#1A2B4E] transition-colors text-[13px]"
          >
            <RotateCcw size={18} />
            <span>リセット</span>
          </button>
          <div className="w-8 h-8 rounded-full bg-[#E60012] flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">学</span>
          </div>
        </div>
      </div>
    </header>
  );
}
