"use client";

import { useState, useRef, useEffect } from "react";
import ChatHeader from "./_components/ChatHeader";
import ContextBanner from "./_components/ContextBanner";
import MessageList from "./_components/MessageList";
import QuickChips from "./_components/QuickChips";
import InputBar from "./_components/InputBar";
import type { Message } from "./_components/types";

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
      { id: String(Date.now() + 1), role: "assistant", content: "（AI応答はバックエンド実装後に有効になります）", time },
    ]);
    setInput("");
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-64px)] md:h-[calc(100vh-3.5rem)] bg-[#F8F9FA]">
      <ChatHeader />
      <ContextBanner />
      <MessageList messages={messages} bottomRef={bottomRef} />
      <QuickChips onSend={send} />
      <InputBar value={input} onChange={setInput} onSend={() => send(input)} />
    </div>
  );
}
