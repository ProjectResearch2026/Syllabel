"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "学生情報" },
  { href: "/proposal", label: "履修提案" },
  { href: "/syllabus", label: "シラバス" },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-[#D1D5DB]">
      <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="block w-1 h-6 bg-[#E60012] rounded-full" />
          <span className="text-[#1A2B4E] font-bold text-sm leading-tight">
            履修登録支援AI
          </span>
        </Link>

        <nav className="flex items-center gap-1 overflow-x-auto">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded text-sm font-medium whitespace-nowrap transition-colors ${
                  active
                    ? "bg-[#E60012] text-white"
                    : "text-[#1A2B4E] hover:bg-[#F8F9FA]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={() => {
            if (confirm("入力データと対話履歴をすべて消去しますか?")) {
              window.location.href = "/";
            }
          }}
          className="shrink-0 px-3 py-1.5 rounded border border-[#D1D5DB] text-sm text-[#5f3f3b] hover:bg-[#ffdad6] transition-colors"
        >
          リセット
        </button>
      </div>
    </header>
  );
}
