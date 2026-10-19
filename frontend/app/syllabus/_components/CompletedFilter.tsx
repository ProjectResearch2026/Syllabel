"use client";

import { EyeOff } from "lucide-react";
import { COMPLETED_UI } from "@/lib/syllabusUI";
import { useFilterControls } from "@/lib/useFilterControls";

/**
 * 【試作】修得済みの科目を一覧から除く操作。件数の行の右に置く(PC・モバイル共用)。
 *
 * - A(`switch`): 「修得済みを除く」スイッチ。既定は OFF
 * - B(`notice`): 既定で除き、除いた件数と「表示する」を出す。表示中は「除く」に替える
 *
 * `修得済み` のチップを選んでいるあいだは出さない(除くと必ず0件になる)。
 */
export default function CompletedFilter({
  completedCount,
  compact = false,
}: {
  /** 除いた(または一覧に含まれている)修得済みの件数 */
  completedCount: number;
  compact?: boolean;
}) {
  const { activeTag, hideCompleted, selectHideCompleted } = useFilterControls();
  if (activeTag === "修得済み") return null;

  const text = compact ? "text-[11px]" : "text-xs";

  if (COMPLETED_UI === "switch") {
    return (
      <label className={`flex shrink-0 cursor-pointer items-center gap-2 ${text} text-fg-secondary`}>
        修得済みを除く
        <button
          type="button"
          role="switch"
          aria-checked={hideCompleted}
          onClick={() => selectHideCompleted(!hideCompleted)}
          className={`relative h-5 w-9 rounded-full transition-colors ${
            hideCompleted ? "bg-fg-primary" : "bg-border-primary"
          }`}
        >
          <span
            className={`absolute top-0.5 size-4 rounded-full bg-surface-primary shadow transition-all ${
              hideCompleted ? "left-[18px]" : "left-0.5"
            }`}
          />
        </button>
      </label>
    );
  }

  // B: 除いた事実を件数で示す。0件なら何も言わない
  if (completedCount === 0) return null;
  return (
    <span className={`flex shrink-0 items-center gap-1.5 ${text} text-fg-secondary`}>
      {hideCompleted && <EyeOff size={compact ? 12 : 14} aria-hidden="true" className="shrink-0" />}
      {hideCompleted
        ? `修得済みの${completedCount}件を除いています`
        : `修得済みの${completedCount}件を含めています`}
      <button
        type="button"
        onClick={() => selectHideCompleted(!hideCompleted)}
        className="font-semibold text-accent underline-offset-2 hover:underline"
      >
        {hideCompleted ? "表示する" : "除く"}
      </button>
    </span>
  );
}
