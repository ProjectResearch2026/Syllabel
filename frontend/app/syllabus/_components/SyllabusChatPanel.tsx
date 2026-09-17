"use client";

import { useMemo, useRef, useState, useCallback } from "react";
import AiChatPanel from "@/components/pc/AiChatPanel";
import { useChatStore, type ChatMessage } from "@/lib/chat";
import { useChatHistory } from "@/lib/chatHistory";
import { useStudentStore } from "@/lib/student";
import { streamCourseChat } from "@/lib/chatApi";

/** シラバス全体に対する質問（ui-design_pc.pen 05_シラバス一覧 ChatPanel）。 */
const QUICK_ASKS = ["1年次でも取れる科目は？", "抽選のある科目を教えて"];

const INITIAL: ChatMessage = {
  id: "syllabus-init",
  role: "assistant",
  content: "条件を言葉で伝えてください。学部・曜日・区分から候補を絞り込みます。",
  time: "",
};

export default function SyllabusChatPanel() {
  const { syllabusMessages, setSyllabusMessages, addSyllabusMessage } = useChatStore();
  const profile = useStudentStore((s) => s.profile);
  const { entries, archive, restore } = useChatHistory("syllabus");
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const seq = useRef(0);

  const messages = useMemo(
    () => (syllabusMessages.length > 0 ? syllabusMessages : [INITIAL]),
    [syllabusMessages],
  );

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || streaming) return;
      setInput("");

      const now = new Date();
      const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
      const base = seq.current;
      seq.current += 2;
      const assistantId = `syllabus-a${base + 1}`;

      const history = messages
        .filter((m) => !m.streaming)
        .map((m) => ({ role: m.role, content: m.content }));

      // 1件目の送信で初期メッセージを履歴に固定する（以降は store が正）
      if (syllabusMessages.length === 0) setSyllabusMessages([INITIAL]);
      addSyllabusMessage({ id: `syllabus-u${base}`, role: "user", content: text, time });
      addSyllabusMessage({ id: assistantId, role: "assistant", content: "", time, streaming: true });

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setStreaming(true);

      const patch = (fn: (content: string) => string) =>
        useChatStore.setState((state) => ({
          syllabusMessages: state.syllabusMessages.map((m) =>
            m.id === assistantId ? { ...m, content: fn(m.content) } : m,
          ),
        }));

      try {
        let accumulated = "";
        await streamCourseChat(
          "__syllabus__",
          { profile, history, message: text },
          (delta) => {
            accumulated += delta;
            patch(() => accumulated);
          },
          ctrl.signal,
        );
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          patch(() => "申し訳ありません。応答の取得に失敗しました。");
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
    },
    [messages, syllabusMessages.length, setSyllabusMessages, addSyllabusMessage, profile, streaming],
  );

  return (
    <AiChatPanel
      title="AIで科目を探す"
      messages={messages}
      input={input}
      onInputChange={setInput}
      onSend={() => send(input)}
      placeholder="条件を伝えて科目を探す…"
      streaming={streaming}
      quickAsks={QUICK_ASKS}
      onQuickAsk={send}
      history={entries}
      onSelectHistory={(id) => {
        const restored = restore("syllabus", id);
        if (!restored) return;
        abortRef.current?.abort();
        archive("syllabus", syllabusMessages);
        setSyllabusMessages(restored);
      }}
      onNewChat={() => {
        abortRef.current?.abort();
        archive("syllabus", syllabusMessages);
        // 空にすると `messages` が初期メッセージへ戻る
        setSyllabusMessages([]);
      }}
    />
  );
}
