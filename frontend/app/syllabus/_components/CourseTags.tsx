import type { CourseTags } from "@/lib/syllabusUI";
import { hasTags } from "@/lib/syllabusUI";

/**
 * タグ(状態 / 区分 / 履修区分)のバッジ。design.md §8。
 *
 * **一覧(PC・モバイル)と講義詳細で同じ見た目にするため、1つだけ置く。**
 * 以前は3か所に配色表が写されており、値を増やすたびに3か所を直す必要があった。
 *
 * **色は履修区分にだけ使う。** 区分(教養教育 / 専門基礎 / 専門応用 / 専門関連)は
 * 「どの卒業要件枠に属するか」を示す分類で、緊急度の軸ではない。色を割ると
 * 履修区分と競合して、どちらを先に読むべきか分からなくなる。区分は共通の
 * 落ち着いた配色に統一し、色の差は「必修か選択か」にだけ使う。
 *
 * 並びは **状態 → 区分 → 履修区分** に固定する。「もう取ったか」→「どの枠か」→
 * 「取る必要があるか」の順で、学生が判断を打ち切れる順序になっている。
 */

/** 履修区分ごとの配色。卒業要件に算入されない `随意` だけ彩度を落とす。 */
const REQUIREMENT_STYLES: Record<string, string> = {
  必修: "border-[#FECDD3] bg-[#FFF1F2] text-[#BE123C]",
  選択必修: "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
  選択: "border-[#BAE6FD] bg-[#F0F9FF] text-[#0369A1]",
  随意: "border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280]",
};

/** 修得済みを示す配色。 */
const COMPLETED_STYLE = "border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]";

/** 区分は4値とも同じ配色にする(上のコメントの理由)。 */
const CATEGORY_STYLE = "border-[#DDE3EE] bg-[#F4F6FA] text-[#3F4E6B]";

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
      {tags.requirement && (
        <span className={`${base} ${REQUIREMENT_STYLES[tags.requirement]}`}>
          {tags.requirement}
        </span>
      )}
    </>
  );
}
