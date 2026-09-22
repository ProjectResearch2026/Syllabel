"use client";

import { useCallback, useRef, useState } from "react";
import { useChatStore, type ChatMessage } from "@/lib/chat";
import { useStudentStore } from "@/lib/student";
import { useAiStore, type AiContext } from "@/lib/ai";
import { useProposalStore } from "@/lib/proposal";
import {
  streamCourseChat,
  streamProposalChat,
  streamSyllabusChat,
} from "@/lib/chatApi";

function nowLabel(): string {
  const now = new Date();
  return `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/**
 * 時間割そのものを指す文脈か。**提案チャット(`/api/chat/proposal`)は `proposal` を
 * 必須とし、無ければ 422 を返す**(design.md §6.1)ため、この文脈は生成済みの提案が
 * あるときにしか成立しない(§8.3.1 と同じ理由)。
 */
function needsProposal(context: AiContext): boolean {
  return context.kind === "timetable" || context.kind === "slot";
}

/** シラバス側の文脈に応じて叩くSSEエンドポイントを選ぶ */
function streamFor(context: AiContext) {
  if (context.kind === "course" && context.code) {
    const code = context.code;
    return (
      body: Parameters<typeof streamSyllabusChat>[0],
      onChunk: (d: string) => void,
      signal?: AbortSignal,
    ) => streamCourseChat(code, body, onChunk, signal);
  }
  return streamSyllabusChat;
}

/**
 * AIアシスタントシートの送信処理。
 *
 * サジェストをタップした場合はシート内（ハーフ）で回答し、
 * 自分で入力して送信した場合はフルスクリーンへ昇格する
 * （ui-design_phone.pen STEP4 → STEP5 の遷移条件）。
 */
export function useAiChat() {
  const messages = useChatStore((s) => s.assistantMessages);
  const addMessage = useChatStore((s) => s.addAssistantMessage);
  const profile = useStudentStore((s) => s.profile);
  const context = useAiStore((s) => s.context);
  const expand = useAiStore((s) => s.expand);
  const { status, courses, totalCredits, message: summary } = useProposalStore();

  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const seq = useRef(0);

  const send = useCallback(
    async (text: string, options?: { promote?: boolean }) => {
      const message = text.trim();
      if (!message || streaming) return;
      if (options?.promote) expand();

      const time = nowLabel();
      const base = seq.current;
      seq.current += 2;
      const assistantId = `ai-a${base + 1}`;

      const history = messages
        .filter((m) => !m.streaming)
        .map((m) => ({ role: m.role, content: m.content }));

      addMessage({ id: `ai-u${base}`, role: "user", content: message, time });
      addMessage({ id: assistantId, role: "assistant", content: "", time, streaming: true });

      const patch = (update: (m: ChatMessage) => ChatMessage) =>
        useChatStore.setState((state) => ({
          assistantMessages: state.assistantMessages.map((m) =>
            m.id === assistantId ? update(m) : m,
          ),
        }));

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setStreaming(true);

      try {
        let accumulated = "";
        const onDelta = (delta: string) => {
          accumulated += delta;
          patch((m) => ({ ...m, content: accumulated }));
        };

        if (needsProposal(context)) {
          if (status !== "done") {
            // **このシートから提案は始めない**（§8.3.1）。提案が無い状態で
            // 提案チャットは成立しないため、作り方だけを案内する
            patch((m) => ({
              ...m,
              content:
                "まだ履修提案がありません。時間割の画面でAI履修アシスタントに希望条件を送ると提案を作れます。",
            }));
          } else {
            await streamProposalChat(
              {
                studentProfile: profile,
                proposal: { courses, totalCredits, summary },
                // 対話全体を1本で送る。末尾が今回の質問（§6.1）
                messages: [...history, { role: "user", content: message }],
              },
              onDelta,
              ctrl.signal,
            );
          }
        } else {
          // 学生プロファイルと対話履歴は毎回送る（サーバー側で永続化しないため）
          await streamFor(context)({ profile, history, message }, onDelta, ctrl.signal);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          patch((m) => ({ ...m, content: "申し訳ありません。応答の取得に失敗しました。" }));
        }
      } finally {
        patch((m) => ({ ...m, streaming: false }));
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, streaming, profile, context, addMessage, expand, status, courses, totalCredits, summary],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { messages, streaming, send, stop };
}
