"use client";

import { useRef, useEffect, useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { useChatStore } from "@/lib/chat";

const QUICK_ASKS = ["課題の分量はどのくらい？", "出席は評価に影響する？"];

export default function CourseChatPanel({
  code,
  title,
}: {
  code: string;
  title: string;
}) {
  const { courseMessages, setCourseMessages, addCourseMessage } = useChatStore();
  const messages = courseMessages[code] ?? [];
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if ((courseMessages[code] ?? []).length === 0) {
      const now = new Date();
      const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
      setCourseMessages(code, [
        {
          id: `course-init-${code}`,
          role: "assistant",
          content: `「${title}」についてご質問ください。シラバスの内容にAIが回答します。`,
          time,
        },
      ]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = (text: string) => {
    if (!text.trim()) return;
    const now = new Date();
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
    addCourseMessage(code, { id: String(Date.now()), role: "user", content: text, time });
    addCourseMessage(code, {
      id: String(Date.now() + 1),
      role: "assistant",
      content: "（AI応答はバックエンド実装後に有効になります）",
      time,
    });
    setInput("");
  };

  return (
    <div className="hidden md:flex w-[360px] shrink-0 flex-col border-l border-[#D1D5DB] bg-white">
      {/* Header */}
      <div className="flex items-center gap-2.5 h-[52px] px-4 border-b border-[#D1D5DB] shrink-0">
        <div className="w-[30px] h-[30px] rounded-full bg-[#E60012] flex items-center justify-center shrink-0">
          <MessageCircle size={16} className="text-white" />
        </div>
        <div className="flex flex-col">
          <span className="text-[#1A2B4E] text-sm font-bold leading-tight">この講義について質問</span>
          <span className="text-[#4B5563] text-[11px] leading-tight">{code} の内容にAIが回答</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3.5 bg-[#F8F9FA]">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[270px] rounded-xl px-3 py-2.5 text-[13px] leading-relaxed border ${
                msg.role === "user"
                  ? "bg-[#EEF0F5] border-[#D1D5DB] text-[#1A2B4E] rounded-tr-sm"
                  : "bg-white border-[#D1D5DB] text-[#1A2B4E] rounded-tl-sm"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {/* Quick asks */}
        <div className="flex flex-col gap-2 pt-1">
          {QUICK_ASKS.map((q) => (
            <button
              key={q}
              onClick={() => send(q)}
              className="self-start bg-white border border-[#D1D5DB] rounded-full px-3 py-1.5 text-xs text-[#E60012] font-medium hover:bg-[#FFF0F1] transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-[#D1D5DB] shrink-0 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="この講義について質問する…"
          className="flex-1 h-10 bg-[#F8F9FA] border border-[#D1D5DB] rounded-full px-3.5 text-[13px] text-[#1A2B4E] placeholder-[#9CA3AF] focus:outline-none focus:border-[#1A2B4E] transition-colors"
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim()}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-[#E60012] disabled:opacity-40 hover:bg-[#b7000c] transition-colors shrink-0"
        >
          <Send size={18} className="text-white" />
        </button>
      </div>
    </div>
  );
}
