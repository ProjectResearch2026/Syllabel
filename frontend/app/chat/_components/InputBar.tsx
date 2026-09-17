import { Paperclip, SendHorizontal } from "lucide-react";

export default function InputBar({
  value,
  onChange,
  onSend,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 px-4 h-16 bg-surface-primary border-t border-border-primary shrink-0">
      <div className="flex-1 flex items-center h-11 bg-surface-gray border border-border-primary rounded-lg px-3.5 gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !disabled && onSend()}
          placeholder="メッセージを入力..."
          disabled={disabled}
          className="flex-1 bg-transparent text-[14px] text-fg-primary placeholder-fg-faint outline-none disabled:opacity-60"
        />
        <Paperclip size={18} className="text-fg-muted shrink-0" />
      </div>
      <button
        onClick={onSend}
        disabled={!value.trim() || disabled}
        className="w-11 h-11 flex items-center justify-center bg-accent rounded-lg disabled:opacity-40 transition-opacity"
      >
        <SendHorizontal size={20} className="text-fg-inverse" />
      </button>
    </div>
  );
}
