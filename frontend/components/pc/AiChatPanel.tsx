"use client";

import type { AiConversation } from "@/lib/ai";
import ChatMessageList from "../ai/ChatMessageList";
import { ChatHeader, ChatInputBar, ChatQuickAsks } from "../ai/ChatParts";

/**
 * PC版のAIチャットパネル（ui-design_pc.pen ChatPanel）。
 *
 * 時間割・シラバス一覧・講義詳細の3画面で**同じ見た目**を使う。中身（送信や
 * ストリーミング）は画面ごとの会話（`AiConversation`）が持ち、**モバイルの
 * AI シート（`MobileAiAssistant`）も同じ会話を受け取る**。見た目の部品も
 * `ChatParts` / `ChatMessageList` をシートと共有している。
 *
 * 幅 344px・高さは親いっぱい。設計上ヘッダーと入力欄の地はグレー、
 * 吹き出しの並ぶ本文もグレーで、カード自体が白い枠として見える。
 */
export default function AiChatPanel({ conversation }: { conversation: AiConversation }) {
  return (
    <aside className="flex min-h-0 w-[344px] shrink-0 flex-col self-stretch overflow-hidden rounded-lg border border-border-primary bg-surface-primary">
      <ChatHeader conversation={conversation} />

      <ChatMessageList
        messages={conversation.messages}
        thinkingLabel={conversation.thinkingLabel}
        className="gap-3.5 p-4"
      >
        <ChatQuickAsks
          conversation={conversation}
          onAsk={(q) => conversation.send(q)}
          className="flex-col items-start"
        />
      </ChatMessageList>

      <ChatInputBar conversation={conversation} onSend={(text) => conversation.send(text)} />
    </aside>
  );
}
