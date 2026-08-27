"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition, useEffect } from "react";
import {
  Search,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  User,
  Timer,
} from "lucide-react";
import type { SyllabusListItem, Masters, CurriculaData } from "@/lib/syllabus-api";
import { fetchCurricula } from "@/lib/syllabus-api";
import { useStudentStore } from "@/lib/student";
import { SYLLABUS_CONTEXT, useAiStore } from "@/lib/ai";
import AskBar from "@/components/ai/AskBar";
import SyllabusPagination from "./SyllabusPagination";
import type { TagType } from "./SyllabusTagList";

const TAG_CHIPS = ["すべて", "必修", "選択", "既修得済み"] as const;
const DAYS = ["月", "火", "水", "木", "金", "土"];
const LIMIT = 30;

const TAG_STYLES: Record<NonNullable<TagType>, string> = {
  必修: "bg-[#FEF2F2] text-[#DC2626]",
  選択: "bg-[#EFF6FF] text-[#2563EB]",
  既修得済み: "bg-[#F0FDF4] text-[#16A34A]",
};

function getAdmissionYear(grade: number): number {
  const now = new Date();
  const month = now.getMonth() + 1;
  const academicYear = month >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return academicYear - grade + 1;
}

type Props = {
  results: SyllabusListItem[];
  count: number;
  offset: number;
  masters: Masters;
  currentNendo: number;
};

export default function MobileSyllabusPage({
  results,
  count,
  offset,
  masters,
  currentNendo,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [activeChip, setActiveChip] = useState<string>("すべて");
  // 空きコマ長押しメニューの「シラバスで絞り込む」から来たときは開いた状態で始める
  const [filterOpen, setFilterOpen] = useState(searchParams.get("filters") === "open");
  const [curricula, setCurricula] = useState<CurriculaData | null>(null);
  const profile = useStudentStore((s) => s.profile);
  const setSelection = useAiStore((s) => s.setSelection);

  // 他の画面へ移ったら Ask Bar の文脈を持ち越さない
  useEffect(() => () => setSelection(null), [setSelection]);

  useEffect(() => {
    if (!profile?.program || !profile?.grade) return;
    const admissionYear = getAdmissionYear(profile.grade);
    fetchCurricula(profile.program, admissionYear)
      .then(setCurricula)
      .catch(() => {});
  }, [profile]);

  const passedCodes = new Set(
    (profile?.completedCourses ?? [])
      .filter((c) => c.status === "passed" && c.code)
      .map((c) => c.code as string),
  );
  const passedTitles = new Set(
    (profile?.completedCourses ?? [])
      .filter((c) => c.status === "passed")
      .map((c) => c.title),
  );

  const tagMap = new Map<string, TagType>();
  if (curricula) {
    for (const course of curricula.courses) {
      if (!course.syllabus_code) continue;
      if (passedCodes.has(course.syllabus_code) || passedTitles.has(course.title)) {
        tagMap.set(course.syllabus_code, "既修得済み");
      } else if (course.type === "必修") {
        tagMap.set(course.syllabus_code, "必修");
      } else if (course.type === "選択必修" || course.type === "選択") {
        tagMap.set(course.syllabus_code, "選択");
      }
    }
  }

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

  const year = searchParams.get("year") ?? String(currentNendo);
  const faculty = searchParams.get("faculty") ?? "";
  const campus = searchParams.get("campus") ?? "";
  const term = searchParams.get("term") ?? "";
  const day = searchParams.get("day") ?? "";
  const nendoOptions = Array.from({ length: 5 }, (_, i) => currentNendo - 2 + i);

  const selectClass =
    "w-full border border-[#D1D5DB] rounded-lg px-2.5 py-2 text-[13px] text-[#1A2B4E] bg-white focus:outline-none focus:border-[#1A2B4E] transition-colors";

  const filterFields: { label: string; node: React.ReactNode }[] = [
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
      {filterOpen && (
        <div className="grid grid-cols-2 gap-3 px-4 py-3.5 bg-[#F8F9FA] border-b border-[#D1D5DB]">
          {filterFields.map((f) => (
            <label key={f.label} className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-[#4B5563]">{f.label}</span>
              {f.node}
            </label>
          ))}
        </div>
      )}

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
        <span className="text-[13px] text-[#4B5563]">{filteredResults.length.toLocaleString()}件の科目</span>
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
                href={`/syllabus/${c.syllabus_code}`}
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
                <div className="flex items-center gap-1.5 text-[13px] text-[#4B5563]">
                  <User size={14} className="text-[#4B5563] shrink-0" />
                  <span>{grade}</span>
                  <span className="text-[#D1D5DB]">·</span>
                  <span>{c.campus}</span>
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
        <SyllabusPagination total={count} limit={LIMIT} offset={offset} />
      </div>

      {/* 時間割と同じ Ask Bar パターン。参照中の文脈が「この検索結果」に変わるだけ */}
      <AskBar base={SYLLABUS_CONTEXT} />
    </div>
  );
}
