"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Search,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  User,
  Timer,
} from "lucide-react";
import type { SyllabusListItem, Masters, MatchedBy } from "@/lib/syllabus-api";
import { OFFERING_YEAR, FACULTY } from "@/lib/syllabus-api";
import { SYLLABUS_CONTEXT, useAiStore } from "@/lib/ai";
import AskBar from "@/components/ai/AskBar";
import SyllabusPagination from "./SyllabusPagination";
import { useSyllabusUIStore, type TagType } from "@/lib/syllabusUI";
import { useTagMap } from "@/lib/useTagMap";
import { detailHref } from "@/lib/syllabusQuery";

const TAG_CHIPS = ["すべて", "必修", "選択", "既修得済み"] as const;
const DAYS = ["月", "火", "水", "木", "金", "土"];
const LIMIT = 30;

const TAG_STYLES: Record<NonNullable<TagType>, string> = {
  必修: "bg-[#FEF2F2] text-[#DC2626]",
  選択: "bg-[#EFF6FF] text-[#2563EB]",
  既修得済み: "bg-[#F0FDF4] text-[#16A34A]",
};

type Props = {
  results: SyllabusListItem[];
  /** 総ヒット数。最終ページに達するまで確定しない(§6.2) */
  total: number | null;
  hasNext: boolean;
  offset: number;
  masters: Masters;
  /** キーワードを教員名として引き直したか(§6.1) */
  matchedBy: MatchedBy | null;
  /** `syllabus_code` → 担当教員名。一覧APIに教員が無いためサーバ側で補っている(§6.2) */
  instructors: Record<string, string>;
};

