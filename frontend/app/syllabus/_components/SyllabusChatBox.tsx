"use client";

import { useState } from "react";
import { Send } from "lucide-react";

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
    <div className="bg-white border border-[#D1D5DB] rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-[#E5E7EB] bg-[#F9FAFB]">
        <h2 className="text-sm font-semibold text-[#1A2B4E]">{title}</h2>
      </div>
      <div className="px-5 py-4 space-y-3 max-h-52 overflow-y-auto">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                m.role === "user" ? "bg-[#1A2B4E] text-white" : "bg-[#F3F4F6] text-[#1A2B4E]"
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
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder={placeholder}
          className="flex-1 border border-[#D1D5DB] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#1A2B4E] transition-colors"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#E60012] disabled:opacity-40 hover:bg-[#b7000c] transition-colors"
        >
          <Send size={14} className="text-white" />
        </button>
      </div>
    </div>
  );
}
