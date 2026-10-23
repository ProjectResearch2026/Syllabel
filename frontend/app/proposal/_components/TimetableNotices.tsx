"use client";

import { Info } from "lucide-react";
import { useProposalStore } from "@/lib/proposal";

/**
 * 時間割の上に出す、確かめること（design.md §8.3.7。必修どうしの重なり・集中講義の日程など）。
 *
 * **満たせなかった条件は出さない。** アシスタントが説明で必ず書く（§7.3.1 規則4）ので、
 * 表の上にも出すと同じことが二度並ぶ。
 *
 * 値は backend のレポート（`report`。§6.1）のまま出し、画面で判定しない。組み立ての
 * 途中・時間割が無いあいだは出さない。学生が手で直した後は `/api/timetable/check` で
 * 引き直したものになる。
 */
export default function TimetableNotices({ className = "" }: { className?: string }) {
  const status = useProposalStore((s) => s.status);
  const report = useProposalStore((s) => s.report);
  if (status !== "done" || !report) return null;

  const confirm = report.needsConfirmation;
  if (confirm.length === 0) return null;

  return (
    <ul className={`flex flex-col gap-1 text-[11px] leading-4 ${className}`}>
      {confirm.map((text) => (
        <li key={`c-${text}`} className="flex items-start gap-1.5 text-fg-secondary">
          <Info size={13} className="mt-px shrink-0" aria-hidden="true" />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}

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
