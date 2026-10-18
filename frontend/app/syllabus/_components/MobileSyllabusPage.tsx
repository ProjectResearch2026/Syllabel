"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  ArrowUpRight,
  BookOpen,
  MapPin,
  User,
  Timer,
} from "lucide-react";
import type { SyllabusListItem, Masters, MatchedBy } from "@/lib/syllabus-api";
import { OFFERING_YEAR, FACULTY } from "@/lib/syllabus-api";
import { formatSlots } from "@/lib/schedule";
import { SYLLABUS_CONTEXT } from "@/lib/ai";
import { useSyllabusConversation } from "@/lib/useSyllabusConversation";
import MobileAiAssistant from "@/components/ai/MobileAiAssistant";
import SyllabusPagination from "./SyllabusPagination";
import { TAG_CHIPS, CATEGORY_CHOICES, periodChoices, GRADE_CHOICES } from "@/lib/syllabusUI";
import { useFilterControls } from "@/lib/useFilterControls";
import { useSearchInput } from "@/lib/useSearchInput";
import { useTaggedResults } from "@/lib/useTaggedResults";
import { detailHref } from "@/lib/syllabusQuery";
import { DAYS } from "@/lib/timetable";
import CourseTags from "./CourseTags";
import SyllabusProfileNotice, { CategoryFilterHint } from "./SyllabusProfileNotice";

type Props = {
  /** 条件に当たる**全件**。ページ送りはこの中から切り出す(§6.2) */
  results: SyllabusListItem[];
  /** `syllabus_code` → 対象課程。引けなかったときは null(§6.1.3) */
  targets: Record<string, string[]> | null;
  faculty: string;
  offset: number;
  limit: number;
  masters: Masters;
  /** キーワードを教員名として引き直したか(§6.1) */
  matchedBy: MatchedBy | null;
};

