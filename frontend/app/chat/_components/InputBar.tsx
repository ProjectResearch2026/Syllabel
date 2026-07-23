import { Paperclip, SendHorizontal } from "lucide-react";

export default function InputBar({
  value,
  onChange,
  onSend,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 px-4 h-16 bg-white border-t border-[#D1D5DB] shrink-0">
      <div className="flex-1 flex items-center h-11 bg-[#F3F4F6] border border-[#D1D5DB] rounded-lg px-3.5 gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSend()}
          placeholder="メッセージを入力..."
          className="flex-1 bg-transparent text-[14px] text-[#1A2B4E] placeholder-[#9CA3AF] outline-none"
        />
        <Paperclip size={18} className="text-[#9CA3AF] shrink-0" />
      </div>
      <button
        onClick={onSend}
        disabled={!value.trim()}
        className="w-11 h-11 flex items-center justify-center bg-[#E60012] rounded-lg disabled:opacity-40 transition-opacity"
      >
        <SendHorizontal size={20} className="text-white" />
      </button>
    </div>
  );
}
