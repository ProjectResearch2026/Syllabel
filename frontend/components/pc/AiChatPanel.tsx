"use client";

import { useId, useState } from "react";
import { ArrowUp, Menu, SquarePen } from "lucide-react";
import type { ChatMessage } from "@/lib/chat";
import type { ArchivedChat } from "@/lib/chatHistory";
import { titleOf } from "@/lib/chatHistory";
import { useScrollToBottom } from "@/lib/useScrollToBottom";
import MarkdownText from "../ai/MarkdownText";
import ThinkingIndicator from "../ai/ThinkingIndicator";
import ChatHistoryMenu from "./ChatHistoryMenu";

/** 本文が届く前に出す既定の文言（design.md §4.1.4）。所要時間は画面ごとに添える */
const DEFAULT_THINKING_LABEL = "考えています…";

/**
 * PC版のAIチャットパネル（ui-design_pc.pen ChatPanel）。
 *
 * 時間割・シラバス一覧・講義詳細の3画面で**同じ見た目**を使う。以前は画面ごとに
 * 吹き出しと入力欄を書き写していたため、設計を直すたびに3か所を直す必要があった。
 * ここは見た目だけを持ち、送信やストリーミングは呼び出し側の store に任せる。
 *
 * 幅 344px・高さは親いっぱい。設計上ヘッダーと入力欄の地はグレー、
 * 吹き出しの並ぶ本文もグレーで、カード自体が白い枠として見える。
 */
export type AiChatPanelProps = {
  /** ヘッダーに出す一行（例: 「AI履修アシスタント」） */
  title: string;
  messages: ChatMessage[];
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  placeholder: string;
  /** 送信中。入力を止め、末尾の吹き出しにキャレットを出す */
  streaming?: boolean;
  /**
   * 本文が1文字も届いていないあいだ、吹き出しに出す文言（§4.1.4）。
   * 待ち時間の長さが画面で違うため呼び出し側が渡す — 履修提案の生成は
   * 4〜5分かかり得る（§7.2）ので所要時間を添える。
   */
  thinkingLabel?: string;
  /**
   * 送信中ではないが入力を受け付けられない（提案の前提が揃っていないなど。
   * design.md §8.3.2）。押しても何も起きない送信ボタンを出さないために分ける。
   */
  inputDisabled?: boolean;
  /** 会話をやり直す。渡さなければ新規ボタンを出さない */
  onNewChat?: () => void;
  /** 定型の質問。送信中は隠す */
  quickAsks?: string[];
  onQuickAsk?: (question: string) => void;
  /**
   * 文章を送るのではなく、その場で何かを起こすボタン（履修提案の開始・再提案など。
   * design.md §8.3）。`quickAsks` と同じ位置に、押せる見た目で並べる。
   */
  actions?: { label: string; onClick: () => void }[];
  /** 入力欄の下に出す断り書き（希望条件の記録についてなど。§9.1） */
  note?: string;
  /** ハンバーガーから開く「最近のチャット」。新しい順 */
  history?: ArchivedChat[];
  /** 履歴の会話に切り替える */
  onSelectHistory?: (id: string) => void;
};

