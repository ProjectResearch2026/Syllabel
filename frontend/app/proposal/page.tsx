"use client";

import { useState, useRef, useEffect } from "react";

const DAYS = ["月", "火", "水", "木", "金"] as const;
const PERIODS = ["1限", "2限", "3限", "4限", "5限"] as const;

type CourseBlock = {
  name: string;
  code: string;
  type: "required" | "elective";
};

type Timetable = Record<string, Record<string, CourseBlock | null>>;

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const DEMO_TIMETABLE: Timetable = {
  月: {
    "1限": { name: "アルゴリズムとデータ構造", code: "A12345", type: "required" },
    "2限": null,
    "3限": { name: "機械学習入門", code: "B23456", type: "elective" },
    "4限": null,
    "5限": null,
  },
  火: {
    "1限": null,
    "2限": { name: "データベース論", code: "C34567", type: "required" },
    "3限": null,
    "4限": { name: "コンピュータネットワーク", code: "D45678", type: "elective" },
    "5限": null,
  },
  水: {
    "1限": { name: "線形代数学", code: "E56789", type: "required" },
    "2限": null,
    "3限": null,
    "4限": { name: "プロジェクト演習", code: "F67890", type: "elective" },
    "5限": null,
  },
  木: {
    "1限": null,
    "2限": { name: "ソフトウェア工学", code: "G78901", type: "required" },
    "3限": null,
    "4限": null,
    "5限": null,
  },
  金: {
    "1限": null,
    "2限": null,
    "3限": { name: "情報倫理", code: "H89012", type: "elective" },
    "4限": null,
    "5限": null,
  },
};

const DEMO_MESSAGES: Message[] = [
  {
    id: "1",
    role: "assistant",
    content:
      "3回生・知能情報メディア課程の履修提案を生成しました。卒業要件を考慮し、必修4科目・選択3科目で合計16単位を提案しています。ご質問があればお気軽にどうぞ。",
  },
];

export default function ProposalPage() {
  const [messages, setMessages] = useState<Message[]>(DEMO_MESSAGES);
  const [input, setInput] = useState("");
  const [selectedCourse, setSelectedCourse] = useState<CourseBlock | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;

    const userMsg: Message = {
      id: String(Date.now()),
      role: "user",
      content: text,
    };
    const assistantMsg: Message = {
      id: String(Date.now() + 1),
      role: "assistant",
      content: "（AI応答はバックエンド実装後に有効になります）",
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* 時間割 */}
      <div className="bg-white border-b border-[#D1D5DB] overflow-x-auto">
        <div className="max-w-screen-xl mx-auto px-4 py-3">
          <h2 className="text-sm font-semibold text-[#1A2B4E] mb-2">
            提案時間割（前期）
          </h2>
          <table className="w-full min-w-[360px] border-collapse text-xs">
            <thead>
              <tr>
                <th className="w-10 py-1" />
                {DAYS.map((d) => (
                  <th
                    key={d}
                    className="py-1 text-center font-semibold text-[#1A2B4E]"
                  >
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERIODS.map((p) => (
                <tr key={p}>
                  <td className="text-center text-[#946e69] py-1 pr-1 font-medium">
                    {p}
                  </td>
                  {DAYS.map((d) => {
                    const course = DEMO_TIMETABLE[d]?.[p];
                    return (
                      <td key={d} className="p-0.5">
                        {course ? (
                          <button
                            onClick={() =>
                              setSelectedCourse(
                                selectedCourse?.code === course.code
                                  ? null
                                  : course
                              )
                            }
                            className={`w-full h-12 rounded text-left px-1.5 py-1 leading-tight transition-colors ${
                              course.type === "required"
                                ? "bg-[#fff7f6] border border-[#E60012] text-[#E60012] hover:bg-[#ffdad6]"
                                : "bg-[#f0f3ff] border border-[#1A2B4E] text-[#1A2B4E] hover:bg-[#c1d1fd]"
                            } ${selectedCourse?.code === course.code ? "ring-2 ring-offset-1 ring-current" : ""}`}
                          >
                            <span className="block text-[10px] font-semibold leading-none">
                              {course.code}
                            </span>
                            <span className="block text-[10px] leading-snug mt-0.5 line-clamp-2">
                              {course.name}
                            </span>
                          </button>
                        ) : (
                          <div className="w-full h-12 rounded border border-[#eeeeee] bg-[#f9f9f9]" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {/* 凡例 */}
          <div className="flex gap-3 mt-2">
            <span className="flex items-center gap-1 text-[10px] text-[#E60012]">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#fff7f6] border border-[#E60012]" />
              必修
            </span>
            <span className="flex items-center gap-1 text-[10px] text-[#1A2B4E]">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#f0f3ff] border border-[#1A2B4E]" />
              選択
            </span>
          </div>
        </div>
      </div>

      {/* 選択中の科目詳細 */}
      {selectedCourse && (
        <div className="bg-[#f3f3f3] border-b border-[#D1D5DB] px-4 py-2 text-sm">
          <div className="max-w-screen-xl mx-auto flex items-center justify-between gap-2">
            <div>
              <span className="font-semibold text-[#1A2B4E]">
                {selectedCourse.name}
              </span>
              <span className="ml-2 text-xs text-[#946e69]">
                {selectedCourse.code}
              </span>
            </div>
            <a
              href={`/syllabus/${selectedCourse.code}`}
              className="text-xs text-[#1A2B4E] underline hover:text-[#E60012]"
            >
              シラバスを見る
            </a>
          </div>
        </div>
      )}

      {/* チャット */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 max-w-screen-xl w-full mx-auto">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-[#E60012] text-white"
                  : "bg-white border border-[#D1D5DB] text-[#1a1c1c]"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 入力欄 */}
      <div className="bg-white border-t border-[#D1D5DB] px-4 py-3">
        <div className="max-w-screen-xl mx-auto flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="提案について質問する..."
            className="flex-1 border border-[#D1D5DB] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#E60012] transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="px-4 py-2 rounded bg-[#E60012] text-white text-sm font-medium hover:bg-[#b7000c] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            送信
          </button>
        </div>
      </div>
    </div>
  );
}
