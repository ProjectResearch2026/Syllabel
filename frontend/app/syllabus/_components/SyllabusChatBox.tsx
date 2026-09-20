"use client";

import { useState, useRef, useCallback } from "react";
import { Sparkles, Send } from "lucide-react";
import { useStudentStore } from "@/lib/student";
import { streamCourseChat, streamSyllabusChat } from "@/lib/chatApi";

type Message = { role: "user" | "assistant"; content: string; streaming?: boolean };

export default function SyllabusChatBox({
  code,
  title,
  placeholder,
  initialMessage,
  questions = [],
}: {
  code?: string;
  title: string;
  placeholder: string;
  initialMessage: string;
  /** その科目のシラバスで答えられる質問だけを並べる(`lib/courseQuestions.ts`) */
  questions?: string[];
}) {
  const profile = useStudentStore((s) => s.profile);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: initialMessage },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || streaming) return;
    setInput("");

    const history = messages
      .filter((m) => !m.streaming)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "", streaming: true },
    ]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStreaming(true);

    try {
      let accumulated = "";
      const onDelta = (delta: string) => {
        accumulated += delta;
        setMessages((prev) =>
          prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: accumulated } : m,
          ),
        );
      };
      const body = { profile, history, message: text };

      // code が無ければシラバス全体への質問(§7.4)。講義単位の口(§7.5)は
      // 実在する講義コードしか受けないため、架空のコードで代用してはならない。
      await (code
        ? streamCourseChat(code, body, onDelta, ctrl.signal)
        : streamSyllabusChat(body, onDelta, ctrl.signal));
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) =>
          prev.map((m, i) =>
            i === prev.length - 1
              ? { ...m, content: "申し訳ありません。応答の取得に失敗しました。" }
              : m,
          ),
        );
      }
    } finally {
      setMessages((prev) =>
        prev.map((m, i) =>
          i === prev.length - 1 ? { ...m, streaming: false } : m,
        ),
      );
      setStreaming(false);
      abortRef.current = null;
    }
  }, [code, messages, profile, streaming]);

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
              {m.content || (m.streaming ? <span className="animate-pulse">▌</span> : "")}
            </div>
          </div>
        ))}
        {!streaming && questions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-0.5">
            {questions.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                className="rounded-full border border-[#D1D5DB] bg-white px-3 py-1.5 text-xs font-medium text-[#E60012] transition-colors active:bg-[#FFF0F1]"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="px-3 py-3 border-t border-[#D1D5DB] flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder={placeholder}
          disabled={streaming}
          className="flex-1 h-10 bg-[#F8F9FA] border border-[#D1D5DB] rounded-full px-3.5 text-[13px] text-[#1A2B4E] placeholder-[#9CA3AF] focus:outline-none focus:border-[#1A2B4E] transition-colors disabled:opacity-60"
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || streaming}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-[#E60012] disabled:opacity-40 hover:bg-[#b7000c] transition-colors shrink-0"
        >
          <Send size={16} className="text-white" />
        </button>
      </div>
    </div>
  );
}