export default function MobileSyllabusPage({
  results,
  total,
  hasNext,
  offset,
  masters,
  matchedBy,
  instructors,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  // 詳細画面へ移っても選択を保つため、デスクトップと同じストアに持たせる
  const activeChip = useSyllabusUIStore((s) => s.activeTag);
  const setActiveChip = useSyllabusUIStore((s) => s.setActiveTag);
  // 空きコマ長押しメニューの「シラバスで絞り込む」から来たときは開いた状態で始める
  const [filterOpen, setFilterOpen] = useState(searchParams.get("filters") === "open");
  const tagMap = useTagMap();
  const setSelection = useAiStore((s) => s.setSelection);

  // 他の画面へ移ったら Ask Bar の文脈を持ち越さない
  useEffect(() => () => setSelection(null), [setSelection]);

  const filteredResults = results.filter((c) => {
    if (activeChip === "すべて") return true;
    const tag = tagMap.get(c.syllabus_code);
    if (activeChip === "必修") return tag === "必修";
    if (activeChip === "選択") return tag === "選択";
    if (activeChip === "既修得済み") return tag === "既修得済み";
    return true;
  });

  const q = searchParams.get("q") ?? "";

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
    "w-full border border-[#D1D5DB] rounded-lg px-2.5 py-2 text-[13px] text-[#1A2B4E] bg-white focus:outline-none focus:border-[#1A2B4E] transition-colors";

  const filterFields: { label: string; node: React.ReactNode }[] = [
    {
      // 開講年度は選べない。履修要項側の名寄せ結果が `OFFERING_YEAR` の1年度分
      // しか無いため(`lib/syllabus-api.ts`)、表示のみとする
      label: "年度",
      node: (
        <p className="text-[13px] text-[#1A2B4E] px-2.5 py-2 bg-[#F3F4F6] border border-[#D1D5DB] rounded-lg">
          {OFFERING_YEAR}年度のみ
        </p>
      ),
    },
    {
      // 学部は選べない。対象は先端理工学部の学生である(要件§2.1)
      label: "学部",
      node: (
        <p className="text-[13px] text-[#1A2B4E] px-2.5 py-2 bg-[#F3F4F6] border border-[#D1D5DB] rounded-lg">
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
            <span className="text-[10px] leading-snug text-[#6B7280]">
              その課程が対象の科目のみ
            </span>
          )}
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
    <div className="flex flex-col bg-white min-h-full pb-[84px]">
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-5 h-14 bg-white border-b border-[#D1D5DB]">
        <span className="font-display text-[#1A2B4E] text-xl font-bold">シラバス検索</span>
        <button
          onClick={() => setFilterOpen((v) => !v)}
          aria-label="絞り込み"
          className={`flex items-center justify-center w-9 h-9 -mr-1.5 rounded-lg transition-colors ${
            filterOpen ? "bg-[#EEF1F8]" : ""
          }`}
        >
          <SlidersHorizontal size={22} className="text-[#1A2B4E]" />
        </button>
      </header>

      {/* Search */}
      <div className="flex items-center gap-2.5 px-4 py-3 bg-white border-b border-[#D1D5DB]">
        <div className="flex-1 flex items-center gap-2 h-[42px] px-3.5 bg-[#F3F4F6] border border-[#D1D5DB] rounded-[10px]">
          <Search size={18} className="text-[#9CA3AF] shrink-0" />
          <input
            type="search"
            defaultValue={q}
            onChange={(e) => update("q", e.target.value)}
            placeholder="科目名・教員名で検索"
            className="flex-1 min-w-0 bg-transparent text-sm text-[#1A2B4E] placeholder-[#9CA3AF] outline-none"
          />
        </div>
      </div>

      {/* Filter panel */}
      <AnimatePresence initial={false}>
        {filterOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-3 px-4 py-3.5 bg-[#F8F9FA] border-b border-[#D1D5DB]">
              {filterFields.map((f) => (
                <label key={f.label} className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-[#4B5563]">{f.label}</span>
                  {f.node}
                </label>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter chips */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-[#D1D5DB] overflow-x-auto">
        {TAG_CHIPS.map((chip) => {
          const active = activeChip === chip;
          return (
            <button
              key={chip}
              onClick={() => setActiveChip(chip)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs whitespace-nowrap transition-colors ${
                active
                  ? "bg-[#1A2B4E] text-white font-semibold"
                  : "bg-[#F3F4F6] border border-[#D1D5DB] text-[#4B5563]"
              }`}
            >
              {chip}
            </button>
          );
        })}
      </div>

      {/* Results header */}
      <div className="flex items-center justify-between px-4 pt-2.5 pb-1.5 bg-white">
        <span className="text-[13px] text-[#4B5563]">
          {/* タグで絞っているあいだはこのページの表示件数を出す */}
          {activeChip === "すべて"
            ? total !== null
              ? `${total.toLocaleString()}件の科目`
              : `${(offset + results.length).toLocaleString()}件以上の科目`
            : `${filteredResults.length.toLocaleString()}件の科目`}
          {matchedBy === "instructor" && (
            <span className="ml-1.5 text-xs">（「{q}」を教員名として検索）</span>
          )}
        </span>
        <div className="flex items-center gap-1 text-[13px] text-[#1A2B4E]">
          <span>配当年次順</span>
          <ChevronDown size={14} />
        </div>
      </div>

      {/* Course list */}
      {filteredResults.length === 0 ? (
        <p className="text-sm text-[#6B7280] text-center py-16">該当する科目がありません</p>
      ) : (
        <div className="flex flex-col">
          {filteredResults.map((c) => {
            const grade =
              c.grade_min === c.grade_max
                ? `${c.grade_min}年次`
                : `${c.grade_min}〜${c.grade_max}年次`;
            const tag = tagMap.get(c.syllabus_code) ?? null;
            return (
              <Link
                key={`${c.syllabus_code}-${c.year}`}
                href={detailHref(c.syllabus_code, searchParams.toString())}
                className="flex flex-col gap-1.5 px-4 py-3.5 border-b border-[#D1D5DB] active:bg-[#F8F9FA] transition-colors"
              >
                {/* Top */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[11px] text-[#4B5563]">{c.syllabus_code}</span>
                    <span className="text-base font-semibold text-[#1A2B4E] leading-snug">
                      {c.course_title}
                      {c.subtitle && (
                        <span className="text-xs font-normal text-[#6B7280] ml-1">
                          ({c.subtitle})
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Mid */}
                <div className="flex flex-col gap-0.5">
                  {instructors[c.syllabus_code] && (
                    <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-[#4B5563]">
                      <User size={14} className="text-[#4B5563] shrink-0" />
                      <span className="truncate">{instructors[c.syllabus_code]}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-[12px] text-[#6B7280]">
                    <span>{grade}</span>
                    <span className="text-[#D1D5DB]">·</span>
                    <span>{c.campus}</span>
                  </div>
                </div>

                {/* Bottom */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {tag && (
                      <span
                        className={`px-2 py-[3px] rounded text-[11px] font-semibold ${TAG_STYLES[tag]}`}
                      >
                        {tag}
                      </span>
                    )}
                    <span className="flex items-center gap-1 px-2 py-[3px] rounded bg-[#EFF6FF] text-[11px] text-[#3B82F6]">
                      <Timer size={11} />
                      {c.day_of_week}曜{c.period}限
                    </span>
                    <span className="px-2 py-[3px] rounded bg-[#F8F9FA] text-[11px] text-[#4B5563]">
                      {c.credits}単位
                    </span>
                    {c.term && (
                      <span className="px-2 py-[3px] rounded bg-[#EEF1F8] text-[11px] font-semibold text-[#1A2B4E]">
                        {c.term}
                      </span>
                    )}
                  </div>
                  <span className="flex items-center gap-0.5 text-xs text-[#1A2B4E] shrink-0">
                    詳細
                    <ChevronRight size={14} />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="px-4 py-4">
        <SyllabusPagination
          limit={LIMIT}
          offset={offset}
          shown={results.length}
          hasNext={hasNext}
          total={total}
        />
      </div>

      {/* 時間割と同じ Ask Bar パターン。参照中の文脈が「この検索結果」に変わるだけ */}
      <AskBar base={SYLLABUS_CONTEXT} />
    </div>
  );
}
