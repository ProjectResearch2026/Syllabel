import type { CoursePlan as CoursePlanEntry } from "@/lib/syllabus-api";

/**
 * 授業計画。回数・内容に加え、**オムニバス科目では担当者も出す。**
 *
 * 担当が1人しかいない科目で毎回同じ名前を並べても邪魔になるだけなので、
 * 回ごとに担当が変わる科目に限って添える。
 */
export default function CoursePlan({ plan }: { plan: CoursePlanEntry[] }) {
  const instructors = new Set(
    plan.map((entry) => entry.instructor_name?.trim()).filter(Boolean),
  );
  const showInstructor = instructors.size > 1;

  return (
    <ol className="flex flex-col divide-y divide-border-subtle">
      {plan.map((entry) => (
        <li key={entry.session_number} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
          <span className="mt-[1px] flex size-5 shrink-0 items-center justify-center rounded bg-surface-gray font-mono text-[11px] font-bold text-fg-muted">
            {entry.session_number}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] leading-relaxed text-fg-secondary">{entry.content}</p>
            {(showInstructor || entry.method) && (
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-fg-muted">
                {showInstructor && entry.instructor_name && <span>{entry.instructor_name}</span>}
                {entry.method && <span>{entry.method}</span>}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
