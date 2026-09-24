import { BookOpen, Calendar, Search, Timer } from "lucide-react";
import type { AiContext } from "@/lib/ai";

const CHIP_ICON = {
  timetable: Calendar,
  course: BookOpen,
  slot: Timer,
  syllabus: Search,
} as const;

/**
 * 参照中の文脈を示す赤いチップ（ui-design_phone.pen ContextChip / CtxChip）。
 * ボトムドックの Ask Bar とシートで、AI に何を渡すかを押す前から見せる。
 */
export default function ContextChip({
  context,
  rounded = "full",
  size = "md",
}: {
  context: AiContext;
  /** ハーフシートは角丸 8px、全画面と Ask Bar は pill */
  rounded?: "full" | "md";
  /** Ask Bar の中は一回り小さい */
  size?: "sm" | "md";
}) {
  const Icon = CHIP_ICON[context.kind];
  return (
    <span
      className={`flex min-w-0 shrink items-center gap-[5px] bg-accent-light ${
        rounded === "full" ? "rounded-full" : "rounded-lg"
      } ${size === "sm" ? "px-[9px] py-[5px]" : "px-2.5 py-[5px]"}`}
    >
      <Icon size={size === "sm" ? 12 : 13} className="shrink-0 text-accent" aria-hidden="true" />
      <span className="truncate text-[11px] font-bold text-accent">{context.label}</span>
    </span>
  );
}
