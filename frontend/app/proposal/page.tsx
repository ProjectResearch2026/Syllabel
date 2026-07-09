"use client";

import { useState, useRef, useEffect } from "react";
import { Calendar, Send } from "lucide-react";

/* ── 共通データ ─────────────────────────────────────────────── */
const DAYS = ["月", "火", "水", "木", "金"] as const;
const PERIODS = [1, 2, 3, 4, 5] as const;

type CourseType = "required" | "elective";
type CourseCell = { name: string; type: CourseType } | null;
type Timetable = Record<number, Record<string, CourseCell>>;

const TIMETABLE: Timetable = {
  1: {
    月: { name: "線形代数", type: "required" },
    火: null,
    水: { name: "情報理論", type: "required" },
    木: null,
    金: { name: "微分方程式", type: "elective" },
  },
  2: {
    月: null,
    火: { name: "OS論", type: "required" },
    水: null,
    木: { name: "アルゴリズム", type: "required" },
    金: null,
  },
  3: {
    月: { name: "データベース", type: "elective" },
    火: null,
    水: null,
    木: null,
    金: { name: "確率統計", type: "required" },
  },
  4: {
    月: null,
    火: { name: "ソフトウェア工学", type: "elective" },
    水: null,
    木: { name: "機械学習", type: "elective" },
    金: null,
  },
  5: {
    月: null,
    火: null,
    水: null,
    木: null,
    金: null,
  },
};

const CELL_STYLES: Record<CourseType, { bg: string; tag: string; label: string }> = {
  required: { bg: "bg-[#FFE8E9]", tag: "bg-[#E60012]", label: "必修" },
  elective: { bg: "bg-[#E8F0FF]", tag: "bg-[#1A2B4E]", label: "選択" },
};

type Message = { id: string; role: "user" | "assistant"; content: string };

const INIT_MESSAGES: Message[] = [
  {
    id: "1",
    role: "assistant",
    content:
      "3回生・知能情報メディア課程の履修提案を生成しました。卒業要件を考慮し、必修5科目・選択3科目で合計18単位を提案しています。ご質問があればお気軽にどうぞ。",
  },
];

/* ── PC用: 左側時間割パネル ─────────────────────────────────── */
function TimetablePanel() {
  return (
    <div className="flex-1 flex flex-col bg-[#F8F9FA] p-5 min-w-0">
      {/* カード */}
      <div className="flex-1 bg-white rounded-xl border border-[#E5E7EB] overflow-hidden flex flex-col">
        {/* Day header */}
        <div className="flex bg-[#1A2B4E] shrink-0">
          <div className="w-11 shrink-0 bg-[#1A2B4E]" />
          {DAYS.map((d) => (
            <div
              key={d}
              className="flex-1 h-9 flex items-center justify-center border-l border-[#2D4070]"
            >
              <span className="text-white text-[13px] font-semibold">{d}</span>
            </div>
          ))}
        </div>

        {/* Rows */}
        {PERIODS.map((p) => (
          <div key={p} className="flex flex-1 border-b border-[#E5E7EB]">
            {/* Period cell */}
            <div className="w-11 shrink-0 bg-[#F9FAFB] border-r border-[#E5E7EB] flex flex-col items-center justify-center gap-0.5">
              <span className="text-[#1A2B4E] text-sm font-bold font-mono leading-none">{p}</span>
              <span className="text-[#9CA3AF] text-[9px]">限</span>
            </div>
            {/* Day cells */}
            {DAYS.map((d) => {
              const cell = TIMETABLE[p]?.[d] ?? null;
              const style = cell?.type ? CELL_STYLES[cell.type] : null;
              return (
                <div
                  key={d}
                  className={`flex-1 border-r border-[#E5E7EB] last:border-r-0 flex flex-col justify-center gap-1 p-2 ${
                    style ? style.bg : "bg-white"
                  }`}
                >
                  {cell && style && (
                    <>
                      <span className="text-[#1A2B4E] text-[11px] font-semibold leading-tight">
                        {cell.name}
                      </span>
                      <span
                        className={`inline-block self-start px-1.5 py-px rounded-sm text-white text-[9px] ${style.tag}`}
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
  );
}

/* ── PC用: 右側チャットパネル ───────────────────────────────── */
function ChatPanel() {
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
      {
        id: String(Date.now() + 1),
        role: "assistant",
        content: "（AI応答はバックエンド実装後に有効になります）",
      },
    ]);
    setInput("");
  };

  return (
    <div className="w-[400px] shrink-0 flex flex-col border-l border-[#E5E7EB] bg-white">
      {/* Chat header */}
      <div className="px-5 py-3 border-b border-[#E5E7EB] shrink-0">
        <h2 className="text-[#1A2B4E] text-sm font-semibold">AIに質問する</h2>
        <p className="text-[#6B7280] text-xs mt-0.5">提案内容について何でも聞いてください</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-[#1A2B4E] text-white"
                  : "bg-[#F3F4F6] text-[#1A2B4E]"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
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

/* ── PC用: クレジットバー ────────────────────────────────────── */
function CreditBar() {
  return (
    <div className="flex items-center justify-between px-8 h-12 bg-white border-b border-[#E5E7EB] shrink-0">
      {/* Stats */}
      <div className="flex items-center gap-8">
        {[
          { val: "62", label: "取得済み単位", color: "text-[#1A2B4E]" },
          { val: "18", label: "今期登録単位", color: "text-[#E60012]" },
          { val: "46", label: "卒業残り単位", color: "text-[#5F6B7A]" },
        ].map(({ val, label, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`text-xl font-bold font-mono ${color}`}>{val}</span>
            <span className="text-[#6B7280] text-xs">{label}</span>
          </div>
        ))}
      </div>
      {/* Term */}
      <div className="flex items-center gap-2">
        <Calendar size={16} className="text-[#E60012]" />
        <span className="text-[#1A2B4E] text-sm font-semibold">2024年度 後期</span>
      </div>
    </div>
  );
}

/* ── モバイル用: 提案ページ ─────────────────────────────────── */
function MobileProposalPage() {
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
      {
        id: String(Date.now() + 1),
        role: "assistant",
        content: "（AI応答はバックエンド実装後に有効になります）",
      },
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
                        <span
                          className={`inline-block self-start px-1 py-px rounded-sm text-white text-[7px] ${style.tag}`}
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
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
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

/* ── Root ────────────────────────────────────────────────────── */
export default function ProposalPage() {
  return (
    <>
      {/* Mobile */}
      <div className="md:hidden">
        <MobileProposalPage />
      </div>
      {/* PC: CreditBar + TimetablePanel + ChatPanel */}
      <div className="hidden md:flex flex-col flex-1">
        <CreditBar />
        <div className="flex flex-1 overflow-hidden">
          <TimetablePanel />
          <ChatPanel />
        </div>
      </div>
    </>
  );
}
