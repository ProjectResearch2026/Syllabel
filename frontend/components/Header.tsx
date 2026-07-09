"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, Info, RotateCcw } from "lucide-react";

const navItems = [
  { href: "/", label: "成績インポート" },
  { href: "/proposal", label: "履修提案" },
  { href: "/syllabus", label: "シラバス" },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 bg-[#1A2B4E] h-[60px] flex items-center">
      <div className="w-full px-8 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <GraduationCap size={24} className="text-white" />
          <span className="text-white font-bold text-base leading-tight">
            龍谷大学 履修支援AI
          </span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-7">
          {navItems.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <div key={item.href} className="flex flex-col items-center py-1">
                <Link
                  href={item.href}
                  className={`text-sm leading-none transition-colors ${
                    active
                      ? "text-white font-semibold"
                      : "text-[#93A8C4] font-normal hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
                {active && (
                  <div className="mt-1 h-[2px] w-[60px] bg-[#E60012] rounded-full" />
                )}
              </div>
            );
          })}
        </nav>

        {/* Right area */}
        <div className="flex items-center gap-3 shrink-0">
          <Info size={20} className="text-[#93A8C4]" />
          <button
            onClick={() => {
              if (confirm("入力データと対話履歴をすべて消去しますか?")) {
                window.location.href = "/";
              }
            }}
            className="flex items-center gap-1.5 text-[#93A8C4] hover:text-white transition-colors text-sm"
          >
            <RotateCcw size={18} />
            <span>リセット</span>
          </button>
        </div>
      </div>
    </header>
  );
}
