"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { Masters } from "@/lib/syllabus-api";

const DAYS = ["月", "火", "水", "木", "金", "土"];

type Props = {
  masters: Masters;
  currentNendo: number;
};

export default function SyllabusFilters({ masters, currentNendo }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      params.delete("offset");
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`);
      });
    },
    [router, pathname, searchParams],
  );

  const faculty = searchParams.get("faculty") ?? "";
  const campus = searchParams.get("campus") ?? "";
  const term = searchParams.get("term") ?? "";
  const day = searchParams.get("day") ?? "";
  const year = searchParams.get("year") ?? String(currentNendo);

  const nendoOptions = Array.from({ length: 5 }, (_, i) => currentNendo - 2 + i);

  const selectClass =
    "w-full border border-[#D1D5DB] rounded px-2.5 py-2 text-[13px] text-[#1A2B4E] bg-white focus:outline-none focus:border-[#1A2B4E] transition-colors";

  const fields: { label: string; node: React.ReactNode }[] = [
    {
      label: "年度",
      node: (
        <select value={year} onChange={(e) => update("year", e.target.value)} className={selectClass}>
          {nendoOptions.map((y) => (
            <option key={y} value={y}>{y}年度</option>
          ))}
        </select>
      ),
    },
    {
      label: "学部",
      node: (
        <select value={faculty} onChange={(e) => update("faculty", e.target.value)} className={selectClass}>
          <option value="">すべて</option>
          {masters.faculty.map((f) => (
            <option key={f.id} value={f.name}>{f.name}</option>
          ))}
        </select>
      ),
    },
    {
      label: "キャンパス",
      node: (
        <select value={campus} onChange={(e) => update("campus", e.target.value)} className={selectClass}>
          <option value="">すべて</option>
          {masters.campus.map((c) => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>
      ),
    },
    {
      label: "開講期",
      node: (
        <select value={term} onChange={(e) => update("term", e.target.value)} className={selectClass}>
          <option value="">すべて</option>
          {masters.term.map((t) => (
            <option key={t.id} value={t.name}>{t.name}</option>
          ))}
        </select>
      ),
    },
    {
      label: "曜日",
      node: (
        <select value={day} onChange={(e) => update("day", e.target.value)} className={selectClass}>
          <option value="">すべて</option>
          {DAYS.map((d) => (
            <option key={d} value={d}>{d}曜日</option>
          ))}
        </select>
      ),
    },
  ];

  return (
    <aside className="hidden md:flex flex-col gap-4 w-60 shrink-0 bg-white border-r border-[#D1D5DB] px-5 py-6 overflow-y-auto">
      <div className="flex items-center gap-1.5">
        <SlidersHorizontal size={14} className="text-[#9CA3AF]" />
        <span className="text-[11px] font-bold text-[#9CA3AF] tracking-wide">絞り込み</span>
      </div>
      {fields.map((f) => (
        <label key={f.label} className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-[#4B5563]">{f.label}</span>
          {f.node}
        </label>
      ))}
    </aside>
  );
}
