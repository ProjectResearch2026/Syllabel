"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Send } from "lucide-react";

type Course = {
  code: string;
  title: string;
  instructor: string;
  credits: number;
  semester: string;
  day: string;
  period: string;
  type: "required" | "elective" | "completed";
};

const DEMO_COURSES: Course[] = [
  {
    code: "CS-101",
    title: "プログラミング基礎",
    instructor: "山田 教授",
    credits: 2,
    semester: "前期",
    day: "月",
    period: "1限",
    type: "required",
  },
  {
    code: "CS-201",
    title: "アルゴリズムとデータ構造",
    instructor: "鈴木 教授",
    credits: 2,
    semester: "前期",
    day: "火",
    period: "2限",
    type: "required",
  },
  {
    code: "CS-301",
    title: "機械学習入門",
    instructor: "佐藤 教授",
    credits: 2,
    semester: "後期",
    day: "水",
    period: "3限",
    type: "elective",
  },
  {
    code: "CS-302",
    title: "データベース論",
    instructor: "田中 教授",
    credits: 2,
    semester: "前期",
    day: "木",
    period: "2限",
    type: "elective",
  },
  {
    code: "CS-103",
    title: "線形代数学",
    instructor: "高橋 教授",
    credits: 2,
    semester: "前期",
    day: "金",
    period: "1限",
    type: "completed",
  },
  {
    code: "CS-401",
    title: "ソフトウェア工学",
    instructor: "渡辺 教授",
    credits: 2,
    semester: "後期",
    day: "月",
    period: "4限",
    type: "elective",
  },
  {
    code: "CS-104",
    title: "情報倫理",
    instructor: "伊藤 教授",
    credits: 2,
    semester: "前期",
    day: "火",
    period: "3限",
    type: "completed",
  },
];

const TYPE_META = {
  required: { label: "必修", accent: "bg-[#E60012]", pill: "bg-[#E60012] text-white" },
  elective: { label: "選択", accent: "bg-[#1A2B4E]", pill: "bg-[#1A2B4E] text-white" },
  completed: { label: "修得済", accent: "bg-[#6B7280]", pill: "bg-[#6B7280] text-white" },
};

const FILTERS = ["すべて", "必修", "選択", "修得済"] as const;

export default function SyllabusPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("すべて");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([
    {
      role: "assistant",
      content:
        "シラバスについて質問してください。例：「プログラミングを扱う選択科目を一覧で」",
    },
  ]);

  const filtered = DEMO_COURSES.filter((c) => {
    const matchQuery =
      !query ||
      c.title.includes(query) ||
      c.code.includes(query) ||
      c.instructor.includes(query);
    const matchFilter =
      filter === "すべて" || TYPE_META[c.type].label === filter;
    return matchQuery && matchFilter;
  });

  const handleSend = () => {
    const text = chatInput.trim();
    if (!text) return;
    setChatMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "（AI応答はバックエンド実装後に有効になります）" },
    ]);
    setChatInput("");
  };

  return (
    <div className="max-w-screen-xl mx-auto px-4 md:px-8 py-6">
      <h1 className="text-[#1A2B4E] text-xl font-bold mb-4">シラバス</h1>

      {/* 検索 */}
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

      {/* フィルタチップ */}
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

      {/* 科目一覧 */}
      <div className="space-y-2 mb-8">
        {filtered.length === 0 ? (
          <p className="text-sm text-[#6B7280] text-center py-10">
            該当する科目がありません
          </p>
        ) : (
          filtered.map((c) => {
            const meta = TYPE_META[c.type];
            return (
              <Link
                key={c.code}
                href={`/syllabus/${c.code}`}
                className="flex items-center gap-3 bg-white border border-[#D1D5DB] rounded-xl px-4 py-3 hover:shadow-sm transition-shadow group"
              >
                <div className={`w-1 self-stretch rounded-full shrink-0 ${meta.accent}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs text-[#6B7280]">{c.code}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${meta.pill}`}>
                      {meta.label}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-[#1A2B4E] truncate group-hover:text-[#E60012] transition-colors">
                    {c.title}
                  </p>
                  <p className="text-xs text-[#6B7280] mt-0.5">
                    {c.instructor} / {c.credits}単位 / {c.semester} {c.day}曜{c.period}
                  </p>
                </div>
                <span className="text-[#D1D5DB] text-lg shrink-0">›</span>
              </Link>
            );
          })
        )}
      </div>

      {/* シラバスチャット */}
      <div className="bg-white border border-[#D1D5DB] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#E5E7EB] bg-[#F9FAFB]">
          <h2 className="text-sm font-semibold text-[#1A2B4E]">AIに質問する（シラバス全体）</h2>
        </div>
        <div className="px-5 py-4 space-y-3 max-h-52 overflow-y-auto">
          {chatMessages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                  m.role === "user"
                    ? "bg-[#1A2B4E] text-white"
                    : "bg-[#F3F4F6] text-[#1A2B4E]"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-[#E5E7EB] flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="シラバスについて質問..."
            className="flex-1 border border-[#D1D5DB] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#1A2B4E] transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={!chatInput.trim()}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#E60012] disabled:opacity-40 hover:bg-[#b7000c] transition-colors"
          >
            <Send size={14} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
