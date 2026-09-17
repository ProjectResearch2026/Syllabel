"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import AiChatPanel from "@/components/pc/AiChatPanel";
import { useChatStore, type ChatMessage } from "@/lib/chat";
import { useChatHistory } from "@/lib/chatHistory";
import { useStudentStore } from "@/lib/student";
import { useProposalStore } from "@/lib/proposal";
import { streamProposalChat } from "@/lib/chatApi";

const FALLBACK_INTRO =
  "卒業要件から逆算し、今期の履修を提案しました。コマ重複はありません。ご質問があればお気軽にどうぞ。";

/** 会話の1行目。やり直したときも同じ挨拶から始める */
function introMessage(summary: string | null | undefined): ChatMessage {
  const now = new Date();
  return {
    id: `proposal-init-${Date.now()}`,
    role: "assistant",
    content: summary || FALLBACK_INTRO,
    time: `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`,
  };
}

/** 提案画面のAIパネル。見た目は `AiChatPanel`、中身は提案チャットのSSE（§7.2）。 */
export default function ChatPanel() {
  const { proposalMessages, setProposalMessages, addProposalMessage } = useChatStore();
  const profile = useStudentStore((s) => s.profile);
  const { status, message: proposalMessage } = useProposalStore();
  const { entries, archive, restore } = useChatHistory("proposal");
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const seq = useRef(0);

  /** いまの会話を履歴へどけてから、次の会話に移る */
  const swapTo = useCallback(
    (next: ChatMessage[]) => {
      abortRef.current?.abort();
      archive("proposal", proposalMessages);
      setProposalMessages(next);
    },
    [archive, proposalMessages, setProposalMessages],
  );

  // 提案が完了したらその説明を初期メッセージとして設定
  useEffect(() => {
    if (status === "done" && proposalMessages.length === 0) {
      const now = new Date();
      const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
      setProposalMessages([
        {
          id: "proposal-init-1",
          role: "assistant",
          content:
            proposalMessage ||
            "卒業要件から逆算し、今期の履修を提案しました。コマ重複はありません。ご質問があればお気軽にどうぞ。",
          time,
        },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // 提案生成中の表示
  useEffect(() => {
    if (status === "loading" && proposalMessages.length === 0) {
      const now = new Date();
      const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
      setProposalMessages([
        {
          id: "proposal-loading",
          role: "assistant",
          content: "",
          time,
          streaming: true,
        },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || streaming) return;
      setInput("");

      const now = new Date();
      const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
      const base = seq.current;
      seq.current += 2;
      const assistantId = `proposal-a${base + 1}`;

      const history = proposalMessages
        .filter((m) => !m.streaming)
        .map((m) => ({ role: m.role, content: m.content }));

      addProposalMessage({ id: `proposal-u${base}`, role: "user", content: text, time });
      addProposalMessage({ id: assistantId, role: "assistant", content: "", time, streaming: true });

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setStreaming(true);

      try {
        let accumulated = "";
        await streamProposalChat(
          { profile, history, message: text },
          (delta) => {
            accumulated += delta;
            useChatStore.setState((state) => ({
              proposalMessages: state.proposalMessages.map((m) =>
                m.id === assistantId ? { ...m, content: accumulated } : m,
              ),
            }));
          },
          ctrl.signal,
        );
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          useChatStore.setState((state) => ({
            proposalMessages: state.proposalMessages.map((m) =>
              m.id === assistantId
                ? { ...m, content: "申し訳ありません。応答の取得に失敗しました。" }
                : m,
            ),
          }));
        }
      } finally {
        useChatStore.setState((state) => ({
          proposalMessages: state.proposalMessages.map((m) =>
            m.id === assistantId ? { ...m, streaming: false } : m,
          ),
        }));
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [streaming, profile, proposalMessages, addProposalMessage],
  );

  return (
    <AiChatPanel
      title="AI履修アシスタント"
      messages={proposalMessages}
      input={input}
      onInputChange={setInput}
      onSend={() => send(input)}
      placeholder="提案について質問する…"
      streaming={streaming || status === "loading"}
      history={entries}
      onSelectHistory={(id) => {
        const messages = restore("proposal", id);
        if (messages) swapTo(messages);
      }}
      onNewChat={() => swapTo([introMessage(proposalMessage)])}
    />
  );
}
