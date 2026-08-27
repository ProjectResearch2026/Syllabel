"use client";

import {
  BookOpen,
  CalendarDays,
  Maximize2,
  Minimize2,
  Repeat,
  Sparkles,
  Timer,
  X,
} from "lucide-react";
import {
  AI_QUICK_CHIPS,
  sheetInputPlaceholder,
  suggestionsFor,
  useAiStore,
  type AiContext,
} from "@/lib/ai";
import AiMessageArea from "./AiMessageArea";
import AiSheetInput from "./AiSheetInput";
import AiSuggestList from "./AiSuggestList";
import { useAiChat } from "./useAiChat";

const CHIP_ICON = {
  timetable: CalendarDays,
  course: BookOpen,
  slot: Timer,
  syllabus: BookOpen,
} as const;

function ContextChip({ context }: { context: AiContext }) {
  const Icon = CHIP_ICON[context.kind];
  return (
    <span className="flex shrink-0 items-center gap-[5px] rounded-full bg-accent-light px-2.5 py-[5px]">
      <Icon size={13} className="text-accent" />
      <span className="text-[11px] font-bold text-accent">{context.label}</span>
    </span>
  );
}

/**
 * AIアシスタントのシート。
 *
 * ハーフ（384px・STEP4）とフルスクリーン（STEP5）は同じシートの2状態で、
 * 入口がどれであっても中身は「参照中チップ＋サジェスト／会話＋入力欄」で共通。
 * 差し替わるのは参照中チップとサジェストだけ、というのが設計意図。
 */
export default function AiSheet() {
  const mode = useAiStore((s) => s.mode);
  const context = useAiStore((s) => s.context);
  const expand = useAiStore((s) => s.expand);
  const minimize = useAiStore((s) => s.minimize);
  const close = useAiStore((s) => s.close);

  const { messages, streaming, send } = useAiChat();
  const suggestions = suggestionsFor(context);
  const full = mode === "full";

  return (
    <div
      className={`fixed inset-x-0 z-50 flex flex-col overflow-hidden rounded-t-[20px] bg-surface-primary shadow-sheet [animation:ai-sheet-in_.22s_ease-out] ${
        full ? "top-3 bottom-0" : "bottom-20 h-96"
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="履修AIアシスタント"
    >
      {/* Grabber */}
      <div className="flex shrink-0 justify-center pb-1 pt-2">
        <span className="h-1 w-10 rounded-full bg-border-primary" />
      </div>

      {/* Header */}
      <div
        className={`flex shrink-0 items-center gap-2 px-4 ${
          full ? "h-11 border-b border-border-primary" : "pb-2.5 pt-1.5"
        }`}
      >
        <Sparkles size={18} className="shrink-0 text-accent" />
        <span className="flex-1 truncate text-[15px] font-bold text-fg-primary">
          履修AIアシスタント
        </span>
        {full ? (
          <button type="button" onClick={minimize} aria-label="ハーフシートに戻す">
            <Minimize2 size={18} className="text-fg-muted" />
          </button>
        ) : (
          <button type="button" onClick={() => expand()} aria-label="全画面にする">
            <Maximize2 size={18} className="text-fg-muted" />
          </button>
        )}
        <button
          type="button"
          onClick={close}
          aria-label="閉じる"
          className={full ? "ml-2.5" : ""}
        >
          <X size={20} className="text-fg-muted" />
        </button>
      </div>

      {/* 参照中の文脈 */}
      {full ? (
        <div className="flex h-[46px] shrink-0 items-center gap-2 border-b border-border-subtle bg-surface-gray px-4">
          <ContextChip context={context} />
          <span className="flex-1 truncate text-[11px] text-fg-secondary">
            を参照中 ・ 追加で質問中
          </span>
          <Repeat size={15} className="shrink-0 text-fg-muted" />
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-1.5 px-4 pb-3">
          <ContextChip context={context} />
          <span className="text-[11px] text-fg-secondary">を参照中</span>
        </div>
      )}

      {/* 本体: 会話がまだ無ければサジェスト、始まっていれば会話 */}
      {messages.length === 0 ? (
        <AiSuggestList
          label={suggestions.label}
          items={suggestions.items}
          disabled={streaming}
          // サジェストからの質問はシート内で回答する（全画面には昇格しない）
          onPick={(suggestion) => send(suggestion.prompt)}
        />
      ) : (
        <AiMessageArea messages={messages} />
      )}

      {/* クイックチップは全画面のときだけ（STEP5） */}
      {full && (
        <div className="flex shrink-0 items-center gap-[7px] overflow-x-auto px-4 pb-2.5">
          {AI_QUICK_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              disabled={streaming}
              onClick={() => send(chip)}
              className="shrink-0 rounded-full border border-border-primary bg-surface-primary px-3 py-[7px] text-[11px] text-fg-primary disabled:opacity-50"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      <AiSheetInput
        variant={full ? "full" : "half"}
        placeholder={sheetInputPlaceholder(context)}
        disabled={streaming}
        // 自分で書いて送信した瞬間に全画面へ昇格する（STEP4 → STEP5）
        onSend={(text) => send(text, { promote: true })}
      />
    </div>
  );
}
