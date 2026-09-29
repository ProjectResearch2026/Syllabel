"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { SlidersHorizontal } from "lucide-react";
import { OFFERING_YEAR, FACULTY, type Masters } from "@/lib/syllabus-api";
import { CATEGORY_CHOICES } from "@/lib/syllabusUI";
import { useFilterControls } from "@/lib/useFilterControls";
import { PERIODS } from "@/lib/timetable";
import { CategoryFilterHint } from "./SyllabusProfileNotice";

const DAYS = ["月", "火", "水", "木", "金", "土"];
/** 対象年次の選択肢。api-clean の `grade` の値域(1〜4)と同じ */
const GRADES = [1, 2, 3, 4];

type Props = {
  masters: Masters;
};

export default function SyllabusFilters({ masters }: Props) {
  const { activeCategory, selectCategory } = useFilterControls();
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
  const period = searchParams.get("period") ?? "";
  const grade = searchParams.get("grade") ?? "";

  const selectClass =
    "w-full appearance-none rounded border border-border-primary bg-surface-primary px-2.5 py-2 text-[13px] text-fg-primary transition-colors focus:border-fg-primary focus:outline-none";
  // 固定値（年度・学部）は入力に見せない。地を落として読み取り専用だと分かるようにする
  const staticClass =
    "rounded border border-border-primary bg-cell-elective px-2.5 py-2 text-[13px] text-fg-primary";

  const fields: { label: string; node: React.ReactNode }[] = [
    {
      // 開講年度は選べない。履修要項側の名寄せ結果が `OFFERING_YEAR` の1年度分
      // しか無いため(`lib/syllabus-api.ts`)、表示のみとする
      label: "年度",
      node: (
        <p className={staticClass}>{OFFERING_YEAR}年度のみ</p>
      ),
    },
    {
      // 学部は選べない。対象は先端理工学部の学生であり(要件§2.1)、他学部の
      // 科目は履修要項を持たずタグ付けの対象外になる
      label: "学部",
      node: (
        <p className={staticClass}>{FACULTY}のみ</p>
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
            <span className="text-[11px] leading-snug text-fg-secondary">
              その課程が対象の科目のみ。全学向けの教養教育科目は外れます
            </span>
          )}
        </>
      ),
    },
    {
      // 配当年次の範囲(`grade_min`〜`grade_max`)にこの年次を含む科目に絞る(§6.2)
      label: "対象年次",
      node: (
        <>
          <select value={grade} onChange={(e) => update("grade", e.target.value)} className={selectClass}>
            <option value="">すべて</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>{g}年次</option>
            ))}
          </select>
          {grade && (
            <span className="text-[11px] leading-snug text-fg-secondary">
              {grade}年次で履修できる科目のみ
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
            onChange={(e) => selectCategory(e.target.value)}
            className={selectClass}
          >
            {CATEGORY_CHOICES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {/* 11px のグレー1行では気づけなかった。地色を敷き、取り込み済みなら消す */}
          <CategoryFilterHint />
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
    {
      label: "時限",
      node: (
        <select value={period} onChange={(e) => update("period", e.target.value)} className={selectClass}>
          <option value="">すべて</option>
          {PERIODS.map((p) => (
            <option key={p} value={p}>{p}限</option>
          ))}
        </select>
      ),
    },
  ];

  return (
    /* グレーの地に浮く白いカード（ui-design_pc.pen Sidebar） */
    <aside className="hidden min-h-0 w-60 shrink-0 flex-col gap-4 self-stretch overflow-y-auto rounded-lg bg-surface-primary px-4 py-6 md:flex">
      <div className="flex items-center gap-1.5">
        <SlidersHorizontal size={14} className="text-fg-faint" aria-hidden="true" />
        <span className="text-[11px] font-bold tracking-wide text-fg-faint">絞り込み</span>
      </div>
      {fields.map((f) => (
        <label key={f.label} className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-fg-secondary">{f.label}</span>
          {f.node}
        </label>
      ))}
    </aside>
  );
}
