import { Bot, ChevronLeft, Info, EllipsisVertical } from "lucide-react";

export default function ChatHeader() {
  return (
    <header className="flex items-center justify-between px-5 h-[60px] bg-white border-b border-[#D1D5DB] shrink-0">
      <div className="flex items-center gap-3">
        <ChevronLeft size={22} className="text-[#1A2B4E]" />
        <div className="w-9 h-9 rounded-full bg-[#1A2B4E] flex items-center justify-center shrink-0">
          <Bot size={20} className="text-white" />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[#1A2B4E] text-[15px] font-bold leading-none">
            履修AIアシスタント
          </span>
          <div className="flex items-center gap-1">
            <span className="w-[7px] h-[7px] rounded-full bg-[#1A2B4E] shrink-0" />
            <span className="text-[#9CA3AF] text-[11px]">オンライン</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3.5">
        <Info size={22} className="text-[#1A2B4E]" />
        <EllipsisVertical size={20} className="text-[#1A2B4E]" />
      </div>
    </header>
  );
}
