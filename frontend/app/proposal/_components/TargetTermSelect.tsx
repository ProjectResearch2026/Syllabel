"use client";

import { Calendar } from "lucide-react";
import { sameTerm, termLabel, useTargetTerm } from "@/lib/targetTerm";

/**
 * 履修提案の対象学期(次に登録する学期)の表示と選び直し。design.md §8.3。
 *
 * 学期は成績表の作成日と在籍年数から推定する(`lib/targetTerm.ts`)が、外れ得るので
 * **必ず見える場所に出し、学生が直せるようにする**。2つの根拠が食い違ったときは
 * 選ぶまで注意を出す。生成中は変えられない(途中で学期が変わると提案と食い違う)。
 */
export default function TargetTermSelect({
  disabled = false,
  compact = false,
}: {
  disabled?: boolean;
  compact?: boolean;
}) {
  const { estimate, target, chosen, options, select } = useTargetTerm();
  const hint =
    estimate.conflict && !chosen
      ? `成績表の作成日からは${termLabel(estimate.suggested)}、在籍年数からは${termLabel(estimate.conflict)}です。登録する学期を選んでください`
      : estimate.basis === "today" && !chosen
        ? "今日の日付から推定しています"
        : null;

  return (
    <div className={`flex flex-col ${compact ? "items-stretch" : "items-end"} gap-0.5`}>
      <label className="flex items-center gap-2">
        <Calendar size={16} className="shrink-0 text-accent" aria-hidden="true" />
        <span className="text-xs text-fg-tertiary">提案する学期</span>
        <select
          value={termLabel(target)}
          disabled={disabled}
          onChange={(e) => {
            const next = options.find((o) => termLabel(o) === e.target.value);
            if (next) select(sameTerm(next, estimate.suggested) && !estimate.conflict ? null : next);
          }}
          className="rounded border border-border-primary bg-surface-primary px-2 py-1 text-[13px] font-semibold text-fg-primary disabled:opacity-60"
        >
          {options.map((o) => (
            <option key={termLabel(o)} value={termLabel(o)}>
              {termLabel(o)}
            </option>
          ))}
        </select>
      </label>
      {hint && (
        <span className={`text-[10px] ${estimate.conflict ? "text-accent" : "text-fg-faint"}`}>{hint}</span>
      )}
    </div>
  );
}
