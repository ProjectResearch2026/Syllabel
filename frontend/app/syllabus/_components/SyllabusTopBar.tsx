"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { Search, Sparkles } from "lucide-react";
import { useSyllabusUIStore } from "@/lib/syllabusUI";

const TAG_CHIPS = ["すべて", "必修", "選択", "既修得済み"] as const;

export default function SyllabusTopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const { activeTag, setActiveTag } = useSyllabusUIStore();

  const q = searchParams.get("q") ?? "";

  const updateQ = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set("q", value);
      else params.delete("q");
      params.delete("offset");
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`);
      });
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="flex items-center gap-4 h-16 px-4 md:px-8 bg-white border-b border-[#D1D5DB] shrink-0 overflow-x-auto">
      {/* Search input */}
      <div className="flex items-center gap-2 h-10 w-full max-w-[420px] shrink-0 bg-[#F8F9FA] border border-[#D1D5DB] rounded-full px-3.5">
        <Search size={18} className="text-[#9CA3AF] shrink-0" />
        <input
          type="search"
          defaultValue={q}
          onChange={(e) => updateQ(e.target.value)}
          placeholder="科目名・教員名で検索"
          className="flex-1 bg-transparent text-sm text-[#1A2B4E] placeholder-[#9CA3AF] outline-none"
        />
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 shrink-0">
        {TAG_CHIPS.map((chip) => {
          const active = activeTag === chip;
          return (
            <button
              key={chip}
              onClick={() => setActiveTag(chip)}
              className={`rounded-full px-3.5 py-1.5 text-xs whitespace-nowrap transition-colors ${
                active
                  ? "bg-[#1A2B4E] text-white font-semibold"
                  : "bg-white border border-[#D1D5DB] text-[#4B5563] hover:border-[#1A2B4E]"
              }`}
            >
              {chip}
            </button>
          );
        })}
      </div>

      {/* AI button */}
      <a
        href="#ai-chat"
        className="flex items-center gap-1.5 h-10 px-4 rounded-full bg-[#E60012] hover:bg-[#b7000c] transition-colors shrink-0 ml-auto"
      >
        <Sparkles size={16} className="text-white" />
        <span className="text-white text-[13px] font-semibold whitespace-nowrap">AIに相談</span>
      </a>
    </div>
  );
}
