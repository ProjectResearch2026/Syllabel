"use client";

import { useState } from "react";
import { ArrowUp, Mic, Sparkles } from "lucide-react";

/**
 * シート下部の入力欄。
 * ハーフシート（STEP4）は角丸の塗り欄＋独立した送信ボタン、
 * フルスクリーン（STEP5）は Ask Bar と同じ pill 形の一体型。
 * ここで送信すると STEP5 へ昇格するのが設計上の遷移条件。
 */
export default function AiSheetInput({
  placeholder,
  variant,
  disabled,
  onSend,
}: {
  placeholder: string;
  variant: "half" | "full";
  disabled?: boolean;
  onSend: (text: string) => void;
}) {
  const [value, setValue] = useState("");

  const submit = () => {
    if (!value.trim() || disabled) return;
    onSend(value);
    setValue("");
  };

  const input = (
    <input
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") submit();
      }}
      placeholder={placeholder}
      disabled={disabled}
      className="min-w-0 flex-1 bg-transparent text-[13px] text-fg-primary outline-none placeholder:text-fg-muted disabled:opacity-60"
    />
  );

  if (variant === "half") {
    return (
      <div className="flex shrink-0 items-center gap-2 border-t border-border-subtle px-4 pb-3 pt-2.5">
        <div className="flex h-11 flex-1 items-center gap-2 rounded-full bg-surface-gray px-4">
          {input}
          <Mic size={16} className="shrink-0 text-fg-muted" />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim() || disabled}
          aria-label="送信"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-accent disabled:opacity-40"
        >
          <ArrowUp size={17} className="text-fg-inverse" />
        </button>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-border-subtle bg-surface-primary px-4 pb-3.5 pt-2.5">
      <div className="flex h-12 items-center gap-2.5 rounded-full border border-border-primary bg-surface-primary pl-4 pr-2 shadow-askbar">
        <Sparkles size={18} className="shrink-0 text-accent" />
        {input}
        <Mic size={17} className="shrink-0 text-fg-muted" />
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim() || disabled}
          aria-label="送信"
          className="grid size-[34px] shrink-0 place-items-center rounded-full bg-accent disabled:opacity-40"
        >
          <ArrowUp size={16} className="text-fg-inverse" />
        </button>
      </div>
    </div>
  );
}
