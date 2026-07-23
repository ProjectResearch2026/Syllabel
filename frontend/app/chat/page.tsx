"use client";

import { useRef, useEffect, useState } from "react";
import ChatHeader from "./_components/ChatHeader";
import ContextBanner from "./_components/ContextBanner";
import MessageList from "./_components/MessageList";
import QuickChips from "./_components/QuickChips";
import InputBar from "./_components/InputBar";
import { useChatStore } from "@/lib/chat";

const INIT_MESSAGE_ID = "init-1";

export default function ChatPage() {
  const { syllabusMessages, setSyllabusMessages, addSyllabusMessage } = useChatStore();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (syllabusMessages.length === 0) {
      setSyllabusMessages([
        {
          id: INIT_MESSAGE_ID,
          role: "assistant",
          content: "こんにちは！履修登録のお手伝いをします。\n現在の時間割データを確認しました。後期の登録状況について何か聞いてみてください。",
          time: "9:38",
        },
      ]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [syllabusMessages]);

  const send = (text: string) => {
    if (!text.trim()) return;
    const now = new Date();
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
    addSyllabusMessage({ id: String(Date.now()), role: "user", content: text, time });
    addSyllabusMessage({ id: String(Date.now() + 1), role: "assistant", content: "（AI応答はバックエンド実装後に有効になります）", time });
    setInput("");
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-76px)] md:h-[calc(100vh-60px)] bg-[#F8F9FA]">
      <ChatHeader />
      <ContextBanner />
      <MessageList messages={syllabusMessages} bottomRef={bottomRef} />
      <QuickChips onSend={send} />
      <InputBar value={input} onChange={setInput} onSend={() => send(input)} />
    </div>
  );
}
