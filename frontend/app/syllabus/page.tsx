"use client";

import { useState } from "react";
import Link from "next/link";

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
    code: "A12345",
    title: "アルゴリズムとデータ構造",
    instructor: "山田 太郎",
    credits: 2,
    semester: "前期",
    day: "月",
    period: "1限",
    type: "required",
  },
  {
    code: "B23456",
    title: "機械学習入門",
    instructor: "鈴木 花子",
    credits: 2,
    semester: "前期",
    day: "月",
    period: "3限",
    type: "elective",
  },
  {
    code: "C34567",
    title: "データベース論",
    instructor: "佐藤 次郎",
    credits: 2,
    semester: "前期",
    day: "火",
    period: "2限",
    type: "required",
  },
  {
    code: "D45678",
    title: "コンピュータネットワーク",
    instructor: "田中 三郎",
    credits: 2,
    semester: "前期",
    day: "火",
    period: "4限",
    type: "elective",
  },
  {
    code: "E56789",
    title: "線形代数学",
    instructor: "高橋 四郎",
    credits: 2,
    semester: "前期",
    day: "水",
    period: "1限",
    type: "completed",
  },
  {
    code: "F67890",
    title: "プロジェクト演習",
    instructor: "渡辺 五郎",
    credits: 2,
    semester: "後期",
    day: "水",
    period: "4限",
    type: "elective",
  },
  {
    code: "G78901",
    title: "ソフトウェア工学",
    instructor: "伊藤 六郎",
    credits: 2,
    semester: "前期",
    day: "木",
    period: "2限",
    type: "required",
  },
  {
    code: "H89012",
    title: "情報倫理",
    instructor: "中村 七郎",
    credits: 2,
    semester: "前期",
    day: "金",
    period: "3限",
    type: "elective",
  },
];

const TYPE_LABEL: Record<Course["type"], string> = {
  required: "必修",
  elective: "選択",
  completed: "修得済",
};

const TYPE_CLASS: Record<Course["type"], string> = {
  required: "bg-[#E60012] text-white",
  elective: "bg-[#1A2B4E] text-white",
  completed: "bg-[#727272] text-white",
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
      content: "シラバスについて質問してください。例：「プログラミングを扱う選択科目を一覧で」",
    },
  ]);

  const filtered = DEMO_COURSES.filter((c) => {
    const matchQuery =
      !query ||
      c.title.includes(query) ||
      c.code.includes(query) ||
      c.instructor.includes(query);
    const matchFilter =
      filter === "すべて" || TYPE_LABEL[c.type] === filter;
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
    <div className="max-w-screen-xl mx-auto px-4 py-6">
      <h1 className="text-[#1A2B4E] text-xl font-bold mb-4">シラバス</h1>

      {/* 検索 */}
      <div className="mb-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="科目名・コード・担当教員で検索"
          className="w-full border border-[#D1D5DB] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#E60012] transition-colors"
        />
      </div>

      {/* フィルタチップ */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full border text-xs font-medium whitespace-nowrap transition-colors ${
              filter === f
                ? "bg-[#1A2B4E] text-white border-[#1A2B4E]"
                : "border-[#D1D5DB] text-[#1a1c1c] hover:border-[#946e69]"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* 科目一覧 */}
      <div className="space-y-2 mb-8">
        {filtered.length === 0 ? (
          <p className="text-sm text-[#946e69] text-center py-8">
            該当する科目がありません
          </p>
        ) : (
          filtered.map((c) => (
            <Link
              key={c.code}
              href={`/syllabus/${c.code}`}
              className="flex items-center gap-3 bg-white border border-[#D1D5DB] rounded-lg px-4 py-3 hover:shadow-sm transition-shadow group"
            >
              {/* アクセントバー */}
              <div
                className={`w-1 self-stretch rounded-full ${
                  c.type === "required"
                    ? "bg-[#E60012]"
                    : c.type === "elective"
                    ? "bg-[#1A2B4E]"
                    : "bg-[#727272]"
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs text-[#946e69]">{c.code}</span>
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-xl ${TYPE_CLASS[c.type]}`}
                  >
                    {TYPE_LABEL[c.type]}
                  </span>
                </div>
                <p className="text-sm font-medium text-[#1a1c1c] truncate group-hover:text-[#E60012] transition-colors">
                  {c.title}
                </p>
                <p className="text-xs text-[#5f3f3b] mt-0.5">
                  {c.instructor} / {c.credits}単位 / {c.semester}{" "}
                  {c.day}曜{c.period}
                </p>
              </div>
              <span className="text-[#D1D5DB] text-lg">›</span>
            </Link>
          ))
        )}
      </div>

      {/* シラバスチャット */}
      <div className="bg-white border border-[#D1D5DB] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#D1D5DB] bg-[#f9f9f9]">
          <h2 className="text-sm font-semibold text-[#1A2B4E]">
            AIに質問する（シラバス全体）
          </h2>
        </div>
        <div className="px-4 py-3 space-y-2 max-h-48 overflow-y-auto">
          {chatMessages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                  m.role === "user"
                    ? "bg-[#E60012] text-white"
                    : "bg-[#f3f3f3] text-[#1a1c1c]"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
        </div>
        <div className="px-3 py-2 border-t border-[#D1D5DB] flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="シラバスについて質問..."
            className="flex-1 border border-[#D1D5DB] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#E60012] transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={!chatInput.trim()}
            className="px-3 py-1.5 rounded bg-[#E60012] text-white text-xs font-medium hover:bg-[#b7000c] transition-colors disabled:opacity-40"
          >
            送信
          </button>
        </div>
      </div>
    </div>
  );
}
