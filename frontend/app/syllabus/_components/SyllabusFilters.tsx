"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { SlidersHorizontal } from "lucide-react";
import { OFFERING_YEAR, FACULTY, type Masters } from "@/lib/syllabus-api";
import { useSyllabusUIStore, CATEGORY_CHOICES } from "@/lib/syllabusUI";

const DAYS = ["月", "火", "水", "木", "金", "土"];

type Props = {
  masters: Masters;
};

export default function SyllabusFilters({ masters }: Props) {
  const activeCategory = useSyllabusUIStore((s) => s.activeCategory);
  const setActiveCategory = useSyllabusUIStore((s) => s.setActiveCategory);
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

  const program = searchParams.get("program") ?? "";
  const campus = searchParams.get("campus") ?? "";
  const term = searchParams.get("term") ?? "";
  const day = searchParams.get("day") ?? "";

  const selectClass =
    "w-full border border-[#D1D5DB] rounded px-2.5 py-2 text-[13px] text-[#1A2B4E] bg-white focus:outline-none focus:border-[#1A2B4E] transition-colors";

  const fields: { label: string; node: React.ReactNode }[] = [
    {
      // 開講年度は選べない。履修要項側の名寄せ結果が `OFFERING_YEAR` の1年度分
      // しか無いため(`lib/syllabus-api.ts`)、表示のみとする
      label: "年度",
      node: (
        <p className="text-[13px] text-[#1A2B4E] px-2.5 py-2 bg-[#F3F4F6] border border-[#D1D5DB] rounded">
          {OFFERING_YEAR}年度のみ
        </p>
      ),
    },
    {
      // 学部は選べない。対象は先端理工学部の学生であり(要件§2.1)、他学部の
      // 科目は履修要項を持たずタグ付けの対象外になる
      label: "学部",
      node: (
        <p className="text-[13px] text-[#1A2B4E] px-2.5 py-2 bg-[#F3F4F6] border border-[#D1D5DB] rounded">
          {FACULTY}のみ
        </p>
      ),
    },
    {
      label: "課程",
      node: (
        <>
          <select value={program} onChange={(e) => update("program", e.target.value)} className={selectClass}>
            <option value="">すべて</option>
            {masters.course_program.map((p) => (
              <option key={p.id} value={p.name}>{p.name}</option>
            ))}
          </select>
          {program && (
            <span className="text-[11px] leading-snug text-[#6B7280]">
              その課程が対象の科目のみ。全学向けの教養教育科目は外れます
            </span>
          )}
        </>
      ),
    },
    {
      // 区分は履修要項と学生プロファイルの突合から決まる値であり(§6.1)、api-clean に
      // 投げる検索条件ではない。したがって URL のクエリではなくクライアント状態に
      // 持つ(§8)。同じ理由でページ送りにも影響しない
      label: "区分",
      node: (
        <>
          <select
            value={activeCategory}
            onChange={(e) => setActiveCategory(e.target.value)}
            className={selectClass}
          >
            {CATEGORY_CHOICES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <span className="text-[11px] leading-snug text-[#6B7280]">
            学生情報を取り込むと絞れます
          </span>
        </>
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
