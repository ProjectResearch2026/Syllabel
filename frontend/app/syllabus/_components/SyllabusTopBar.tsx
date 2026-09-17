"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { Search } from "lucide-react";
import { TAG_CHIPS } from "@/lib/syllabusUI";
import { useFilterControls } from "@/lib/useFilterControls";

/**
 * シラバス一覧の検索バー（ui-design_pc.pen 05_シラバス一覧 SearchBar）。
 *
 * ヘッダーカードの直下に貼り付き、下だけ角を丸めて1枚のカードに見せる。
 * 「AIに相談」ボタンは無くなった。AIは右のパネルに常駐しており、
 * 押して飛ぶ先がもう無いため（ui-design_pc.pen ChatPanel）。
 */
export default function SyllabusTopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const { activeTag, selectTag } = useFilterControls();

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
    <div className="flex h-16 shrink-0 items-center gap-4 overflow-x-auto rounded-b-lg bg-surface-primary px-8">
      {/* 科目名と教員名を1つの入力で受ける（§6.1） */}
      <div className="flex h-10 w-[420px] shrink-0 items-center gap-2 rounded-full bg-surface-gray px-3">
        <Search size={18} className="shrink-0 text-fg-faint" aria-hidden="true" />
        <input
          type="search"
          defaultValue={q}
          onChange={(e) => updateQ(e.target.value)}
          placeholder="科目名・教員名で検索"
          className="min-w-0 flex-1 bg-transparent text-sm text-fg-primary outline-none placeholder:text-fg-faint"
        />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {TAG_CHIPS.map((chip) => {
          const active = activeTag === chip;
          return (
            <button
              key={chip}
              onClick={() => selectTag(chip)}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs transition-colors ${
                active
                  ? "bg-fg-primary font-semibold text-fg-inverse"
                  : "border border-border-primary bg-surface-primary text-fg-secondary hover:border-fg-primary"
              }`}
            >
              {chip}
            </button>
          );
        })}
      </div>
    </div>
  );
}
