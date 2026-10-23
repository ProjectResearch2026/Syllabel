"use client";

import { memo } from "react";
import { ArrowLeftRight } from "lucide-react";
import type { ChatMessage } from "@/lib/chat";
import { useScrollToBottom } from "@/lib/useScrollToBottom";
import MarkdownText from "./MarkdownText";
import ThinkingIndicator from "./ThinkingIndicator";
import AgentTrace from "./AgentTrace";

/** 本文が届く前に出す既定の文言（design.md §4.1.4）。所要時間は画面ごとに添える */
export const DEFAULT_THINKING_LABEL = "考えています…";

/**
 * 会話の吹き出しの並び（ui-design_pc.pen / ui-design_phone.pen の Chat/AIBubble・
 * Chat/UserBubble）。**PC のパネルとモバイルのシートが同じものを使う。**
 *
 * AI 側は白地・左上だけ角を立て、学生側は淡いグレー地・右上だけ角を立てる。
 * 吹き出しの幅は設計どおりに保ち、表は `MarkdownText` の中で横スクロールさせる。
 *
 * 吹き出しは現れるときに下から浮かせる。CSS の動きはマウント時に1回だけなので、
 * 受信中に本文が伸びても流れ直さない。
 */
export default function ChatMessageList({
  messages,
  thinkingLabel = DEFAULT_THINKING_LABEL,
  showDate = false,
  className = "",
  children,
}: {
  messages: ChatMessage[];
  thinkingLabel?: string;
  /** 先頭に「今日」の印を出す（モバイルの全画面シート） */
  showDate?: boolean;
  className?: string;
  /** 吹き出しの後ろに続けるもの（定型の質問など） */
  children?: React.ReactNode;
}) {
  const listRef = useScrollToBottom<HTMLDivElement>(messages, messages.length);

  return (
    <div
      ref={listRef}
      className={`flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-surface-gray ${className}`}
    >
      {showDate && (
        <div className="flex justify-center">
          <span className="rounded-full bg-surface-gray px-2.5 py-1 text-[10px] font-bold text-fg-muted">
            今日
          </span>
        </div>
      )}

      {messages.map((msg) =>
        msg.role === "user" ? (
          <UserBubble key={msg.id} message={msg} />
        ) : (
          <AssistantBubble key={msg.id} message={msg} thinkingLabel={thinkingLabel} />
        ),
      )}

      {children}
    </div>
  );
}

/**
 * 学生の吹き出し。書いた文は Markdown として解釈しない。
 *
 * 吹き出しは `memo` で包む。受信中は届くたびに会話の配列が新しくなるが、書き換わるのは
 * 受信中の1件だけ(他は同じオブジェクト)なので、ほかの吹き出しの Markdown を描き直さない。
 * 描き直していた頃は、思考と本文が届く速さに画面が追い付かなかった
 */
const UserBubble = memo(function UserBubble({ message }: { message: ChatMessage }) {
  return (
    <div className="flex w-full justify-end motion-safe:animate-rise-in">
      <div className="max-w-[230px] whitespace-pre-wrap rounded-[12px_2px_12px_12px] border border-border-primary bg-surface-soft p-3 text-[13px] leading-[21px] text-fg-primary">
        {message.content}
      </div>
    </div>
  );
});

const AssistantBubble = memo(function AssistantBubble({
  message: msg,
  thinkingLabel,
}: {
  message: ChatMessage;
  thinkingLabel: string;
}) {
  return (
    <div className="flex max-w-[280px] flex-col gap-2 rounded-[2px_12px_12px_12px] border border-border-primary bg-surface-primary p-3 motion-safe:animate-rise-in">
      {/* 考えている様子（思考・ツールの進み具合。§8.3.7）。本文の上に置く */}
      <AgentTrace
        thinking={msg.thinking}
        activities={msg.activities}
        answering={Boolean(msg.content)}
        streaming={Boolean(msg.streaming)}
      />
      {/* 何も来ていないあいだは指標を出す。空の吹き出しを置かない（§4.1.4）。
          `MarkdownText` のキャレットは最後のブロックの ::after なので、
          本文が空だと掛ける先が無く何も見えない */}
      {msg.streaming && !msg.content ? (
        !msg.thinking?.trim() && !msg.activities?.length && <ThinkingIndicator label={thinkingLabel} />
      ) : (
        // 指標から本文へ差し替わるときはふわっと出す（マウント時の1回だけ）
        <MarkdownText
          className="text-[13px] leading-[21px] text-fg-primary motion-safe:animate-fade-in"
          caret={msg.streaming}
        >
          {msg.content}
        </MarkdownText>
      )}
      {/* 差し替え案（Chat/SuggestCard）。AIが返したときだけ出る */}
      {msg.items?.map((item) => (
        <p
          key={item.name}
          className="flex items-center gap-2 rounded-md bg-accent-light p-3 text-xs font-semibold text-accent"
        >
          <ArrowLeftRight size={16} className="shrink-0" aria-hidden="true" />
          {item.name}
        </p>
      ))}
    </div>
  );
});
