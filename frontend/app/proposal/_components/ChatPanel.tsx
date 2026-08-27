"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Sparkles, Send } from "lucide-react";
import { useChatStore } from "@/lib/chat";
import { useStudentStore } from "@/lib/student";
import { useProposalStore } from "@/lib/proposal";
import { streamProposalChat } from "@/lib/chatApi";

export default function ChatPanel() {
  const { proposalMessages, setProposalMessages, addProposalMessage } = useChatStore();
  const profile = useStudentStore((s) => s.profile);
  const { status, message: proposalMessage } = useProposalStore();
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const seq = useRef(0);

  // 提案が完了したらその説明を初期メッセージとして設定
  useEffect(() => {
    if (status === "done" && proposalMessages.length === 0) {
      const now = new Date();
      const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
      setProposalMessages([
        {
          id: "proposal-init-1",
          role: "assistant",
          content:
            proposalMessage ||
            "卒業要件から逆算し、今期の履修を提案しました。コマ重複はありません。ご質問があればお気軽にどうぞ。",
          time,
        },
      ]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // 提案生成中の表示
  useEffect(() => {
    if (status === "loading" && proposalMessages.length === 0) {
      const now = new Date();
      const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
      setProposalMessages([
        {
          id: "proposal-loading",
          role: "assistant",
          content: "",
          time,
          streaming: true,
        },
      ]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [proposalMessages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");

    const now = new Date();
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
    const base = seq.current;
    seq.current += 2;
    const assistantId = `proposal-a${base + 1}`;

    const history = proposalMessages
      .filter((m) => !m.streaming)
      .map((m) => ({ role: m.role, content: m.content }));

    addProposalMessage({ id: `proposal-u${base}`, role: "user", content: text, time });
    addProposalMessage({ id: assistantId, role: "assistant", content: "", time, streaming: true });

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStreaming(true);

    try {
      let accumulated = "";
      await streamProposalChat(
        { profile, history, message: text },
        (delta) => {
          accumulated += delta;
          useChatStore.setState((state) => ({
            proposalMessages: state.proposalMessages.map((m) =>
              m.id === assistantId ? { ...m, content: accumulated } : m,
            ),
          }));
        },
        ctrl.signal,
      );
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        useChatStore.setState((state) => ({
          proposalMessages: state.proposalMessages.map((m) =>
            m.id === assistantId
              ? { ...m, content: "申し訳ありません。応答の取得に失敗しました。" }
              : m,
          ),
        }));
      }
    } finally {
      useChatStore.setState((state) => ({
        proposalMessages: state.proposalMessages.map((m) =>
          m.id === assistantId ? { ...m, streaming: false } : m,
        ),
      }));
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, profile, proposalMessages, addProposalMessage]);

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
              {msg.content || (msg.streaming ? <span className="animate-pulse">▌</span> : "")}
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
          disabled={streaming || status === "loading"}
          className="flex-1 h-10 bg-[#F8F9FA] border border-[#D1D5DB] rounded-full px-3.5 text-[13px] text-[#1A2B4E] placeholder-[#9CA3AF] focus:outline-none focus:border-[#1A2B4E] transition-colors disabled:opacity-60"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || streaming || status === "loading"}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-[#E60012] disabled:opacity-40 transition-opacity hover:bg-[#b7000c] shrink-0"
        >
          <Send size={18} className="text-white" />
        </button>
      </div>
    </div>
  );
}
