"use client";

import { useRef, useEffect, useState } from "react";
import { Send } from "lucide-react";
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
            "3回生・知能情報メディア課程の履修提案を生成しました。卒業要件を考慮し、必修5科目・選択3科目で合計18単位を提案しています。ご質問があればお気軽にどうぞ。",
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
    <div className="w-[400px] shrink-0 flex flex-col border-l border-[#E5E7EB] bg-white">
      <div className="px-5 py-3 border-b border-[#E5E7EB] shrink-0">
        <h2 className="text-[#1A2B4E] text-sm font-semibold">AIに質問する</h2>
        <p className="text-[#6B7280] text-xs mt-0.5">提案内容について何でも聞いてください</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {proposalMessages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user" ? "bg-[#1A2B4E] text-white" : "bg-[#F3F4F6] text-[#1A2B4E]"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 py-3 border-t border-[#E5E7EB] shrink-0 flex gap-2">
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
          className="w-10 h-10 flex items-center justify-center rounded-lg bg-[#E60012] disabled:opacity-40 transition-opacity hover:bg-[#b7000c]"
        >
          <Send size={16} className="text-white" />
        </button>
      </div>
    </div>
  );
}
