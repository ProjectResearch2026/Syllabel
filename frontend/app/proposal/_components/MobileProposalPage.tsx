"use client";

import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";
import { DAYS, PERIODS, TIMETABLE, CELL_STYLES } from "@/lib/timetable";

type Message = { id: string; role: "user" | "assistant"; content: string };

const INIT_MESSAGES: Message[] = [
  {
    id: "1",
    role: "assistant",
    content:
      "3回生・知能情報メディア課程の履修提案を生成しました。卒業要件を考慮し、必修5科目・選択3科目で合計18単位を提案しています。ご質問があればお気軽にどうぞ。",
  },
];

export default function MobileProposalPage() {
  const [messages, setMessages] = useState<Message[]>(INIT_MESSAGES);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      { id: String(Date.now()), role: "user", content: text },
      { id: String(Date.now() + 1), role: "assistant", content: "（AI応答はバックエンド実装後に有効になります）" },
    ]);
    setInput("");
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-96px)] bg-[#F8F9FA]">
      {/* CreditBar */}
      <div className="flex items-center justify-around px-5 bg-white border-b border-[#D1D5DB] shrink-0 py-2">
        {[
          { val: "62", label: "取得済み単位" },
          { val: "18", label: "今期登録単位" },
          { val: "46", label: "卒業残り単位" },
        ].map(({ val, label }) => (
          <div key={label} className="flex flex-col items-center gap-0.5">
            <span className="text-[#1A2B4E] text-xl font-bold font-mono leading-none">{val}</span>
            <span className="text-[#6B7280] text-[10px]">{label}</span>
          </div>
        ))}
      </div>

      {/* Timetable */}
      <div className="bg-white border-b border-[#D1D5DB] shrink-0">
        <div className="flex flex-col">
          <div className="flex bg-[#1A2B4E]">
            <div className="w-7 shrink-0" />
            {DAYS.map((d) => (
              <div key={d} className="flex-1 h-8 flex items-center justify-center">
                <span className="text-white text-[13px] font-semibold">{d}</span>
              </div>
            ))}
          </div>
          {PERIODS.map((p) => (
            <div key={p} className="flex border-b border-[#E5E7EB]" style={{ height: 64 }}>
              <div className="w-7 shrink-0 bg-[#F9FAFB] border-r border-[#E5E7EB] flex flex-col items-center justify-center">
                <span className="text-[#1A2B4E] text-[13px] font-bold font-mono leading-none">{p}</span>
                <span className="text-[#9CA3AF] text-[9px]">限</span>
              </div>
              {DAYS.map((d) => {
                const cell = TIMETABLE[p]?.[d] ?? null;
                const style = cell?.type ? CELL_STYLES[cell.type] : null;
                return (
                  <div
                    key={d}
                    className={`flex-1 border-r border-[#E5E7EB] last:border-r-0 flex flex-col justify-center gap-0.5 px-1 py-1 ${
                      style ? style.bg : "bg-white"
                    }`}
                  >
                    {cell && style && (
                      <>
                        <span className="text-[#1A2B4E] text-[9px] font-semibold leading-tight">
                          {cell.name}
                        </span>
                        <span className={`inline-block self-start px-1 py-px rounded-sm text-white text-[7px] ${style.tag}`}>
                          {style.label}
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-[#1A2B4E] text-white"
                  : "bg-white border border-[#D1D5DB] text-[#1A2B4E]"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-[#D1D5DB] px-4 py-3 shrink-0 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="提案について質問する..."
          className="flex-1 border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1A2B4E] transition-colors"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="w-10 h-10 flex items-center justify-center rounded-lg bg-[#E60012] disabled:opacity-40 hover:bg-[#b7000c]"
        >
          <Send size={16} className="text-white" />
        </button>
      </div>
    </div>
  );
}
