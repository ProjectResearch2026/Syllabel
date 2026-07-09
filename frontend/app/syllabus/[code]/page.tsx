"use client";

import { use, useState } from "react";
import Link from "next/link";

const DEMO_DETAIL = {
  code: "A12345",
  title: "アルゴリズムとデータ構造",
  instructor: "山田 太郎",
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

const TYPE_LABEL = { required: "必修", elective: "選択", completed: "修得済" };
const TYPE_CLASS = {
  required: "bg-[#E60012] text-white",
  elective: "bg-[#1A2B4E] text-white",
  completed: "bg-[#727272] text-white",
};

export default function SyllabusDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const course = { ...DEMO_DETAIL, code };

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
      {
        role: "assistant",
        content: "（AI応答はバックエンド実装後に有効になります）",
      },
    ]);
    setChatInput("");
  };

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-6">
      {/* パンくず */}
      <nav className="text-xs text-[#946e69] mb-4">
        <Link href="/syllabus" className="hover:text-[#E60012]">
          シラバス
        </Link>
        <span className="mx-1">›</span>
        <span>{course.title}</span>
      </nav>

      {/* 講義ヘッダー */}
      <div className="bg-white border border-[#D1D5DB] rounded-lg p-5 mb-4">
        <div className="flex items-start gap-3">
          <div
            className={`w-1 self-stretch rounded-full ${
              course.type === "required" ? "bg-[#E60012]" : "bg-[#1A2B4E]"
            }`}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-[#946e69]">{course.code}</span>
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-xl ${TYPE_CLASS[course.type]}`}
              >
                {TYPE_LABEL[course.type]}
              </span>
            </div>
            <h1 className="text-lg font-bold text-[#1A2B4E] leading-snug">
              {course.title}
            </h1>
            <p className="text-sm text-[#5f3f3b] mt-1">
              {course.instructor} 教授
            </p>
          </div>
        </div>

        {/* メタ情報 */}
        <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-[#eeeeee]">
          {[
            { label: "単位数", value: `${course.credits}単位` },
            { label: "開講期", value: course.semester },
            { label: "曜日・時限", value: `${course.day}曜${course.period}` },
          ].map((item) => (
            <div key={item.label} className="text-center">
              <p className="text-[10px] text-[#946e69] font-medium uppercase tracking-wide">
                {item.label}
              </p>
              <p className="text-sm font-semibold text-[#1a1c1c] mt-0.5">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 講義内容 */}
      <div className="space-y-3 mb-6">
        {[
          { label: "講義概要", content: course.description },
          { label: "成績評価", content: course.evaluation },
          { label: "教科書", content: course.textbook },
          { label: "備考", content: course.note },
        ].map((section) => (
          <div
            key={section.label}
            className="bg-white border border-[#D1D5DB] rounded-lg p-4"
          >
            <h2 className="text-xs font-semibold text-[#1A2B4E] uppercase tracking-wide mb-2">
              {section.label}
            </h2>
            <p className="text-sm text-[#1a1c1c] leading-relaxed">
              {section.content}
            </p>
          </div>
        ))}
      </div>

      {/* 講義チャット */}
      <div className="bg-white border border-[#D1D5DB] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#D1D5DB] bg-[#f9f9f9]">
          <h2 className="text-sm font-semibold text-[#1A2B4E]">
            AIに質問する（この講義について）
          </h2>
        </div>
        <div className="px-4 py-3 space-y-2 max-h-52 overflow-y-auto">
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
            placeholder="この講義について質問..."
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
