"use client";

import { useRouter } from "next/navigation";
import { Bot, Info, EllipsisVertical, ChevronLeft } from "lucide-react";

export default function ChatHeader() {
  const router = useRouter();

  return (
    <header className="flex items-center justify-between px-5 h-[60px] bg-white border-b border-[#D1D5DB] shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          aria-label="戻る"
          className="md:hidden -ml-1.5 flex items-center justify-center"
        >
          <ChevronLeft size={22} className="text-[#1A2B4E]" />
        </button>
        <div className="w-9 h-9 rounded-full bg-[#EEF0F5] flex items-center justify-center shrink-0">
          <Bot size={20} className="text-[#1A2B4E]" />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[#1A2B4E] text-[15px] font-bold leading-none">
            履修AIアシスタント
          </span>
          <div className="flex items-center gap-1">
            <span className="w-[7px] h-[7px] rounded-full bg-[#E60012] shrink-0" />
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
