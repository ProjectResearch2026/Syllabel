"use client";

import { useId, useRef, useState } from "react";
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

/** 入力欄の1行ぶんの高さ（行の高さ 21px + 上下の余白 9.5px ずつ） */
const SINGLE_LINE_HEIGHT = 40;

/**
 * 入力欄。送れるときだけ送って入力を消す（Enter は無効なときも届く）。
 * 書いた行に合わせて高さが伸び、上限（PC 8行・モバイル 5行）を超えたら欄の中でスクロールする。
 * PC は Enter で送り Shift+Enter で改行する（Claude と同じ）。タッチの端末は Enter で改行し、
 * 送るのはボタンだけ — ソフトキーボードには Shift が無く、Enter で送ると改行できない
 */
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
  // 2行目に入ったら枠を丸から角丸に替える（丸のままだと四隅で文字が切れる）
  const [multiline, setMultiline] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();
  const { streaming, inputDisabled = false, note, stop } = conversation;
  const label = placeholder ?? conversation.placeholder;
  const disabled = streaming || inputDisabled;

  // 中身に高さを合わせる。上限は CSS の max-height が決める
  const fit = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    setMultiline(el.scrollHeight > SINGLE_LINE_HEIGHT);
  };

  const submit = () => {
    if (!value.trim() || disabled) return;
    onSend(value);
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "";
    setMultiline(false);
  };

  return (
    <div className="shrink-0 bg-surface-gray">
      <div className="p-3">
        <div
          className={`flex items-end gap-2 bg-surface-primary p-3 ${multiline ? "rounded-3xl" : "rounded-full"}`}
        >
          <label htmlFor={inputId} className="sr-only">
            {label}
          </label>
          <textarea
            ref={textareaRef}
            id={inputId}
            rows={1}
            value={value}
            autoFocus={autoFocus}
            onChange={(e) => {
              setValue(e.target.value);
              fit(e.target);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.shiftKey) return;
              // 変換の確定に押した Enter は送らない。Safari は確定の keydown で
              // isComposing が false になるため keyCode 229 でも見分ける
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              if (window.matchMedia("(pointer: coarse)").matches) return;
              e.preventDefault();
              submit();
            }}
            placeholder={label}
            disabled={disabled}
            className="block max-h-[168px] min-h-10 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-3 py-[9.5px] text-[13px] leading-[21px] text-fg-primary outline-none placeholder:text-fg-faint disabled:opacity-60 max-md:max-h-[105px]"
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
