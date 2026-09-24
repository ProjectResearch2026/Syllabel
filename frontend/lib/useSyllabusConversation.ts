"use client";

import { useCallback, useMemo, useRef } from "react";
import { useChatStore, type ChatMessage } from "@/lib/chat";
import { useChatHistory } from "@/lib/chatHistory";
import { useStudentStore } from "@/lib/student";
import { streamSyllabusChat } from "@/lib/chatApi";
import { questionSuggestions, type AiConversation } from "@/lib/ai";

/**
 * シラバス全体に対する質問（`/syllabus`。design.md §7.4）。
 *
 * **PC のパネル（`SyllabusChatPanel`）とモバイルの AI シートが同じ会話
 * （`syllabusMessages`。§5.2.2）を読み書きする。** 両者は同時に mount されるため、
 * 送信中かどうかは各自の state ではなく吹き出しの `streaming` から導く。
 */
const QUICK_ASKS = ["1年次でも取れる科目は？", "抽選のある科目を教えて"];

const INITIAL: ChatMessage = {
  id: "syllabus-init",
  role: "assistant",
  content: "条件を言葉で伝えてください。学部・曜日・区分から候補を絞り込みます。",
  time: "",
};

function hhmm(): string {
  const now = new Date();
  return `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
}

let seq = 0;

export function useSyllabusConversation(): AiConversation {
  const syllabusMessages = useChatStore((s) => s.syllabusMessages);
  const setSyllabusMessages = useChatStore((s) => s.setSyllabusMessages);
  const profile = useStudentStore((s) => s.profile);
  const { entries, archive, restore } = useChatHistory("syllabus");
  const abortRef = useRef<AbortController | null>(null);

  const messages = useMemo(
    () => (syllabusMessages.length > 0 ? syllabusMessages : [INITIAL]),
    [syllabusMessages],
  );
  const streaming = messages.some((m) => m.streaming);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || streaming) return;

      const time = hhmm();
      seq += 1;
      const assistantId = `syllabus-a${seq}`;
      const history = messages
        .filter((m) => !m.streaming)
        .map((m) => ({ role: m.role, content: m.content }));

      // 1件目の送信で初期メッセージを履歴に固定する（以降は store が正）
      setSyllabusMessages([
        ...messages,
        { id: `syllabus-u${seq}`, role: "user", content: text, time },
        { id: assistantId, role: "assistant", content: "", time, streaming: true },
      ]);

      const patch = (update: Partial<ChatMessage>) =>
        useChatStore.setState((state) => ({
          syllabusMessages: state.syllabusMessages.map((m) =>
            m.id === assistantId ? { ...m, ...update } : m,
          ),
        }));

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      let accumulated = "";
      let failed = false;
      try {
        // シラバス全体への質問なので、講義単位(§7.5)ではなく全体の口(§7.4)を叩く。
        // 以前は講義単位の口に "__syllabus__" という架空のコードを渡しており、
        // backend が実在確認(`get_syllabus`)で 404 を返すため常に失敗していた。
        await streamSyllabusChat(
          { profile, history, message: text },
          (delta) => {
            accumulated += delta;
            patch({ content: accumulated });
          },
          ctrl.signal,
        );
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          failed = true;
          patch({ content: "申し訳ありません。応答の取得に失敗しました。" });
        }
      } finally {
        // delta も error も来ずに終わると本文が空のまま残る（§4.1.4）
        patch({
          streaming: false,
          ...(accumulated || failed ? {} : { content: "応答を受け取れませんでした。" }),
        });
        if (abortRef.current === ctrl) abortRef.current = null;
      }
    },
    [messages, streaming, setSyllabusMessages, profile],
  );

  const onSelectHistory = useCallback(
    (id: string) => {
      const restored = restore("syllabus", id);
      if (!restored) return;
      abortRef.current?.abort();
      archive("syllabus", syllabusMessages);
      setSyllabusMessages(restored);
    },
    [restore, archive, syllabusMessages, setSyllabusMessages],
  );

  const onNewChat = useCallback(() => {
    abortRef.current?.abort();
    archive("syllabus", syllabusMessages);
    // 空にすると `messages` が初期メッセージへ戻る
    setSyllabusMessages([]);
  }, [archive, syllabusMessages, setSyllabusMessages]);

  return useMemo<AiConversation>(
    () => ({
      title: "AIで科目を探す",
      messages,
      streaming,
      placeholder: "条件を伝えて科目を探す…",
      send: (text) => void send(text),
      quickAsks: QUICK_ASKS,
      history: entries,
      onSelectHistory,
      onNewChat,
      suggestionsFor: () => questionSuggestions("この検索について聞けること", QUICK_ASKS),
    }),
    [messages, streaming, send, entries, onSelectHistory, onNewChat],
  );
}
