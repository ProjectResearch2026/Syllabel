"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { DEMO_COURSES, TYPE_META } from "@/lib/syllabus";
import CourseCard from "./_components/CourseCard";
import SyllabusChatBox from "./_components/SyllabusChatBox";

const FILTERS = ["すべて", "必修", "選択", "修得済"] as const;

export default function SyllabusPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("すべて");

  const filtered = DEMO_COURSES.filter((c) => {
    const matchQuery =
      !query ||
      c.title.includes(query) ||
      c.code.includes(query) ||
      c.instructor.includes(query);
    const matchFilter = filter === "すべて" || TYPE_META[c.type].label === filter;
    return matchQuery && matchFilter;
  });

  return (
    <div className="max-w-screen-xl mx-auto px-4 md:px-8 py-6">
      <h1 className="text-[#1A2B4E] text-xl font-bold mb-4">シラバス</h1>

      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="科目名・コード・担当教員で検索"
          className="w-full border border-[#D1D5DB] rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-[#1A2B4E] transition-colors"
        />
      </div>

      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full border text-xs font-medium whitespace-nowrap transition-colors ${
              filter === f
                ? "bg-[#1A2B4E] text-white border-[#1A2B4E]"
                : "border-[#D1D5DB] text-[#1A2B4E] hover:border-[#1A2B4E]"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="space-y-2 mb-8">
        {filtered.length === 0 ? (
          <p className="text-sm text-[#6B7280] text-center py-10">該当する科目がありません</p>
        ) : (
          filtered.map((c) => <CourseCard key={c.code} course={c} />)
        )}
      </div>

      <SyllabusChatBox
        title="AIに質問する（シラバス全体）"
        placeholder="シラバスについて質問..."
        initialMessage='シラバスについて質問してください。例：「プログラミングを扱う選択科目を一覧で」'
      />
    </div>
  );
}
