"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { DAYS, PERIODS, CELL_STYLES, coursesToTimetable } from "@/lib/timetable";
import { useStudentStore } from "@/lib/student";
import { useProposalStore } from "@/lib/proposal";
import { useGraduationCredits } from "@/lib/curricula";
import { useScrollToBottom } from "@/lib/useScrollToBottom";
import { PREFERENCES_NOTE, useProposalConversation } from "@/lib/useProposalConversation";
import MarkdownText from "@/components/ai/MarkdownText";

/**
 * モバイルの履修提案（ui-design_phone.pen 04_履修提案）。
 *
 * 対話は PC のパネルと同じ `useProposalConversation`（design.md §8.3）で動く。
 * **会話は `proposalMessages`（§5.2.2）に置き、画面ごとに持たない** — 提案前の
 * 案内も、提案の summary も、どちらの画面から送った問答も同じ1本の会話である。
 */
export default function MobileProposalPage() {
  const profile = useStudentStore((s) => s.profile);
  const { status, courses, totalCredits } = useProposalStore();
  const graduationCredits = useGraduationCredits(profile);
  const {
    messages,
    streaming,
    holdsProposal,
    canStart,
    send,
    startWithoutPreferences,
    restart,
  } = useProposalConversation();
  const [input, setInput] = useState("");
  const listRef = useScrollToBottom<HTMLDivElement>(messages);

  const earnedCredits = profile
    ? profile.completedCourses
        .filter((c) => c.status === "passed")
        .reduce((sum, c) => sum + c.credits, 0)
    : null;

  const currentCredits = holdsProposal ? totalCredits : null;

  const remainingCredits =
    earnedCredits != null
      ? Math.max(0, graduationCredits - earnedCredits - (currentCredits ?? 0))
      : null;

  const handleSend = () => {
    if (!input.trim() || streaming || !canStart) return;
    send(input);
    setInput("");
  };

  // 生成中に届く snapshot も描く（逐次描画。design.md §6.1.1 / §7.2）
  const timetable = coursesToTimetable(courses);

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
            <span className="text-[#1A2B4E] text-xl font-bold tabular-nums leading-none">{val}</span>
            <span className="text-[#6B7280] text-[10px]">{label}</span>
          </div>
        ))}
      </div>

      {/* Timetable */}
      <div className="relative bg-white border-b border-[#D1D5DB] shrink-0">
        {/* まだ投げていないこと（§5.2.3 の `idle`）を示す。空の表だけでは、提案が
            終わって何も無いのか、これからなのかが区別できない（§8.3.2） */}
        {status === "idle" && (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-white/80">
            <p className="max-w-[260px] px-4 text-center text-xs leading-5 text-[#6B7280]">
              下のAI履修アシスタントに希望条件を送ると、ここに時間割が出ます。
            </p>
          </div>
        )}
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
                <span className="text-[#1A2B4E] text-[13px] font-bold tabular-nums leading-none">{p}</span>
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
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-[#1A2B4E] text-white"
                  : "bg-white border border-[#D1D5DB] text-[#1A2B4E]"
              }`}
            >
              {msg.role === "assistant" ? (
                msg.content ? (
                  <MarkdownText>{msg.content}</MarkdownText>
                ) : msg.streaming ? (
                  <span className="animate-pulse">▌</span>
                ) : null
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}

        {/* 提案の開始と再提案（§8.3.1 / §8.3.3）。送信中は出さない */}
        {!streaming && canStart && (
          <div className="flex">
            <button
              type="button"
              onClick={holdsProposal ? restart : startWithoutPreferences}
              className="rounded-xl border border-[#E60012] bg-white px-3 py-2 text-xs font-bold text-[#E60012]"
            >
              {holdsProposal ? "条件を変えて提案し直す" : "希望条件なしで提案する"}
            </button>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="bg-white border-t border-[#D1D5DB] px-4 py-3 shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSend();
            }}
            placeholder={
              holdsProposal ? "提案について質問する..." : "希望条件を入力（例: 午前中を多めに）"
            }
            disabled={streaming || !canStart}
            className="flex-1 border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1A2B4E] transition-colors disabled:opacity-60"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || streaming || !canStart}
            className="w-10 h-10 flex items-center justify-center rounded-lg bg-[#E60012] disabled:opacity-40 hover:bg-[#b7000c]"
          >
            <Send size={16} className="text-white" />
          </button>
        </div>
        {/* 学生がその場で書く文章が記録されることを、書く場所の傍らで示す（§9.1） */}
        {!holdsProposal && canStart && (
          <p className="pt-2 text-[11px] leading-4 text-[#6B7280]">{PREFERENCES_NOTE}</p>
        )}
      </div>
    </div>
  );
}
