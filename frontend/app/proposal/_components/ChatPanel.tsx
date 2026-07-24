"use client";

import { useRef, useEffect, useState } from "react";
import { Sparkles, Send } from "lucide-react";
import { useChatStore } from "@/lib/chat";

const INIT_MESSAGE_ID = "proposal-init-1";

export default function ChatPanel() {
  const { proposalMessages, setProposalMessages, addProposalMessage } = useChatStore();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (proposalMessages.length === 0) {
      const now = new Date();
      const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
      setProposalMessages([
        {
          id: INIT_MESSAGE_ID,
          role: "assistant",
          content:
            "卒業要件から逆算し、今期は必修6科目＋選択2科目を提案しました。コマ重複はありません。ご質問があればお気軽にどうぞ。",
          time,
        },
      ]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [proposalMessages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    const now = new Date();
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
    addProposalMessage({ id: String(Date.now()), role: "user", content: text, time });
    addProposalMessage({ id: String(Date.now() + 1), role: "assistant", content: "（AI応答はバックエンド実装後に有効になります）", time });
    setInput("");
  };

  return (
    <div className="w-[360px] shrink-0 flex flex-col border-l border-[#D1D5DB] bg-white">
      {/* Header */}
      <div className="flex items-center gap-2.5 h-[52px] px-4 border-b border-[#D1D5DB] shrink-0">
        <div className="w-[30px] h-[30px] rounded-full bg-[#E60012] flex items-center justify-center shrink-0">
          <Sparkles size={16} className="text-white" />
        </div>
        <div className="flex flex-col">
          <span className="text-[#1A2B4E] text-sm font-bold leading-tight">AI履修アシスタント</span>
          <span className="text-[#10B981] text-[11px] leading-tight">● 提案の理由を質問できます</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3.5 bg-[#F8F9FA]">
        {proposalMessages.map((msg) => (
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
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-[#D1D5DB] shrink-0 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="提案について質問する…"
          className="flex-1 h-10 bg-[#F8F9FA] border border-[#D1D5DB] rounded-full px-3.5 text-[13px] text-[#1A2B4E] placeholder-[#9CA3AF] focus:outline-none focus:border-[#1A2B4E] transition-colors"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-[#E60012] disabled:opacity-40 transition-opacity hover:bg-[#b7000c] shrink-0"
        >
          <Send size={18} className="text-white" />
        </button>
      </div>
    </div>
  );
}
