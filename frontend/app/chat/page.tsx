"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import ChatHeader from "./_components/ChatHeader";
import ContextBanner from "./_components/ContextBanner";
import MessageList from "./_components/MessageList";
import QuickChips from "./_components/QuickChips";
import InputBar from "./_components/InputBar";
import { useChatStore } from "@/lib/chat";
import { useStudentStore } from "@/lib/student";
import { streamSyllabusChat } from "@/lib/chatApi";
import { useScrollToBottom } from "@/lib/useScrollToBottom";

const INIT_MESSAGE_ID = "init-1";

export default function ChatPage() {
  const { syllabusMessages, setSyllabusMessages, addSyllabusMessage } = useChatStore();
  const profile = useStudentStore((s) => s.profile);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const listRef = useScrollToBottom<HTMLDivElement>(syllabusMessages);
  const abortRef = useRef<AbortController | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (syllabusMessages.length === 0) {
      setSyllabusMessages([
        {
          id: INIT_MESSAGE_ID,
          role: "assistant",
          content:
            "こんにちは！履修登録のお手伝いをします。\n現在の時間割データを確認しました。後期の登録状況について何か聞いてみてください。",
          time: "9:38",
        },
      ]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;
    setInput("");

    const now = new Date();
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
    const base = seq.current;
    seq.current += 2;
    const assistantId = `syllabus-a${base + 1}`;

    const history = syllabusMessages
      .filter((m) => !m.streaming)
      .map((m) => ({ role: m.role, content: m.content }));

    addSyllabusMessage({ id: `syllabus-u${base}`, role: "user", content: text, time });
    addSyllabusMessage({ id: assistantId, role: "assistant", content: "", time, streaming: true });

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStreaming(true);

    try {
      let accumulated = "";
      await streamSyllabusChat(
        { profile, history, message: text },
        (delta) => {
          accumulated += delta;
          useChatStore.setState((state) => ({
            syllabusMessages: state.syllabusMessages.map((m) =>
              m.id === assistantId ? { ...m, content: accumulated } : m,
            ),
          }));
        },
        ctrl.signal,
      );
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        useChatStore.setState((state) => ({
          syllabusMessages: state.syllabusMessages.map((m) =>
            m.id === assistantId
              ? { ...m, content: "申し訳ありません。応答の取得に失敗しました。" }
              : m,
          ),
        }));
      }
    } finally {
      useChatStore.setState((state) => ({
        syllabusMessages: state.syllabusMessages.map((m) =>
          m.id === assistantId ? { ...m, streaming: false } : m,
        ),
      }));
      setStreaming(false);
      abortRef.current = null;
    }
  }, [syllabusMessages, streaming, profile, addSyllabusMessage]);

  return (
    <div className="flex flex-col h-[calc(100dvh-76px)] md:h-[calc(100vh-60px)] bg-[#F8F9FA]">
      <ChatHeader />
      <ContextBanner />
      <MessageList messages={syllabusMessages} listRef={listRef} />
      <QuickChips onSend={send} />
      <InputBar
        value={input}
        onChange={setInput}
        onSend={() => send(input)}
        disabled={streaming}
      />
    </div>
  );
}
