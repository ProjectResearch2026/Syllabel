"use client";

import { useState } from "react";
import { Sparkles, Send } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };

export default function SyllabusChatBox({
  title,
  placeholder,
  initialMessage,
}: {
  title: string;
  placeholder: string;
  initialMessage: string;
}) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: initialMessage },
  ]);
  const [input, setInput] = useState("");

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "（AI応答はバックエンド実装後に有効になります）" },
    ]);
    setInput("");
  };

  return (
    <div className="bg-white border border-[#D1D5DB] rounded-lg overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#D1D5DB]">
        <div className="w-[30px] h-[30px] rounded-full bg-[#E60012] flex items-center justify-center shrink-0">
          <Sparkles size={16} className="text-white" />
        </div>
        <h2 className="text-sm font-bold text-[#1A2B4E]">{title}</h2>
      </div>
      <div className="px-4 py-4 space-y-3 max-h-52 overflow-y-auto bg-[#F8F9FA]">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed border ${
                m.role === "user"
                  ? "bg-[#EEF0F5] border-[#D1D5DB] text-[#1A2B4E] rounded-tr-sm"
                  : "bg-white border-[#D1D5DB] text-[#1A2B4E] rounded-tl-sm"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
      </div>
      <div className="px-3 py-3 border-t border-[#D1D5DB] flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder={placeholder}
          className="flex-1 h-10 bg-[#F8F9FA] border border-[#D1D5DB] rounded-full px-3.5 text-[13px] text-[#1A2B4E] placeholder-[#9CA3AF] focus:outline-none focus:border-[#1A2B4E] transition-colors"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-[#E60012] disabled:opacity-40 hover:bg-[#b7000c] transition-colors shrink-0"
        >
          <Send size={16} className="text-white" />
        </button>
      </div>
    </div>
  );
}
