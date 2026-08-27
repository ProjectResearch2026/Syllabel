"use client";

import { ArrowUp, BookOpen, CalendarDays, Sparkles, Timer } from "lucide-react";
import { askBarPlaceholder, useAiStore, type AiContext } from "@/lib/ai";

const CHIP_ICON = {
  timetable: CalendarDays,
  course: BookOpen,
  slot: Timer,
  syllabus: BookOpen,
} as const;

/**
 * 画面下部・タブバーの上に常設する Ask Bar（ui-design_phone.pen STEP1〜3）。
 *
 * 文脈（科目を選択中・コマを長押し中）があるときは左に赤チップが出る。
 * 押す前に何を AI に渡すかが分かることがこのバーの役目なので、
 * チップは selection をそのまま映す。
 */
export default function AskBar({ base }: { base: AiContext }) {
  const selection = useAiStore((s) => s.selection);
  const openHalf = useAiStore((s) => s.openHalf);

  const context = selection ?? base;
  const hasChip = context.kind === "course" || context.kind === "slot";
  const ChipIcon = CHIP_ICON[context.kind];

  return (
    <div className="fixed inset-x-4 bottom-[100px] z-40 md:hidden">
      <button
        type="button"
        onClick={() => openHalf(context)}
        className={`w-full h-12 flex items-center gap-[9px] rounded-full bg-surface-primary pl-[14px] pr-2 shadow-askbar text-left transition-colors active:bg-surface-gray ${
          hasChip ? "border-[1.5px] border-accent" : "border border-border-primary"
        }`}
      >
        {hasChip ? (
          <span className="flex shrink-0 items-center gap-[5px] rounded-full bg-accent-light px-[9px] py-[5px]">
            <ChipIcon size={12} className="text-accent" />
            <span className="text-[11px] font-bold text-accent">{context.label}</span>
          </span>
        ) : (
          <Sparkles size={18} className="shrink-0 text-accent" />
        )}
        <span className="flex-1 truncate text-[13px] text-fg-muted">
          {askBarPlaceholder(context)}
        </span>
        <span className="grid size-[34px] shrink-0 place-items-center rounded-full bg-accent">
          <ArrowUp size={16} className="text-fg-inverse" />
        </span>
      </button>
    </div>
  );
}
