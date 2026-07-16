"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import type { Masters } from "@/lib/syllabus-api";

const DAYS = ["月", "火", "水", "木", "金", "土"];

type Props = {
  masters: Masters;
  currentNendo: number;
};

export default function SyllabusSearchForm({ masters, currentNendo }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("offset");
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`);
      });
    },
    [router, pathname, searchParams],
  );

  const q = searchParams.get("q") ?? "";
  const faculty = searchParams.get("faculty") ?? "";
  const campus = searchParams.get("campus") ?? "";
  const term = searchParams.get("term") ?? "";
  const day = searchParams.get("day") ?? "";
  const year = searchParams.get("year") ?? String(currentNendo);

  const nendoOptions = Array.from({ length: 5 }, (_, i) => currentNendo - 2 + i);

  return (
    <div className="space-y-3 mb-5">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
        <input
          type="search"
          defaultValue={q}
          onChange={(e) => update("q", e.target.value)}
          placeholder="科目名・担当教員で検索"
          className="w-full border border-[#D1D5DB] rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-[#1A2B4E] transition-colors"
        />
      </div>

      <details className="group">
        <summary className="flex items-center gap-1.5 text-xs text-[#6B7280] cursor-pointer select-none list-none">
          <SlidersHorizontal size={13} />
          <span>絞り込み</span>
          <span className="ml-auto text-[10px] group-open:rotate-180 transition-transform">▼</span>
        </summary>

        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
          <select
            value={year}
            onChange={(e) => update("year", e.target.value)}
            className="border border-[#D1D5DB] rounded-lg px-2 py-1.5 text-xs text-[#374151] focus:outline-none focus:border-[#1A2B4E]"
          >
            {nendoOptions.map((y) => (
              <option key={y} value={y}>{y}年度</option>
            ))}
          </select>

          <select
            value={faculty}
            onChange={(e) => update("faculty", e.target.value)}
            className="border border-[#D1D5DB] rounded-lg px-2 py-1.5 text-xs text-[#374151] focus:outline-none focus:border-[#1A2B4E]"
          >
            <option value="">学部（すべて）</option>
            {masters.faculty.map((f) => (
              <option key={f.id} value={f.name}>{f.name}</option>
            ))}
          </select>

          <select
            value={campus}
            onChange={(e) => update("campus", e.target.value)}
            className="border border-[#D1D5DB] rounded-lg px-2 py-1.5 text-xs text-[#374151] focus:outline-none focus:border-[#1A2B4E]"
          >
            <option value="">キャンパス（すべて）</option>
            {masters.campus.map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>

          <select
            value={term}
            onChange={(e) => update("term", e.target.value)}
            className="border border-[#D1D5DB] rounded-lg px-2 py-1.5 text-xs text-[#374151] focus:outline-none focus:border-[#1A2B4E]"
          >
            <option value="">開講期（すべて）</option>
            {masters.term.map((t) => (
              <option key={t.id} value={t.name}>{t.name}</option>
            ))}
          </select>

          <select
            value={day}
            onChange={(e) => update("day", e.target.value)}
            className="border border-[#D1D5DB] rounded-lg px-2 py-1.5 text-xs text-[#374151] focus:outline-none focus:border-[#1A2B4E]"
          >
            <option value="">曜日（すべて）</option>
            {DAYS.map((d) => (
              <option key={d} value={d}>{d}曜日</option>
            ))}
          </select>
        </div>
      </details>
    </div>
  );
}
