"use client";

import { motion } from "motion/react";
import type { ChatMessage } from "@/lib/chat";
import AiProposalCard from "./AiProposalCard";
import MarkdownText from "./MarkdownText";
import { useScrollToBottom } from "@/lib/useScrollToBottom";

/**
 * 会話表示（ui-design_phone.pen STEP5 MessageArea）。
 * 吹き出しの角丸は AI 側 [4,16,16,16] / ユーザー側 [16,4,16,16] で、
 * どちらの発話かが形で分かるようにしている。
 */
export default function AiMessageArea({ messages }: { messages: ChatMessage[] }) {
  const listRef = useScrollToBottom<HTMLDivElement>(messages);

  return (
    <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-2.5 pt-3.5">
      <div className="flex justify-center">
        <span className="rounded-full bg-surface-gray px-2.5 py-1 text-[10px] font-bold text-fg-muted">
          今日
        </span>
      </div>

      {messages.map((message) =>
        message.role === "assistant" ? (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex flex-col gap-3"
          >
            <div className="w-[288px] rounded-[4px_16px_16px_16px] bg-surface-gray px-3.5 py-[11px]">
              <MarkdownText className="text-[13px] leading-[1.65] text-fg-primary">
                {message.content}
              </MarkdownText>
              {message.streaming && (
                <span className="mt-1.5 flex items-center gap-1">
                  <span className="size-1.5 animate-bounce rounded-full bg-fg-primary" />
                  <span className="size-1.5 animate-bounce rounded-full bg-fg-primary [animation-delay:150ms]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-border-primary [animation-delay:300ms]" />
                </span>
              )}
            </div>
            {message.proposals && message.proposals.length > 0 && (
              <AiProposalCard courses={message.proposals} />
            )}
          </motion.div>
        ) : (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex justify-end"
          >
            <div className="max-w-[288px] rounded-[16px_4px_16px_16px] bg-academic-navy px-3.5 py-[11px]">
              <p className="whitespace-pre-wrap text-[13px] leading-[1.65] text-fg-inverse">
                {message.content}
              </p>
            </div>
          </motion.div>
        ),
      )}
    </div>
  );
}
