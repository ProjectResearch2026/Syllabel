"use client";

import { useId, useState } from "react";
import { ArrowUp, Menu, Square, SquarePen } from "lucide-react";
import type { AiConversation } from "@/lib/ai";
import { titleOf } from "@/lib/chatHistory";
import ChatHistoryMenu from "../pc/ChatHistoryMenu";

/**
 * 会話の枠の部品（ui-design_pc.pen の Chat/Header・Chat/InputBar・Chat/QuickAskChip）。
 * **PC のパネル（`AiChatPanel`）とモバイルのシート（`MobileAiAssistant`）が同じものを
 * 使う**ので、設計を直すときはここだけを直せば両方がそろう。
 */

/**
 * ヘッダー。ハンバーガーは「最近のチャット」を開き、右端の新規ボタンで会話をやり直す。
 * `trailing` にはモバイルのシートの全画面・閉じるなどを入れる。
 */
export function ChatHeader({
  conversation,
  trailing,
}: {
  conversation: AiConversation;
  trailing?: React.ReactNode;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const { title, messages, history, onSelectHistory, onNewChat } = conversation;

  return (
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
      {trailing}

      {historyOpen && (
        <ChatHistoryMenu
          current={titleOf(messages)}
          entries={history}
          onSelect={(id) => {
            setHistoryOpen(false);
            onSelectHistory(id);
          }}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * 定型の質問と、その場で何かを起こすボタン（履修提案の開始・再提案など。§8.3）。
 * 送信中は隠す。
 */
export function ChatQuickAsks({
  conversation,
  onAsk,
  className = "",
}: {
  conversation: AiConversation;
  onAsk: (question: string) => void;
  className?: string;
}) {
  const { quickAsks = [], actions = [], streaming } = conversation;
  if (streaming || (quickAsks.length === 0 && actions.length === 0)) return null;
  return (
    <div className={`flex gap-2 ${className}`}>
      {quickAsks.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onAsk(q)}
          className="shrink-0 rounded-2xl border border-border-primary bg-surface-primary px-3 py-2 text-left text-xs font-medium text-fg-secondary transition-colors hover:border-fg-primary"
        >
          {q}
        </button>
      ))}
      {actions.map(({ label, onClick }) => (
        <button
          key={label}
          type="button"
          onClick={onClick}
          className="shrink-0 rounded-2xl border border-accent bg-surface-primary px-3 py-2 text-left text-xs font-bold text-accent transition-colors hover:bg-accent-light"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** 入力欄。送れるときだけ送って入力を消す（Enter は無効なときも届く） */
export function ChatInputBar({
  conversation,
  placeholder,
  onSend,
  autoFocus = false,
}: {
  conversation: AiConversation;
  /** 既定は会話のプレースホルダ。モバイルは参照中の文脈で差し替える */
  placeholder?: string;
  onSend: (text: string) => void;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const inputId = useId();
  const { streaming, inputDisabled = false, note, stop } = conversation;
  const label = placeholder ?? conversation.placeholder;
  const disabled = streaming || inputDisabled;

  const submit = () => {
    if (!value.trim() || disabled) return;
    onSend(value);
    setValue("");
  };

  return (
    <div className="shrink-0 bg-surface-gray">
      <div className="p-3">
        <div className="flex items-center gap-2 rounded-full bg-surface-primary p-3">
          <label htmlFor={inputId} className="sr-only">
            {label}
          </label>
          <input
            id={inputId}
            type="text"
            value={value}
            autoFocus={autoFocus}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
            }}
            placeholder={label}
            disabled={disabled}
            className="h-10 min-w-0 flex-1 bg-transparent px-3 text-[13px] text-fg-primary outline-none placeholder:text-fg-faint disabled:opacity-60"
          />
          {/* 受信中は送信ボタンを停止ボタンに替える（Claude と同じ四角） */}
          {streaming && stop ? (
            <button
              type="button"
              onClick={stop}
              aria-label="応答を止める"
              title="応答を止める"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-accent transition-colors hover:bg-primary-dark"
            >
              <Square size={14} className="fill-current text-fg-inverse" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!value.trim() || disabled}
              aria-label="送信"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-accent transition-opacity hover:bg-primary-dark disabled:opacity-40"
            >
              <ArrowUp size={18} className="text-fg-inverse" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      {note && <p className="px-5 pb-3 text-[10px] leading-4 text-fg-secondary">{note}</p>}
    </div>
  );
}
