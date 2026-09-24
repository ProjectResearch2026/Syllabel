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
      {/* モバイルは 回 44px / 内容 / 方法 70px の3列(ui-design_phone.pen TabBody_授業計画) */}
      <div className="flex gap-2 border-b border-card-divider bg-surface-gray px-2 py-1.5 text-[11px] font-bold text-fg-primary md:gap-4 md:bg-[#FAFBFC] md:px-6 md:py-2.5 md:tracking-[0.4px] md:text-fg-muted">
        <span className="w-11 shrink-0 md:w-16">回</span>
        <span className={hasMethod ? "min-w-0 flex-1 md:w-[380px] md:flex-none md:shrink-0" : "flex-1"}>授業内容</span>
        {hasMethod && <span className="w-[70px] shrink-0 md:w-auto md:flex-1">授業方法</span>}
      </div>

      <ol>
        {plan.map((entry, i) => (
          <li
            key={entry.session_number}
            className={`flex gap-2 border-b border-[#E5E7EB] px-2 py-1.5 last:border-b-0 md:gap-4 md:border-card-divider md:px-6 md:py-3 ${
              i % 2 === 1 ? "bg-[#FCFCFD]" : ""
            }`}
          >
            <span className="w-11 shrink-0 text-[11px] font-semibold text-fg-secondary md:w-16 md:text-[11.5px] md:font-bold md:text-fg-muted">
              第{entry.session_number}回
            </span>
            <span
              className={`min-w-0 text-xs leading-[18px] text-[#333333] md:text-[13.5px] md:font-medium md:leading-5 md:text-fg-primary ${
                hasMethod ? "flex-1 md:w-[380px] md:flex-none md:shrink-0" : "flex-1"
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
              <span className="w-[70px] shrink-0 text-[11px] leading-[17px] text-fg-secondary md:w-auto md:min-w-0 md:flex-1 md:shrink md:text-[12.5px] md:leading-[19px]">
                {entry.method}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
