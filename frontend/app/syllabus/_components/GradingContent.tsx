import type { Grading } from "@/lib/grading";

/**
 * 成績評価の中身。`SectionCard` の内側に置く。
 *
 * api-clean の `grading` は JSON 文字列なので、素で描くと画面に JSON が出る
 * (`lib/grading.ts`)。項目・割合・基準に分けて並べ、割合はバーでも示す。
 */
export default function GradingContent({ grading }: { grading: Grading }) {
  if (grading.kind === "text") return <>{grading.text}</>;

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2.5">
        {grading.items.map((item, i) => (
          <li key={`${item.label}-${i}`} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-semibold text-[#1A2B4E]">{item.label}</span>
              {item.ratio !== null && (
                <span className="shrink-0 font-mono text-xs font-bold text-[#1A2B4E]">
                  {item.ratio}%
                </span>
              )}
            </div>
            {item.ratio !== null && (
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-[#F3F4F6]"
                aria-hidden="true"
              >
                <div
                  className="h-full rounded-full bg-[#E60012]"
                  style={{ width: `${Math.min(100, Math.max(0, item.ratio))}%` }}
                />
              </div>
            )}
            {item.criterion && <p className="text-[12.5px] leading-relaxed">{item.criterion}</p>}
            {item.note && <p className="text-[11px] text-[#9CA3AF]">{item.note}</p>}
          </li>
        ))}
      </ul>
      {grading.freeText && (
        <p className="border-t border-[#F3F4F6] pt-3 text-[12.5px] leading-relaxed">
          {grading.freeText}
        </p>
      )}
    </div>
  );
}
