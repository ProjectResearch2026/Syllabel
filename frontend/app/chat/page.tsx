"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, ChevronLeft, Info, EllipsisVertical, Paperclip, SendHorizontal, CalendarCheck } from "lucide-react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
  items?: { name: string; note: string }[];
  streaming?: boolean;
};

const INIT_MESSAGES: Message[] = [
  {
    id: "1",
    role: "assistant",
    content: "こんにちは！履修登録のお手伝いをします。\n現在の時間割データを確認しました。後期の登録状況について何か聞いてみてください。",
    time: "9:38",
  },
  {
    id: "2",
    role: "user",
    content: "必修科目でまだ取っていないものを教えてください。",
    time: "9:39",
  },
  {
    id: "3",
    role: "assistant",
    content: "未修得の必修科目は以下の3科目です：",
    time: "9:39",
    items: [
      { name: "データベース論", note: "3回生対象・後期" },
      { name: "ソフトウェア工学", note: "3回生対象・前期 ※来年度" },
      { name: "卒業論文研究", note: "4回生進級後に登録可" },
    ],
  },
  {
    id: "4",
    role: "assistant",
    content: "「データベース論」は今学期の後期に開講されています。シラバスによると…",
    time: "9:40",
    streaming: true,
  },
];

const QUICK_CHIPS = ["必修を確認", "空きコマを埋めたい", "単位数の相談"];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>(INIT_MESSAGES);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = (text: string) => {
    if (!text.trim()) return;
    const now = new Date();
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
    setMessages((prev) => [
      ...prev.filter((m) => !m.streaming),
      { id: String(Date.now()), role: "user", content: text, time },
      {
        id: String(Date.now() + 1),
        role: "assistant",
        content: "（AI応答はバックエンド実装後に有効になります）",
        time,
      },
    ]);
    setInput("");
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-96px)] md:h-[calc(100vh-3.5rem)] bg-[#F8F9FA]">
      {/* Chat Header */}
      <header className="flex items-center justify-between px-5 h-[60px] bg-white border-b border-[#D1D5DB] shrink-0">
        <div className="flex items-center gap-3">
          <ChevronLeft size={22} className="text-[#1A2B4E]" />
          <div className="w-9 h-9 rounded-full bg-[#1A2B4E] flex items-center justify-center shrink-0">
            <Bot size={20} className="text-white" />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[#1A2B4E] text-[15px] font-bold leading-none">
              履修AIアシスタント
            </span>
            <div className="flex items-center gap-1">
              <span className="w-[7px] h-[7px] rounded-full bg-[#1A2B4E] shrink-0" />
              <span className="text-[#9CA3AF] text-[11px]">オンライン</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3.5">
          <Info size={22} className="text-[#1A2B4E]" />
          <EllipsisVertical size={20} className="text-[#1A2B4E]" />
        </div>
      </header>

      {/* Context Banner */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 bg-[#F8F9FA] border-l-[3px] border-[#E60012] shrink-0">
        <CalendarCheck size={18} className="text-[#1A2B4E] shrink-0" />
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[#1A2B4E] text-xs font-semibold">
            時間割データ連携中
          </span>
          <span className="text-[#6B7280] text-[10px]">
            今期登録18単位・取得済み62単位を参照しています
          </span>
        </div>
      </div>

      {/* Message Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Date chip */}
        <div className="flex justify-center">
          <span className="text-[#9CA3AF] text-[11px]">今日 · 9:38</span>
        </div>

        {messages.map((msg) =>
          msg.role === "assistant" ? (
            <div key={msg.id} className="flex gap-2.5 items-start">
              <div className="w-8 h-8 rounded-full bg-white border border-[#D1D5DB] flex items-center justify-center shrink-0">
                <Bot size={18} className="text-[#1A2B4E]" />
              </div>
              <div
                className={`max-w-[290px] bg-white rounded-lg px-3.5 py-3 space-y-1.5 ${
                  msg.streaming
                    ? "border-l-[3px] border-[#E60012] border-t border-r border-b border-[#D1D5DB]"
                    : "border border-[#D1D5DB]"
                }`}
              >
                <p className="text-[#1A2B4E] text-[13px] leading-snug whitespace-pre-wrap">
                  {msg.content}
                </p>
                {msg.items && (
                  <div className="space-y-2 mt-1">
                    {msg.items.map((item) => (
                      <div key={item.name} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-sm bg-[#E60012] shrink-0 mt-1.5" />
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[#1A2B4E] text-xs font-semibold">
                            {item.name}
                          </span>
                          <span className="text-[#6B7280] text-[10px]">
                            {item.note}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {msg.streaming && (
                  <div className="flex items-center gap-1 pt-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1A2B4E] animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1A2B4E] animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#D1D5DB] animate-bounce [animation-delay:300ms]" />
                  </div>
                )}
                <span className="block text-[#9CA3AF] text-[10px]">
                  {msg.time}
                </span>
              </div>
            </div>
          ) : (
            <div key={msg.id} className="flex justify-end items-end gap-2.5">
              <div className="max-w-[260px] bg-[#EEF1F8] rounded-lg px-3.5 py-3 space-y-1">
                <p className="text-[#1A2B4E] text-[13px] leading-snug whitespace-pre-wrap">
                  {msg.content}
                </p>
                <span className="block text-[#9CA3AF] text-[10px] text-right">
                  {msg.time}
                </span>
              </div>
            </div>
          )
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick Chips */}
      <div className="flex gap-2 px-4 py-2 bg-[#F8F9FA] overflow-x-auto shrink-0">
        {QUICK_CHIPS.map((chip) => (
          <button
            key={chip}
            onClick={() => send(chip)}
            className="shrink-0 px-3 py-1.5 bg-white border border-[#D1D5DB] rounded-full text-[#1A2B4E] text-xs whitespace-nowrap hover:bg-[#F8F9FA] transition-colors"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Input Bar */}
      <div className="flex items-center gap-2.5 px-4 h-16 bg-white border-t border-[#D1D5DB] shrink-0">
        <div className="flex-1 flex items-center h-11 bg-[#F3F4F6] border border-[#D1D5DB] rounded-lg px-3.5 gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder="メッセージを入力..."
            className="flex-1 bg-transparent text-[14px] text-[#1A2B4E] placeholder-[#9CA3AF] outline-none"
          />
          <Paperclip size={18} className="text-[#9CA3AF] shrink-0" />
        </div>
        <button
          onClick={() => send(input)}
          disabled={!input.trim()}
          className="w-11 h-11 flex items-center justify-center bg-[#1A2B4E] rounded-lg disabled:opacity-40 transition-opacity"
        >
          <SendHorizontal size={20} className="text-[#E60012]" />
        </button>
      </div>
    </div>
  );
}
