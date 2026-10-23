"use client";

import { useProposalStore } from "@/lib/proposal";

/** 組み立ての途中に表の上に出す一言（「専門応用科目(選択)を埋める: …」） */
export function BuildStepLabel({ className = "" }: { className?: string }) {
  const status = useProposalStore((s) => s.status);
  const label = useProposalStore((s) => s.stepLabel);
  if (status !== "loading" || !label) return null;
  return (
    <span
      role="status"
      className={`flex max-w-[90%] items-center gap-2 rounded-full border border-border-primary bg-surface-primary px-3.5 py-2 shadow-askbar ${className}`}
    >
      <span className="flex shrink-0 gap-[3px]" aria-hidden="true">
        <span className="size-1.5 animate-bounce rounded-full bg-accent" />
        <span className="size-1.5 animate-bounce rounded-full bg-accent [animation-delay:150ms]" />
        <span className="size-1.5 animate-bounce rounded-full bg-accent/40 [animation-delay:300ms]" />
      </span>
      <span key={label} className="truncate text-[11px] text-fg-secondary motion-safe:animate-fade-in">
        {label}
      </span>
    </span>
  );
}