export default function MobileSyllabusPage({
  results,
  targets,
  faculty,
  offset,
  limit,
  masters,
  matchedBy,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  // 詳細画面へ移っても選択を保つため、デスクトップと同じストアに持たせる
  const {
    activeTag: activeChip,
    activeCategory,
    selectTag: setActiveChip,
    selectCategory: setActiveCategory,
  } = useFilterControls();
  // 空きコマ長押しメニューの「シラバスで絞り込む」から来たときは開いた状態で始める
  const [filterOpen, setFilterOpen] = useState(searchParams.get("filters") === "open");
  // AI は PC の右パネルと同じ会話（シラバス全体への質問。§7.4）
  const conversation = useSyllabusConversation();

  // タグ付け・絞り込み・ページの切り出しは PC と同じものを使う(§8)
  const { visible, matched, total, filtering, offset: start } = useTaggedResults(
    results,
    targets,
    faculty,
    offset,
    limit,
  );

  const q = searchParams.get("q") ?? "";
  // 1文字ごとには検索しない。IME の確定と入力の停止を待つ(`lib/useSearchInput.ts`)
  const searchInput = useSearchInput();

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
  // 時間割の空きコマから渡ってくる(`MobileProposalPage` の「この時間に入る科目を探す」)
  const period = searchParams.get("period") ?? "";
  const grade = searchParams.get("grade") ?? "";

  const selectClass =
    "w-full h-[34px] border border-[#D1D5DB] rounded px-2.5 text-xs text-[#1A2B4E] bg-white focus:outline-none focus:border-[#1A2B4E] transition-colors";
  const fixedClass =
    "flex h-[34px] items-center px-2.5 text-xs text-[#4B5563] bg-[#EEF0F5] border border-[#D1D5DB] rounded";

  const filterFields: { label: string; node: React.ReactNode }[] = [
    {
      // 開講年度は選べない。履修要項側の名寄せ結果が `OFFERING_YEAR` の1年度分
      // しか無いため(`lib/syllabus-api.ts`)、表示のみとする
      label: "年度",
      node: (
        <p className={fixedClass}>{OFFERING_YEAR}年度のみ</p>
      ),
    },
    {
      // 学部は選べない。対象は先端理工学部の学生である(要件§2.1)
      label: "学部",
      node: (
        <p className={fixedClass}>{FACULTY}のみ</p>
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
      // 配当年次の範囲(`grade_min`〜`grade_max`)にこの年次を含む科目に絞る(§6.2)
      label: "対象年次",
      node: (
        <>
          <select value={grade} onChange={(e) => update("grade", e.target.value)} className={selectClass}>
            <option value="">すべて</option>
            {GRADE_CHOICES.map((g) => (
              <option key={g} value={g}>{g}年次</option>
            ))}
          </select>
          {grade && (
            <span className="text-[10px] leading-snug text-[#6B7280]">
              {grade}年次で履修できる科目のみ
            </span>
          )}
        </>
      ),
    },
    {
      // 区分は履修要項と学生プロファイルの突合から決まる値であり、api-clean に
      // 投げる検索条件ではない。URL のクエリではなくクライアント状態に持つ(§8)
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
          {/* PC の絞り込みパネルと同じ注記を出す(§8) */}
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
      // 曜日と対で「そのコマに入る科目」を絞る。複数コマの科目は**いずれかのコマ**が
      // 当たれば出る(api-clean 0.3.0 以降。§6.2)ので、「金4・金5」は金5でも出る
      label: "時限",
      node: (
        <select value={period} onChange={(e) => update("period", e.target.value)} className={selectClass}>
          <option value="">すべて</option>
          {periodChoices(period).map((p) => (
            <option key={p} value={p}>{p}限</option>
          ))}
        </select>
      ),
    },
  ];

  return (
    <div className="flex flex-col bg-white min-h-full">
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-5 h-14 bg-white border-b border-[#D1D5DB]">
        <span className="font-display text-[#1A2B4E] text-xl font-bold">シラバス</span>
        <button
          onClick={() => setFilterOpen((v) => !v)}
          aria-label="絞り込み"
          aria-expanded={filterOpen}
          className="flex items-center justify-center w-9 h-9 -mr-1.5"
        >
          <SlidersHorizontal size={22} className={filterOpen ? "text-accent" : "text-[#1A2B4E]"} />
        </button>
      </header>

      {/* Search */}
      <div className="flex items-center gap-2.5 px-4 py-3 bg-white border-b border-[#D1D5DB]">
        <div className="flex-1 flex items-center gap-2 h-[42px] px-3.5 bg-[#F3F4F6] border border-[#D1D5DB] rounded-[10px]">
          <Search size={18} className="text-[#9CA3AF] shrink-0" />
          <input
            type="search"
            {...searchInput}
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
            <div className="flex flex-col gap-2.5 px-4 py-3 bg-surface-gray border-b border-[#D1D5DB]">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-bold text-[#1A2B4E]">絞り込み</span>
                <button onClick={() => setFilterOpen(false)} className="text-xs text-[#4B5563]">
                  閉じる
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {filterFields.map((f) => (
                  <label key={f.label} className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold text-[#4B5563]">{f.label}</span>
                    {f.node}
                  </label>
                ))}
              </div>
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
                  ? "bg-[#1A2B4E] border border-transparent text-white font-semibold"
                  : "bg-[#F3F4F6] border border-[#D1D5DB] text-[#4B5563]"
              }`}
            >
              {chip}
            </button>
          );
        })}
      </div>

      {/* タグが付く条件は、絞り込みを試す前に見えるところへ出す(§8) */}
      <SyllabusProfileNotice />

      {/* Results header */}
      <div className="flex items-center justify-between gap-2 px-4 pt-2.5 pb-1.5 bg-white">
        <span className="min-w-0 text-xs text-[#4B5563]">
          {/* 絞り込みは全件に効く。件数は絞り込み後のものを出す(§8) */}
          {`${matched.toLocaleString()}件の科目`}
          {filtering && `（${total.toLocaleString()}件中）`}
          {visible.length > 0 &&
            `・${(start + 1).toLocaleString()}〜${(start + visible.length).toLocaleString()}件目を表示`}
          {matchedBy === "instructor" && (
            <span className="ml-1.5">（「{q}」を教員名として検索）</span>
          )}
        </span>
        {/* 並び順は選べない(`searchCourses()` が配当年次順に並べる)。⌄ を付けると
            押せるメニューに見えるため、PC と同じ並び順の印にする */}
        <div className="flex shrink-0 items-center gap-1 text-[13px] text-[#1A2B4E]">
          <ArrowUpDown size={14} aria-hidden="true" />
          <span>配当年次順</span>
        </div>
      </div>

      {/* Course list */}
      {visible.length === 0 ? (
        <p className="px-4 py-16 text-center text-sm text-[#6B7280]">
          {filtering ? "絞り込みに該当する科目がありません" : "該当する科目がありません"}
        </p>
      ) : (
        <div className="flex flex-col">
          {visible.map(({ course: c, tags, instructors }) => {
            const grade =
              c.grade_min === c.grade_max
                ? `${c.grade_min}年次`
                : `${c.grade_min}〜${c.grade_max}年次`;
            return (
              <Link
                key={`${c.syllabus_code}-${c.year}`}
                href={detailHref(c.syllabus_code, searchParams.toString())}
                className="flex flex-col gap-1.5 px-4 py-3 border-b border-[#D1D5DB] active:bg-[#F8F9FA] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[#4B5563]">{c.syllabus_code}</span>
                  <ArrowUpRight size={14} className="text-[#4B5563]" aria-hidden="true" />
                </div>

                {(tags || c.term) && (
                  <div className="flex flex-wrap items-center gap-1">
                    <CourseTags tags={tags} />
                    {c.term && (
                      <span className="rounded-md bg-[#EFF6FF] px-2 py-0.5 text-[10px] font-semibold text-[#1D4ED8]">
                        {c.term}
                      </span>
                    )}
                  </div>
                )}

                <span className="text-[15px] font-bold leading-snug text-[#1A2B4E]">
                  {c.course_title}
                  {c.subtitle && (
                    <span className="ml-1 text-xs font-normal text-[#6B7280]">({c.subtitle})</span>
                  )}
                </span>

                {/*
                  教員名は描いたあとに届く(`useTaggedResults`)。届いた時点で行を足すと
                  カードが一斉に伸び、一番下まで送った画面が押し戻される。
                  **取得前から同じ高さの行を置いておき、届いたら中身だけ入れる**(1行に切り詰める)
                */}
                <div
                  className={`flex min-w-0 items-center gap-1 text-xs text-[#4B5563] ${
                    instructors ? "" : "invisible"
                  }`}
                >
                  <User size={13} className="shrink-0" aria-hidden="true" />
                  <span className="truncate">{instructors ?? "\u00a0"}</span>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#E5E7EB] pt-1.5 text-[11px] text-[#4B5563]">
                  <span className="flex items-center gap-1">
                    <BookOpen size={12} aria-hidden="true" />
                    {c.credits}単位
                  </span>
                  <span className="flex items-center gap-1">
                    <Timer size={12} aria-hidden="true" />
                    {formatSlots(c, { weekday: true })}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin size={12} aria-hidden="true" />
                    {c.campus} · {grade}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="px-4 py-4">
        <SyllabusPagination limit={limit} offset={start} total={matched} />
      </div>

      {/* 時間割と同じ Ask Bar → シートのパターン。参照中の文脈が「この検索結果」に変わるだけ */}
      <MobileAiAssistant conversation={conversation} base={SYLLABUS_CONTEXT} />
    </div>
  );
}
