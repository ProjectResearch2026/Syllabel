import type { Grading } from "@/lib/grading";

/**
 * 成績評価の内訳（ui-design_pc.pen 06_講義詳細_成績評価 Card_内訳）。
 *
 * api-clean の `grading` は JSON 文字列なので、素で描くと画面に JSON が出る
 * (`lib/grading.ts`)。割合の分かる項目は**積み上げバー**で全体に対する重みを
 * 一目で示し、その下に項目・基準・割合を並べる。
 *
 * バーは割合が取れた項目だけで作る。合計が 100 に満たない科目があるため、
 * 幅は「取れた割合の合計」に対する比で割り付ける（合計が 0 ならバーは出さない）。
 */

/** 積み上げバーと点の色。ui-design_pc.pen chart-red-1〜4（濃い順） */
const SEGMENT_COLORS = [
  "bg-accent",
  "bg-chart-red-1",
  "bg-chart-red-3",
  "bg-chart-red-4",
] as const;

function colorAt(index: number): string {
  return SEGMENT_COLORS[index % SEGMENT_COLORS.length];
}

export default function GradingContent({
  grading,
  /** 末尾の自由記述をここに描くか。タブでは別カード（評価にあたっての注意）へ出す */
  showFreeText = true,
}: {
  grading: Grading;
  showFreeText?: boolean;
}) {
  if (grading.kind === "text") {
    return <p className="whitespace-pre-wrap text-[12.5px] leading-[21px] text-fg-secondary">{grading.text}</p>;
  }

  const rated = grading.items.filter((item) => item.ratio !== null);
  const ratioTotal = rated.reduce((sum, item) => sum + (item.ratio ?? 0), 0);

  return (
    <div className="flex flex-col gap-[18px]">
      {ratioTotal > 0 && (
        <div className="flex h-10 gap-0.5 overflow-hidden rounded-md" aria-hidden="true">
          {rated.map((item, i) => (
            <div
              key={`${item.label}-${i}`}
              className={`flex items-center justify-center ${colorAt(i)}`}
              style={{ width: `${((item.ratio ?? 0) / ratioTotal) * 100}%` }}
            >
              <span className="text-xs font-bold text-fg-inverse">{item.ratio}%</span>
            </div>
          ))}
        </div>
      )}

      <ul className="flex flex-col">
        {grading.items.map((item, i) => {
          // 点の色はバーの並びに合わせる。割合の無い項目はグレー
          const ratedIndex = rated.indexOf(item);
          return (
            <li
              key={`${item.label}-${i}`}
              className="flex items-start gap-3.5 border-b border-card-divider py-3.5 last:border-b-0"
            >
              <span
                className={`mt-1.5 size-[9px] shrink-0 rounded-full ${
                  ratedIndex >= 0 ? colorAt(ratedIndex) : "bg-fg-icon"
                }`}
                aria-hidden="true"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <p className="text-[13.5px] font-bold leading-[19px] text-fg-primary">
                  {item.label}
                </p>
                {item.criterion && (
                  <p className="text-[12.5px] leading-[21px] text-fg-secondary">{item.criterion}</p>
                )}
                {item.note && <p className="text-[11px] text-fg-muted">{item.note}</p>}
              </div>
              {item.ratio !== null && (
                <span className="w-13 shrink-0 text-right text-base font-bold text-fg-primary">
                  {item.ratio}%
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {showFreeText && grading.freeText && (
        <p className="border-t border-card-divider pt-3.5 text-[12.5px] leading-[21px] text-fg-secondary">
          {grading.freeText}
        </p>
      )}
    </div>
  );
}