export default function AiChatPanel({
  title,
  messages,
  input,
  onInputChange,
  onSend,
  placeholder,
  streaming = false,
  thinkingLabel = DEFAULT_THINKING_LABEL,
  inputDisabled = false,
  onNewChat,
  quickAsks = [],
  onQuickAsk,
  actions = [],
  history = [],
  onSelectHistory,
  note,
}: AiChatPanelProps) {
  const listRef = useScrollToBottom<HTMLDivElement>(messages);
  const inputId = useId();
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <aside className="flex min-h-0 w-[344px] shrink-0 flex-col self-stretch overflow-hidden rounded-lg border border-border-primary bg-surface-primary">
      {/* Header。ハンバーガーは「最近のチャット」を開く */}
      <div className="relative flex h-[52px] shrink-0 items-center gap-2.5 bg-surface-gray px-4">
        <button
          type="button"
          onClick={() => setHistoryOpen((open) => !open)}
          aria-label="最近のチャット"
          aria-haspopup="menu"
          aria-expanded={historyOpen}
          className="grid size-[30px] shrink-0 place-items-center rounded-full transition-colors hover:bg-surface-soft"
        >
          <Menu size={16} className="text-fg-primary" aria-hidden="true" />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-fg-primary">{title}</h2>
        {onNewChat && (
          <button
            type="button"
            onClick={() => {
              setHistoryOpen(false);
              onNewChat();
            }}
            aria-label="会話をやり直す"
            className="grid size-[30px] shrink-0 place-items-center rounded-full bg-surface-primary transition-colors hover:bg-surface-soft"
          >
            <SquarePen size={16} className="text-fg-primary" aria-hidden="true" />
          </button>
        )}

        {historyOpen && (
          <ChatHistoryMenu
            current={titleOf(messages)}
            entries={history}
            onSelect={(id) => {
              setHistoryOpen(false);
              onSelectHistory?.(id);
            }}
            onClose={() => setHistoryOpen(false)}
          />
        )}
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto bg-surface-gray p-4"
      >
        {messages.map((msg) =>
          msg.role === "user" ? (
            <div key={msg.id} className="flex w-full justify-end">
              <div className="max-w-[230px] rounded-[12px_2px_12px_12px] border border-border-primary bg-surface-soft p-3 text-[13px] leading-[21px] text-fg-primary">
                {msg.content}
              </div>
            </div>
          ) : (
            <div
              key={msg.id}
              className="flex max-w-[280px] flex-col gap-2 rounded-[2px_12px_12px_12px] border border-border-primary bg-surface-primary p-3"
            >
              {/* 本文が来る前は指標を出す。空の吹き出しを置かない（§4.1.4）。
                  `MarkdownText` のキャレットは最後のブロックの ::after なので、
                  本文が空だと掛ける先が無く何も見えない */}
              {msg.streaming && !msg.content ? (
                <ThinkingIndicator label={thinkingLabel} />
              ) : (
                <MarkdownText
                  className="text-[13px] leading-[21px] text-fg-primary"
                  caret={msg.streaming}
                >
                  {msg.content}
                </MarkdownText>
              )}
              {/* 提案カード。AIが差し替え案を返したときだけ出る */}
              {msg.items?.map((item) => (
                <p
                  key={item.name}
                  className="flex items-center gap-2 rounded-md bg-accent-light p-2.5 text-xs font-semibold text-accent"
                >
                  {item.name}
                </p>
              ))}
            </div>
          ),
        )}

        {!streaming && (quickAsks.length > 0 || actions.length > 0) && (
          <div className="flex w-full flex-col items-start gap-2">
            {onQuickAsk &&
              quickAsks.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => onQuickAsk(q)}
                  className="rounded-2xl border border-border-primary bg-surface-primary px-3 py-2 text-left text-xs font-medium text-fg-secondary transition-colors hover:border-fg-primary"
                >
                  {q}
                </button>
              ))}
            {actions.map(({ label, onClick }) => (
              <button
                key={label}
                type="button"
                onClick={onClick}
                className="rounded-2xl border border-accent bg-surface-primary px-3 py-2 text-left text-xs font-bold text-accent transition-colors hover:bg-accent-light"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 bg-surface-gray p-3">
        <div className="flex items-center gap-2 rounded-full bg-surface-primary p-3">
          <label htmlFor={inputId} className="sr-only">
            {placeholder}
          </label>
          <input
            id={inputId}
            type="text"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) onSend();
            }}
            placeholder={placeholder}
            disabled={streaming || inputDisabled}
            className="h-10 min-w-0 flex-1 bg-transparent px-3 text-[13px] text-fg-primary outline-none placeholder:text-fg-faint disabled:opacity-60"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!input.trim() || streaming || inputDisabled}
            aria-label="送信"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-accent transition-opacity hover:bg-primary-dark disabled:opacity-40"
          >
            <ArrowUp size={18} className="text-fg-inverse" aria-hidden="true" />
          </button>
        </div>
        {note && <p className="px-3 pt-2 text-[11px] leading-4 text-fg-faint">{note}</p>}
      </div>
    </aside>
  );
}
