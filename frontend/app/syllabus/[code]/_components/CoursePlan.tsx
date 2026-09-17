import type { CoursePlan as CoursePlanEntry } from "@/lib/syllabus-api";

/**
 * 授業計画（ui-design_pc.pen 06_講義詳細_授業計画）。
 *
 * 回 / 授業内容 / 事前・事後学習 の3列。行は1行おきに地色を変える。
 *
 * **オムニバス科目では担当者も出す。** 担当が1人しかいない科目で毎回同じ名前を
 * 並べても邪魔になるだけなので、回ごとに担当が変わる科目に限って添える。
 *
 * api-clean の授業計画は「事前・事後学習」を独立した欄として持たない
 * (`content` / `instructor_name` / `method` の3つ。§6.2)。列は設計どおり3つ置き、
 * 3列目には `method`（授業方法）を入れる。**無い欄をでっち上げない。**
 */
export default function CoursePlan({ plan }: { plan: CoursePlanEntry[] }) {
  const instructors = new Set(
    plan.map((entry) => entry.instructor_name?.trim()).filter(Boolean),
  );
  const showInstructor = instructors.size > 1;
  const hasMethod = plan.some((entry) => entry.method?.trim());

  return (
    <div className="flex flex-col">
      <div className="flex gap-4 border-b border-card-divider bg-[#FAFBFC] px-6 py-2.5 text-[11px] font-bold tracking-[0.4px] text-fg-muted">
        <span className="w-16 shrink-0">回</span>
        <span className={hasMethod ? "w-[380px] shrink-0" : "flex-1"}>授業内容</span>
        {hasMethod && <span className="flex-1">授業方法</span>}
      </div>

      <ol>
        {plan.map((entry, i) => (
          <li
            key={entry.session_number}
            className={`flex gap-4 border-b border-card-divider px-6 py-3 last:border-b-0 ${
              i % 2 === 1 ? "bg-[#FCFCFD]" : ""
            }`}
          >
            <span className="w-16 shrink-0 text-[11.5px] font-bold text-fg-muted">
              第{entry.session_number}回
            </span>
            <span
              className={`min-w-0 text-[13.5px] font-medium leading-5 text-fg-primary ${
                hasMethod ? "w-[380px] shrink-0" : "flex-1"
              }`}
            >
              {entry.content}
              {showInstructor && entry.instructor_name && (
                <span className="ml-2 text-[11.5px] font-normal text-fg-muted">
                  {entry.instructor_name}
                </span>
              )}
            </span>
            {hasMethod && (
              <span className="min-w-0 flex-1 text-[12.5px] leading-[19px] text-fg-secondary">
                {entry.method}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
