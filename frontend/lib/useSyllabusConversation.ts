"use client";

import { useCallback, useMemo, useRef } from "react";
import {
  regenerateFrom,
  replyStream,
  stoppedPatch,
  useChatStore,
  type ChatMessage,
} from "@/lib/chat";
import { useChatHistory } from "@/lib/chatHistory";
import { useStudentContext } from "@/lib/studentContext";
import { streamSyllabusChat } from "@/lib/chatApi";
import { CHAT_LOG_NOTE, questionSuggestions, type AiConversation } from "@/lib/ai";

/**
 * シラバス全体に対する質問（`/syllabus`。design.md §7.4）。
 *
 * **PC のパネル（`SyllabusChatPanel`）とモバイルの AI シートが同じ会話
 * （`syllabusMessages`。§5.2.2）を読み書きする。** 両者は同時に mount されるため、
 * 送信中かどうかは各自の state ではなく吹き出しの `streaming` から導く。
 */
// 講義の内容(概要・到達目標・授業計画)まで探せる(design.md §7.4.1 規則7)。学生の文脈が
// あれば区分と要件枠でも答えられる(規則5)
const QUICK_ASKS = ["AIに関係する科目は？", "人文科学系で取れる科目は？"];

const INITIAL: ChatMessage = {
  id: "syllabus-init",
  role: "assistant",
  content:
    "探したい科目を言葉で伝えてください。興味のあるテーマ・曜日・区分から、講義の内容まで調べて候補を挙げます。",
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
  // 揃えば課程コード・入学年度・対象学期も送り、その学生にとっての区分や要件の
  // 充足状況で答えさせる(design.md §7.4.1)。揃わなければ学年と課程だけで答える
  const { profile, context } = useStudentContext();
  const { entries, archive, restore } = useChatHistory("syllabus");
  const abortRef = useRef<AbortController | null>(null);
  // 停止ボタンで止めた（会話の切り替えで中断したのと分ける）
  const stoppedRef = useRef(false);

  const messages = useMemo(
    () => (syllabusMessages.length > 0 ? syllabusMessages : [INITIAL]),
    [syllabusMessages],
  );
  const streaming = messages.some((m) => m.streaming);

  // `prior` は送る前の会話。再生成は末尾の答えと発話を除いた会話を渡す
  const send = useCallback(
    async (raw: string, prior: ChatMessage[] = messages) => {
      const text = raw.trim();
      if (!text || streaming) return;

      const time = hhmm();
      seq += 1;
      const assistantId = `syllabus-a${seq}`;
      const history = prior
        .filter((m) => !m.streaming)
        .map((m) => ({ role: m.role, content: m.content }));

      // 1件目の送信で初期メッセージを履歴に固定する（以降は store が正）
      setSyllabusMessages([
        ...prior,
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
      stoppedRef.current = false;
      const reply = replyStream(patch);
      let failed = false;
      try {
        // シラバス全体への質問なので、講義単位(§7.5)ではなく全体の口(§7.4)を叩く。
        // 以前は講義単位の口に "__syllabus__" という架空のコードを渡しており、
        // backend が実在確認(`get_syllabus`)で 404 を返すため常に失敗していた。
        await streamSyllabusChat(
          { profile, history, message: text, ...context },
          reply.handlers,
          ctrl.signal,
        );
      } catch (err) {
        reply.flush();
        if ((err as Error).name !== "AbortError") {
          failed = true;
          patch({ content: "申し訳ありません。応答の取得に失敗しました。" });
        }
      } finally {
        reply.end();
        // delta も error も来ずに終わると本文が空のまま残る（§4.1.4）
        patch({
          streaming: false,
          ...(stoppedRef.current
            ? stoppedPatch(reply.content())
            : reply.content() || failed
              ? {}
              : { content: "応答を受け取れませんでした。" }),
        });
        if (abortRef.current === ctrl) abortRef.current = null;
      }
    },
    [messages, streaming, setSyllabusMessages, profile, context],
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
      regenerate: () => {
        const target = regenerateFrom(messages);
        if (target) void send(target.text, target.prior);
      },
      stop: () => {
        if (!abortRef.current) return;
        stoppedRef.current = true;
        abortRef.current.abort();
      },
      quickAsks: QUICK_ASKS,
      // 入力した文章が記録されることを、書く場所の傍らで示す（§9.1）
      note: CHAT_LOG_NOTE,
      history: entries,
      onSelectHistory,
      onNewChat,
      suggestionsFor: () => questionSuggestions("この検索について聞けること", QUICK_ASKS),
    }),
    [messages, streaming, send, entries, onSelectHistory, onNewChat],
  );
}
