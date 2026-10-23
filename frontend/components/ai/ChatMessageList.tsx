"use client";

import { memo } from "react";
import { ArrowLeftRight, RotateCw } from "lucide-react";
import { regenerateFrom, STOPPED_TEXT, type ChatMessage } from "@/lib/chat";
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
 * 吹き出しの幅は会話の欄に対する割合で決める（AI 側 90%・学生側 75%）。PC のパネル
 * (344px)では設計の 280px・230px とほぼ同じになり、モバイルのシートでは画面の幅に
 * 合わせて広がる（px で固定していた頃は、スマホでも左右に大きな余白が残った）。
 * 表のために広げることはせず、表は `MarkdownText` の中で横スクロールさせる。
 *
 * 吹き出しは現れるときに下から浮かせる。CSS の動きはマウント時に1回だけなので、
 * 受信中に本文が伸びても流れ直さない。
 *
 * **末尾の AI の吹き出しの右に、再生成のボタンを置く**（Claude のチャットと同じ回る矢印）。
 * 押すと直前の質問を送り直して答えを作り直す。失敗したとき（「応答の取得に失敗しました」）
 * に、同じ質問を書き直さずに送り直せる。学生の発話への答えでない吹き出し（案内・
 * 「希望条件なしで提案する」の説明）と受信中には出さない（`regenerateFrom()`）。
 */
export default function ChatMessageList({
  messages,
  thinkingLabel = DEFAULT_THINKING_LABEL,
  showDate = false,
  onRegenerate,
  className = "",
  children,
}: {
  messages: ChatMessage[];
  thinkingLabel?: string;
  /** 末尾の答えを作り直す（`AiConversation.regenerate`）。無ければボタンを出さない */
  onRegenerate?: () => void;
  /** 先頭に「今日」の印を出す（モバイルの全画面シート） */
  showDate?: boolean;
  className?: string;
  /** 吹き出しの後ろに続けるもの（定型の質問など） */
  children?: React.ReactNode;
}) {
  const listRef = useScrollToBottom<HTMLDivElement>(messages, messages.length);
  // 再生成のボタンを付ける吹き出し。ほかの吹き出しには渡さず、memo を崩さない
  const regenerableId =
    onRegenerate && regenerateFrom(messages) ? messages[messages.length - 1].id : null;

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
          <AssistantBubble
            key={msg.id}
            message={msg}
            thinkingLabel={thinkingLabel}
            onRegenerate={msg.id === regenerableId ? onRegenerate : undefined}
          />
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
      <div className="max-w-[75%] whitespace-pre-wrap rounded-[12px_2px_12px_12px] border border-border-primary bg-surface-soft p-3 text-[13px] leading-[21px] text-fg-primary">
        {message.content}
      </div>
    </div>
  );
});

const AssistantBubble = memo(function AssistantBubble({
  message: msg,
  thinkingLabel,
  onRegenerate,
}: {
  message: ChatMessage;
  thinkingLabel: string;
  onRegenerate?: () => void;
}) {
  const bubble = (
    <div className="flex max-w-[90%] flex-col gap-2 rounded-[2px_12px_12px_12px] border border-border-primary bg-surface-primary p-3 motion-safe:animate-rise-in">
      {/* 考えている様子（思考・ツールの進み具合。§8.3.7）。本文の上に置く */}
      <AgentTrace trace={msg.trace} streaming={Boolean(msg.streaming)} />
      {/* 何も来ていないあいだは指標を出す。空の吹き出しを置かない（§4.1.4）。
          `MarkdownText` のキャレットは最後のブロックの ::after なので、
          本文が空だと掛ける先が無く何も見えない */}
      {msg.streaming && !msg.content ? (
        !msg.trace?.length && <ThinkingIndicator label={thinkingLabel} />
      ) : (
        // 指標から本文へ差し替わるときはふわっと出す（マウント時の1回だけ）
        <MarkdownText
          className="text-[13px] leading-[21px] text-fg-primary motion-safe:animate-fade-in"
          caret={msg.streaming}
        >
          {msg.content}
        </MarkdownText>
      )}
      {/* 停止ボタンで止めた答え。本文が届いていなければ本文がその文言になっている */}
      {msg.stopped && msg.content !== STOPPED_TEXT && (
        <p className="text-[11px] text-fg-muted">応答を止めました</p>
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
  if (!onRegenerate) return bubble;
  return (
    // 吹き出しの右下に置く（Claude の再生成と同じ回る矢印）
    <div className="flex items-end gap-1">
      {bubble}
      <button
        type="button"
        onClick={onRegenerate}
        aria-label="答えを作り直す"
        title="答えを作り直す"
        className="grid size-7 shrink-0 place-items-center rounded-full text-fg-muted transition-colors hover:bg-surface-soft hover:text-fg-secondary"
      >
        <RotateCw size={15} aria-hidden="true" />
      </button>
    </div>
  );
});
