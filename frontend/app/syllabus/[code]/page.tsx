"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Send } from "lucide-react";

const DEMO_DETAIL = {
  code: "CS-101",
  title: "プログラミング基礎",
  instructor: "山田 教授",
  credits: 2,
  semester: "前期",
  day: "月",
  period: "1限",
  type: "required" as const,
  description:
    "本講義では、計算機科学における基本的なアルゴリズムとデータ構造について学ぶ。配列・リスト・スタック・キュー・木・グラフなどの構造と、それらを用いた探索・整列・動的計画法などのアルゴリズムを扱う。計算量の概念を理解し、問題に応じた適切なアルゴリズムを選択する能力を養う。",
  evaluation:
    "期末試験 60%・レポート課題 30%・平常点 10%（出席状況・授業への参加度）",
  textbook: "アルゴリズムとデータ構造（第2版）著:野崎昭弘 他",
  note: "プログラミング基礎（B11111）を事前に履修していることが望ましい。",
};

const TYPE_META = {
  required: { label: "必修", accent: "bg-[#E60012]", pill: "bg-[#E60012] text-white" },
  elective: { label: "選択", accent: "bg-[#1A2B4E]", pill: "bg-[#1A2B4E] text-white" },
  completed: { label: "修得済", accent: "bg-[#6B7280]", pill: "bg-[#6B7280] text-white" },
};

export default function SyllabusDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const course = { ...DEMO_DETAIL, code };
  const meta = TYPE_META[course.type];

  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([
    {
      role: "assistant",
      content: `「${course.title}」についてご質問ください。例：「この講義と類似する講義との違いは？」`,
    },
  ]);

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
    <div className="max-w-screen-lg mx-auto px-4 md:px-8 py-6">
      {/* パンくず */}
      <nav className="flex items-center gap-1 text-xs text-[#6B7280] mb-5">
        <Link href="/syllabus" className="flex items-center gap-0.5 hover:text-[#1A2B4E]">
          <ChevronLeft size={14} />
          シラバス一覧
        </Link>
        <span className="mx-1">›</span>
        <span className="text-[#1A2B4E] font-medium truncate">{course.title}</span>
      </nav>

      {/* 講義ヘッダーカード */}
      <div className="bg-white border border-[#D1D5DB] rounded-xl overflow-hidden mb-4">
        <div className="flex">
          {/* アクセントバー */}
          <div className={`w-1 shrink-0 ${meta.accent}`} />
          <div className="flex-1 p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-[#6B7280]">{course.code}</span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${meta.pill}`}>
                {meta.label}
              </span>
            </div>
            <h1 className="text-xl font-bold text-[#1A2B4E] leading-snug mb-1">
              {course.title}
            </h1>
            <p className="text-sm text-[#6B7280]">{course.instructor}</p>

            {/* メタ情報 */}
            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-[#E5E7EB]">
              {[
                { label: "単位数", value: `${course.credits}単位` },
                { label: "開講期", value: course.semester },
                { label: "曜日・時限", value: `${course.day}曜${course.period}` },
              ].map((item) => (
                <div key={item.label} className="text-center">
                  <p className="text-[10px] text-[#9CA3AF] font-medium uppercase tracking-wide">
                    {item.label}
                  </p>
                  <p className="text-sm font-semibold text-[#1A2B4E] mt-0.5">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 講義内容セクション */}
      <div className="space-y-3 mb-6">
        {[
          { label: "講義概要", content: course.description },
          { label: "成績評価", content: course.evaluation },
          { label: "教科書", content: course.textbook },
          { label: "備考", content: course.note },
        ].map((section) => (
          <div
            key={section.label}
            className="bg-white border border-[#D1D5DB] rounded-xl p-4"
          >
            <h2 className="text-xs font-semibold text-[#1A2B4E] uppercase tracking-wide mb-2">
              {section.label}
            </h2>
            <p className="text-sm text-[#1A2B4E] leading-relaxed">{section.content}</p>
          </div>
        ))}
      </div>

      {/* 講義チャット */}
      <div className="bg-white border border-[#D1D5DB] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#E5E7EB] bg-[#F9FAFB]">
          <h2 className="text-sm font-semibold text-[#1A2B4E]">
            AIに質問する（この講義について）
          </h2>
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
            placeholder="この講義について質問..."
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
