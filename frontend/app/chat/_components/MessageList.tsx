import { Bot } from "lucide-react";
import { motion } from "motion/react";
import MarkdownText from "@/components/ai/MarkdownText";
import type { Message } from "./types";

export default function MessageList({
  messages,
  /** スクロールする要素に付ける ref(`lib/useScrollToBottom.ts`) */
  listRef,
}: {
  messages: Message[];
  listRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      <div className="flex justify-center">
        <span className="text-[#9CA3AF] text-[11px]">今日 · 9:38</span>
      </div>

      {messages.map((msg) =>
        msg.role === "assistant" ? (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex gap-2.5 items-start"
          >
            <div className="w-8 h-8 rounded-full bg-white border border-[#D1D5DB] flex items-center justify-center shrink-0">
              <Bot size={18} className="text-[#1A2B4E]" />
            </div>
            <div
              className={`max-w-[290px] bg-white rounded-lg px-3.5 py-3 space-y-1.5 ${
                msg.streaming
                  ? "border-l-[3px] border-[#E60012] border-t border-r border-b border-[#D1D5DB]"
                  : "border border-[#D1D5DB]"
              }`}
            >
              <MarkdownText className="text-[#1A2B4E] text-[13px] leading-snug">
                {msg.content}
              </MarkdownText>
              {msg.items && (
                <div className="space-y-2 mt-1">
                  {msg.items.map((item) => (
                    <div key={item.name} className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-sm bg-[#E60012] shrink-0 mt-1.5" />
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[#1A2B4E] text-xs font-semibold">{item.name}</span>
                        <span className="text-[#6B7280] text-[10px]">{item.note}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {msg.streaming && (
                <div className="flex items-center gap-1 pt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1A2B4E] animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1A2B4E] animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D1D5DB] animate-bounce [animation-delay:300ms]" />
                </div>
              )}
              <span className="block text-[#9CA3AF] text-[10px]">{msg.time}</span>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex justify-end items-end gap-2.5"
          >
            <div className="max-w-[260px] bg-[#EEF1F8] rounded-lg px-3.5 py-3 space-y-1">
              <p className="text-[#1A2B4E] text-[13px] leading-snug whitespace-pre-wrap">
                {msg.content}
              </p>
              <span className="block text-[#9CA3AF] text-[10px] text-right">{msg.time}</span>
            </div>
          </motion.div>
        )
      )}
    </div>
  );
}
