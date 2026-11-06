import type { Grading } from "@/lib/grading";

/**
 * 成績評価の内訳（ui-design_pc.pen 06_講義詳細_成績評価 Card_内訳）。
 *
 * api-clean の `grading` は JSON 文字列なので、素で描くと画面に JSON が出る
 * (`lib/grading.ts`)。割合の分かる項目は**積み上げバー**で全体に対する重みを
 * 一目で示し、その下に項目・基準・割合を並べる。
 *
 * バーは割合が 0 より大きい項目だけで作る。合計が 100 に満たない科目があるため、
 * 幅は「取れた割合の合計」に対する比で割り付ける（合計が 0 ならバーは出さない）。
 *
 * **0% の項目はバーに入れない。** XLSX 由来の科目は方法1〜5の枠を「定期試験（0%）」
 * のように 0% で埋めていることが多く（2026年度で 40 件余り）、幅 0 の区画でも
 * 「0%」の文字と区画の隙間が残り、バーの中に欠けた「0」がはみ出していた。
 * 0% の項目は「評価に使わない」ことが分かるよう一覧には残し、点をグレーにする。
 *
 * 区画の文字は狭いと収まらない（5% の区画はモバイルで 17px ほど）。区画は
 * 文字に押し広げられないよう `min-w-0` で切り、割合が小さい区画は文字を出さない
 * （数値は下の一覧にある）。
 */

/** 区画に割合の文字を出す下限（全体に対する %）。モバイルの幅で「8%」が収まる */
const MIN_LABELED_SHARE = 8;

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

  // バーに載る項目。0% の項目は幅を持たないので載せない
  const rated = grading.items.filter((item) => item.ratio !== null && item.ratio > 0);
  const ratioTotal = rated.reduce((sum, item) => sum + (item.ratio ?? 0), 0);

  return (
    <div className="flex flex-col gap-[18px]">
      {ratioTotal > 0 && (
        <div className="flex h-10 gap-0.5 overflow-hidden rounded-md" aria-hidden="true">
          {rated.map((item, i) => {
            const share = ((item.ratio ?? 0) / ratioTotal) * 100;
            return (
              <div
                key={`${item.label}-${i}`}
                className={`flex min-w-0 items-center justify-center overflow-hidden ${colorAt(i)}`}
                // 隙間を除いた幅を割合で分ける（% 幅だと隙間の分だけはみ出して縮められる）
                style={{ flex: `${item.ratio} 1 0` }}
              >
                {share >= MIN_LABELED_SHARE && (
                  <span className="text-xs font-bold text-fg-inverse">{item.ratio}%</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ul className="flex flex-col">
        {grading.items.map((item, i) => {
          // 点の色はバーの並びに合わせる。割合の無い項目・0% の項目はバーに無いのでグレー
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
