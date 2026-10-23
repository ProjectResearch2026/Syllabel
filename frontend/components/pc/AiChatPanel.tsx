"use client";

import { X } from "lucide-react";
import { sheetInputPlaceholder, type AiContext, type AiConversation } from "@/lib/ai";
import ChatMessageList from "../ai/ChatMessageList";
import { ChatHeader, ChatInputBar, ChatQuickAsks } from "../ai/ChatParts";
import ContextChip from "../ai/ContextChip";

/**
 * パネルが参照中の文脈（時間割の科目・空きコマ）。画面の側で選んだものを受け取る。
 * モバイルの Ask Bar・シートの「参照中」と同じ役割で、選択は `useAiStore` の
 * `selection` を共有する。
 */
export type PanelContext = {
  /** 選択が無いときの文脈（例: 「この時間割」） */
  base: AiContext;
  /** 画面で選んでいる科目・コマ。無ければ `base` について聞く */
  selection: AiContext | null;
  /** 選択を外して `base` に戻す */
  onClear: () => void;
  /** 選択が無いときに添える一言（何を押せば絞れるか） */
  hint?: string;
};

/**
 * PC版のAIチャットパネル（ui-design_pc.pen ChatPanel）。
 *
 * 時間割・シラバス一覧・講義詳細の3画面で**同じ見た目**を使う。中身（送信や
 * ストリーミング）は画面ごとの会話（`AiConversation`）が持ち、**モバイルの
 * AI シート（`MobileAiAssistant`）も同じ会話を受け取る**。見た目の部品も
 * `ChatParts` / `ChatMessageList` をシートと共有している。
 *
 * `context` を渡した画面（時間割）では、ヘッダーの下に参照中の文脈を出し、
 * 送る質問にその文脈を添える（`conversation.send(text, context)`）。科目・コマを
 * 選んでいるあいだは、その文脈のサジェスト（`suggestionsFor`）を定型の質問として出す。
 *
 * 幅 344px・高さは親いっぱい。設計上ヘッダーと入力欄の地はグレー、
 * 吹き出しの並ぶ本文もグレーで、カード自体が白い枠として見える。
 */
export default function AiChatPanel({
  conversation,
  context,
  autoFocus = false,
}: {
  conversation: AiConversation;
  context?: PanelContext;
  /** 入力欄に最初からフォーカスする（mount 時だけ効く） */
  autoFocus?: boolean;
}) {
  const current = context ? (context.selection ?? context.base) : undefined;
  const scoped = context?.selection != null;
  // 選んだ科目・コマについて聞けること。会話が提案前などで返さなければ出さない
  const suggestions = scoped && current ? (conversation.suggestionsFor?.(current) ?? null) : null;
  const quick = suggestions
    ? { ...conversation, quickAsks: suggestions.items.map((item) => item.title) }
    : conversation;

  const ask = (question: string) => {
    // サジェストは題ではなく、文脈を書き込んだ質問文を送る（モバイルのハーフシートと同じ）
    const picked = suggestions?.items.find((item) => item.title === question);
    if (picked) conversation.send(picked.prompt);
    else conversation.send(question, current);
  };

  return (
    <aside className="flex min-h-0 w-[344px] shrink-0 flex-col self-stretch overflow-hidden rounded-lg border border-border-primary bg-surface-primary">
      <ChatHeader conversation={conversation} />

      {/* 提案前の時間割は表が空で、「この時間割について」と出しても指すものが無い */}
      {context && current && (scoped || !conversation.hideBaseContext) && (
        <div className="flex h-[42px] shrink-0 items-center gap-2 border-y border-border-subtle bg-surface-gray px-4">
          <ContextChip context={current} rounded="full" />
          <span className="min-w-0 flex-1 truncate text-[11px] text-fg-secondary">
            {scoped || !context.hint ? "について質問" : `について質問 ・ ${context.hint}`}
          </span>
          {scoped && (
            <button
              type="button"
              onClick={context.onClear}
              aria-label={`${context.base.label}に戻す`}
              title={`${context.base.label}に戻す`}
              className="grid size-6 shrink-0 place-items-center rounded-full transition-colors hover:bg-surface-soft"
            >
              <X size={14} className="text-fg-muted" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      <ChatMessageList
        messages={conversation.messages}
        thinkingLabel={conversation.thinkingLabel}
        onRegenerate={conversation.regenerate}
        className="gap-3.5 p-4"
      >
        {suggestions && !conversation.streaming && (
          <p className="text-[11px] font-bold text-fg-muted">{suggestions.label}</p>
        )}
        <ChatQuickAsks conversation={quick} onAsk={ask} className="flex-col items-start" />
      </ChatMessageList>

      <ChatInputBar
        conversation={conversation}
        // 科目・コマについて聞けるのは提案チャットになってから（提案前は希望条件の欄）
        placeholder={
          scoped && current && conversation.suggestionsFor
            ? sheetInputPlaceholder(current, conversation.placeholder)
            : undefined
        }
        onSend={(text) => conversation.send(text, current)}
        autoFocus={autoFocus}
      />
    </aside>
  );
}
