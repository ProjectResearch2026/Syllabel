"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { replyStream, useChatStore, type ChatMessage } from "@/lib/chat";
import { useChatHistory } from "@/lib/chatHistory";
import { useStudentContext } from "@/lib/studentContext";
import { streamCourseChat } from "@/lib/chatApi";
import { questionSuggestions, type AiConversation } from "@/lib/ai";

/**
 * 講義単位の質問（`/syllabus/[code]`。design.md §7.5）。
 *
 * **PC のパネル（`CourseChatPanel`）とモバイルの AI シートが同じ会話
 * （`courseMessages[code]`。§5.2.2）を読み書きする。** 送信中かどうかは
 * 吹き出しの `streaming` から導き、どちらから送っても両方が同じ状態を映す。
 */

/** セレクタが毎回新しい配列を返すと再描画が止まらない。空は共有する */
const EMPTY: ChatMessage[] = [];

function hhmm(): string {
  const now = new Date();
  return `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
}

let seq = 0;

export function useCourseConversation({
  code,
  title,
  questions,
}: {
  code: string;
  title: string;
  /** その科目のシラバスで答えられる質問だけを並べる(`lib/courseQuestions.ts`) */
  questions: string[];
}): AiConversation {
  const messages = useChatStore((s) => s.courseMessages[code] ?? EMPTY);
  const setCourseMessages = useChatStore((s) => s.setCourseMessages);
  // 揃えば課程コード・入学年度・対象学期も送り、その学生にとっての区分や要件の
  // 充足状況で答えさせる(design.md §7.4.1)。揃わなければ学年と課程だけで答える
  const { profile, context } = useStudentContext();
  const scope = `course:${code}` as const;
  const { entries, archive, restore } = useChatHistory(scope);
  const abortRef = useRef<AbortController | null>(null);
  const streaming = messages.some((m) => m.streaming);

  /** やり直しても同じ挨拶から始める */
  const intro = useCallback(
    (): ChatMessage => ({
      id: `course-init-${code}-${Date.now()}`,
      role: "assistant",
      content: `「${title}」についてご質問ください。シラバスの内容にAIが回答します。`,
      time: hhmm(),
    }),
    [code, title],
  );

  useEffect(() => {
    if ((useChatStore.getState().courseMessages[code] ?? []).length === 0) {
      setCourseMessages(code, [intro()]);
    }
  }, [code, intro, setCourseMessages]);

  /** いまの会話を履歴へどけてから、次の会話に移る */
  const swapTo = useCallback(
    (next: ChatMessage[]) => {
      abortRef.current?.abort();
      archive(scope, messages);
      setCourseMessages(code, next);
    },
    [archive, scope, messages, setCourseMessages, code],
  );

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || streaming) return;

      const time = hhmm();
      seq += 1;
      const assistantId = `${code}-a${seq}`;
      const history = messages
        .filter((m) => !m.streaming)
        .map((m) => ({ role: m.role, content: m.content }));

      setCourseMessages(code, [
        ...messages,
        { id: `${code}-u${seq}`, role: "user", content: text, time },
        { id: assistantId, role: "assistant", content: "", time, streaming: true },
      ]);

      const patch = (update: Partial<ChatMessage>) =>
        useChatStore.setState((state) => ({
          courseMessages: {
            ...state.courseMessages,
            [code]: (state.courseMessages[code] ?? []).map((m) =>
              m.id === assistantId ? { ...m, ...update } : m,
            ),
          },
        }));

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const reply = replyStream(patch);
      let failed = false;
      try {
        await streamCourseChat(
          code,
          { profile, history, message: text, ...context },
          reply.handlers,
          ctrl.signal,
        );
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          failed = true;
          patch({ content: "申し訳ありません。応答の取得に失敗しました。" });
        }
      } finally {
        patch({
          streaming: false,
          ...(reply.content() || failed ? {} : { content: "応答を受け取れませんでした。" }),
        });
        if (abortRef.current === ctrl) abortRef.current = null;
      }
    },
    [code, streaming, messages, setCourseMessages, profile, context],
  );

  return useMemo<AiConversation>(
    () => ({
      title: "この科目 について質問",
      messages,
      streaming,
      placeholder: "この講義について質問する…",
      send: (text) => void send(text),
      quickAsks: questions,
      history: entries,
      onSelectHistory: (id) => {
        const restored = restore(scope, id);
        if (restored) swapTo(restored);
      },
      onNewChat: () => swapTo([intro()]),
      suggestionsFor: () => questionSuggestions(`${title} について聞けること`, questions),
    }),
    [messages, streaming, send, questions, entries, restore, scope, swapTo, intro, title],
  );
}
