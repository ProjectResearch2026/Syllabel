"use client";

import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import AiChatPanel from "@/components/pc/AiChatPanel";
import { useChatStore, type ChatMessage } from "@/lib/chat";
import { useChatHistory } from "@/lib/chatHistory";
import { useStudentStore } from "@/lib/student";
import { streamCourseChat } from "@/lib/chatApi";

/** 講義詳細のAIパネル（ui-design_pc.pen 06_講義詳細 ChatPanel）。 */

export default function CourseChatPanel({
  code,
  title,
  questions,
}: {
  code: string;
  title: string;
  /** その科目のシラバスで答えられる質問だけを並べる(`lib/courseQuestions.ts`) */
  questions: string[];
}) {
  const { courseMessages, setCourseMessages, addCourseMessage } = useChatStore();
  const profile = useStudentStore((s) => s.profile);
  const messages = useMemo(() => courseMessages[code] ?? [], [courseMessages, code]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const seq = useRef(0);
  const scope = `course:${code}` as const;
  const { entries, archive, restore } = useChatHistory(scope);

  /** やり直しても同じ挨拶から始める（`useEffect` は code が変わるときしか走らない） */
  const intro = useCallback((): ChatMessage => {
    const now = new Date();
    return {
      id: `course-init-${code}-${Date.now()}`,
      role: "assistant",
      content: `「${title}」についてご質問ください。シラバスの内容にAIが回答します。`,
      time: `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`,
    };
  }, [code, title]);

  const abortRef = useRef<AbortController | null>(null);

  /** いまの会話を履歴へどけてから、次の会話に移る */
  const swapTo = useCallback(
    (next: ChatMessage[]) => {
      abortRef.current?.abort();
      archive(scope, messages);
      setCourseMessages(code, next);
    },
    [archive, scope, messages, setCourseMessages, code],
  );

  useEffect(() => {
    if ((courseMessages[code] ?? []).length === 0) {
      const now = new Date();
      const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
      setCourseMessages(code, [
        {
          id: `course-init-${code}`,
          role: "assistant",
          content: `「${title}」についてご質問ください。シラバスの内容にAIが回答します。`,
          time,
        },
      ]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;
    setInput("");

    const now = new Date();
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
    const base = seq.current;
    seq.current += 2;
    const assistantId = `${code}-a${base + 1}`;

    const history = (courseMessages[code] ?? [])
      .filter((m) => !m.streaming)
      .map((m) => ({ role: m.role, content: m.content }));

    addCourseMessage(code, { id: `${code}-u${base}`, role: "user", content: text, time });
    addCourseMessage(code, { id: assistantId, role: "assistant", content: "", time, streaming: true });

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStreaming(true);

    try {
      let accumulated = "";
      await streamCourseChat(
        code,
        { profile, history, message: text },
        (delta) => {
          accumulated += delta;
          useChatStore.setState((state) => ({
            courseMessages: {
              ...state.courseMessages,
              [code]: (state.courseMessages[code] ?? []).map((m) =>
                m.id === assistantId ? { ...m, content: accumulated } : m,
              ),
            },
          }));
        },
        ctrl.signal,
      );
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        useChatStore.setState((state) => ({
          courseMessages: {
            ...state.courseMessages,
            [code]: (state.courseMessages[code] ?? []).map((m) =>
              m.id === assistantId
                ? { ...m, content: "申し訳ありません。応答の取得に失敗しました。" }
                : m,
            ),
          },
        }));
      }
    } finally {
      useChatStore.setState((state) => ({
        courseMessages: {
          ...state.courseMessages,
          [code]: (state.courseMessages[code] ?? []).map((m) =>
            m.id === assistantId ? { ...m, streaming: false } : m,
          ),
        },
      }));
      setStreaming(false);
      abortRef.current = null;
    }
  }, [code, streaming, profile, courseMessages, addCourseMessage]);

  return (
    <AiChatPanel
      title="この科目 について質問"
      messages={messages}
      input={input}
      onInputChange={setInput}
      onSend={() => send(input)}
      placeholder="この講義について質問する…"
      streaming={streaming}
      quickAsks={questions}
      onQuickAsk={send}
      history={entries}
      onSelectHistory={(id) => {
        const restored = restore(scope, id);
        if (restored) swapTo(restored);
      }}
      onNewChat={() => swapTo([intro()])}
    />
  );
}
