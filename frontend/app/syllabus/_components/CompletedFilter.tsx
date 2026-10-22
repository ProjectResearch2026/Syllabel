"use client";

import { useFilterControls } from "@/lib/useFilterControls";
import { useStudentStore } from "@/lib/student";

/**
 * 「修得済みを除く」スイッチ(PC・モバイル共用)。design.md §8.2.2。件数の行に置く。
 *
 * **既定は ON(除く)。** 学生が一覧で探すのはこれから履修する科目であり、修得済みの
 * 科目だけを見たいときはマイデータで見られる。OFF にすると修得済みの科目が
 * `修得済み` のタグ付きで一覧に混ざる。
 *
 * **プロファイルが無いあいだは出さない。** 修得済みは成績表との突合で決まるため、
 * 取り込む前は何も除かれない(取り込みの案内は `SyllabusProfileNotice`)。
 */
export default function CompletedFilter({ compact = false }: { compact?: boolean }) {
  const profile = useStudentStore((s) => s.profile);
  const { hideCompleted, selectHideCompleted } = useFilterControls();
  if (!profile) return null;

  return (
    <label
      className={`flex shrink-0 cursor-pointer items-center gap-2 ${
        compact ? "text-[11px]" : "text-xs"
      } text-fg-secondary`}
    >
      修得済みを除く
      <button
        type="button"
        role="switch"
        aria-checked={hideCompleted}
        onClick={() => selectHideCompleted(!hideCompleted)}
        className={`relative h-5 w-9 rounded-full transition-colors ${
          hideCompleted ? "bg-accent" : "bg-border-primary"
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
