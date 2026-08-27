"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send } from "lucide-react";
import { DAYS, PERIODS, CELL_STYLES, type Timetable } from "@/lib/timetable";
import { useStudentStore } from "@/lib/student";
import { useProposalStore } from "@/lib/proposal";
import { useGraduationCredits } from "@/lib/curricula";
import { streamProposalChat } from "@/lib/chatApi";
import type { ProposedCourse } from "@/lib/chatApi";
import type { ChatMessage } from "@/lib/chat";

function coursesToTimetable(courses: ProposedCourse[]): Timetable {
  const timetable: Timetable = {};
  for (const course of courses) {
    if (!timetable[course.period]) timetable[course.period] = {};
    timetable[course.period][course.day] = { name: course.name, type: course.type };
  }
  return timetable;
}

export default function MobileProposalPage() {
  const profile = useStudentStore((s) => s.profile);
  const { status, courses, totalCredits, message: proposalMessage } = useProposalStore();
  const graduationCredits = useGraduationCredits(profile);

  const earnedCredits = profile
    ? profile.completedCourses
        .filter((c) => c.status === "passed")
        .reduce((sum, c) => sum + c.credits, 0)
    : null;

  const currentCredits = status === "done" ? totalCredits : null;

  const remainingCredits =
    earnedCredits != null
      ? Math.max(
          0,
          graduationCredits - earnedCredits - (currentCredits ?? 0),
        )
      : null;

  const profileLabel =
    profile
      ? `${profile.grade != null ? `${profile.grade}回生` : ""}${profile.program ? `・${profile.program}` : ""}`.replace(/^・|・$/, "")
      : null;

  const initContent =
    status === "done"
      ? (proposalMessage || `${profileLabel ? `${profileLabel}の` : ""}履修提案を生成しました。提案内容についてご質問があればお気軽にどうぞ。`)
      : status === "loading"
      ? ""
      : `${profileLabel ? `${profileLabel}の` : ""}履修提案を生成しました。提案内容についてご質問があればお気軽にどうぞ。`;

  const initMessage: ChatMessage = {
    id: "1",
    role: "assistant",
    content: initContent,
    time: "9:00",
    streaming: status === "loading",
  };

  const [messages, setMessages] = useState<ChatMessage[]>([initMessage]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  // 提案完了時に初期メッセージを更新
  useEffect(() => {
    if (status === "done") {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === "1"
            ? {
                ...m,
                content:
                  proposalMessage ||
                  `${profileLabel ? `${profileLabel}の` : ""}履修提案を生成しました。提案内容についてご質問があればお気軽にどうぞ。`,
                streaming: false,
              }
            : m,
        ),
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");

    const now = new Date();
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
    const base = seq.current;
    seq.current += 2;
    const assistantId = `mobile-a${base + 1}`;

    const history = messages
      .filter((m) => !m.streaming)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [
      ...prev,
      { id: `mobile-u${base}`, role: "user", content: text, time },
      { id: assistantId, role: "assistant", content: "", time, streaming: true },
    ]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStreaming(true);

    try {
      let accumulated = "";
      await streamProposalChat(
        { profile, history, message: text },
        (delta) => {
          accumulated += delta;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: accumulated } : m,
            ),
          );
        },
        ctrl.signal,
      );
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: "申し訳ありません。応答の取得に失敗しました。" }
              : m,
          ),
        );
      }
    } finally {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, streaming: false } : m,
        ),
      );
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, messages, profile, streaming]);

  const timetable = status === "done" ? coursesToTimetable(courses) : {};

  return (
    <div className="flex flex-col h-[calc(100dvh-96px)] bg-[#F8F9FA]">
      {/* CreditBar */}
      <div className="flex items-center justify-around px-5 bg-white border-b border-[#D1D5DB] shrink-0 py-2">
        {[
          { val: earnedCredits != null ? String(earnedCredits) : "—", label: "取得済み単位" },
          { val: currentCredits != null ? String(currentCredits) : "—", label: "今期登録単位" },
          { val: remainingCredits != null ? String(remainingCredits) : "—", label: "卒業残り単位" },
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
                const cell = timetable[p]?.[d] ?? null;
                const style = cell?.type ? CELL_STYLES[cell.type] : null;
                return (
                  <div
                    key={d}
                    className={`flex-1 border-r border-[#E5E7EB] last:border-r-0 flex flex-col justify-center gap-0.5 px-1 ${
                      style ? style.cell : "bg-white"
                    } ${status === "loading" ? "animate-pulse" : ""}`}
                  >
                    {cell && style && (
                      <>
                        <span className="text-[#1A2B4E] text-[9px] font-semibold leading-tight line-clamp-2">
                          {cell.name}
                        </span>
                        <span
                          className={`inline-block self-start px-1 py-px rounded-sm text-white text-[8px] ${style.tag}`}
                        >
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
              {msg.content || (msg.streaming ? <span className="animate-pulse">▌</span> : "")}
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
          disabled={streaming || status === "loading"}
          className="flex-1 border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1A2B4E] transition-colors disabled:opacity-60"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || streaming || status === "loading"}
          className="w-10 h-10 flex items-center justify-center rounded-lg bg-[#E60012] disabled:opacity-40 hover:bg-[#b7000c]"
        >
          <Send size={16} className="text-white" />
        </button>
      </div>
    </div>
  );
}
