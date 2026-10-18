import type { CourseTags } from "@/lib/syllabusUI";
import { hasTags } from "@/lib/syllabusUI";

/**
 * タグ(状態 / 区分 / 分野 / 履修区分)のバッジ。design.md §8.2.1。
 *
 * **一覧(PC・モバイル)と講義詳細で同じ見た目にするため、1つだけ置く。**
 *
 * **色は履修区分にだけ使う。** 区分(教養教育 / 専門基礎 / 専門応用 / 専門関連)と
 * 分野は「どの卒業要件枠に属するか」を示す分類で、緊急度の軸ではない。色を割ると
 * 履修区分と競合して、どちらを先に読むべきか分からなくなる。区分と分野は共通の
 * 落ち着いた配色に統一し、色の差は「必修か選択か」にだけ使う。
 *
 * 並びは **状態 → 区分 → 分野 → 履修区分** に固定する。「もう取ったか」→
 * 「どの枠か」→「取る必要があるか」の順で、学生が判断を打ち切れる順序になっている。
 * 分野は区分の内訳なので区分の直後に置く。
 */

/** 履修区分ごとの配色。卒業要件に算入されない `随意` だけ彩度を落とす。 */
const REQUIREMENT_STYLES: Record<string, string> = {
  必修:     "border-tag-required-border   bg-tag-required-bg   text-tag-required-fg",
  選択必修: "border-tag-selective-border  bg-tag-selective-bg  text-tag-selective-fg",
  選択:     "border-tag-elective-border   bg-tag-elective-bg   text-tag-elective-fg",
  随意:     "border-tag-optional-border   bg-tag-optional-bg   text-tag-optional-fg",
};

/** 修得済みを示す配色。 */
const COMPLETED_STYLE = "border-tag-done-border bg-tag-done-bg text-tag-done-fg";

/** 区分と分野はすべて同じ配色にする(上のコメントの理由)。 */
const CATEGORY_STYLE = "border-tag-category-border bg-tag-category-bg text-tag-category-fg";

export default function CourseTags({
  tags,
  size = "card",
}: {
  tags: CourseTags;
  /** `card` は一覧のカード、`detail` は講義詳細の見出し */
  size?: "card" | "detail";
}) {
  if (!hasTags(tags)) return null;

  const base =
    size === "card"
      ? "rounded-md border px-2 py-0.5 text-[10px] font-semibold"
      : "rounded-md border px-2 py-0.5 text-[11px] font-bold";

  return (
    <>
      {tags.completed && <span className={`${base} ${COMPLETED_STYLE}`}>修得済み</span>}
      {tags.category && <span className={`${base} ${CATEGORY_STYLE}`}>{tags.category}</span>}
      {tags.subcategory && (
        <span className={`${base} ${CATEGORY_STYLE}`}>{tags.subcategory}</span>
      )}
      {tags.requirement && (
        <span className={`${base} ${REQUIREMENT_STYLES[tags.requirement]}`}>
          {tags.requirement}
        </span>
      )}
    </>
  );
}
