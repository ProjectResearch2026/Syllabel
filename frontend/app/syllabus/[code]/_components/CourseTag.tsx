"use client";

import { useTagMap } from "@/lib/useTagMap";
import type { CourseTarget } from "@/lib/eligibility";

/**
 * この科目が自分にとって必修か選択か既修得かを講義詳細でも示す。
 *
 * 一覧のカードには出ているのに詳細に無く、開いた瞬間に分からなくなっていた。
 * プロファイル未入力なら何も出さない(要件§5: 学生データはブラウザにのみ持つ)。
 *
 * **対象課程を受け取って渡す。** 履修できないクラスにタグを出さないための判定に
 * 要る(§6.1)。詳細ページはシラバス本体を持っているので追加の取得は要らない。
 */
const TAG_STYLES: Record<string, string> = {
  必修: "border-[#FECDD3] bg-[#FFF1F2] text-[#BE123C]",
  選択: "border-[#BAE6FD] bg-[#F0F9FF] text-[#0369A1]",
  既修得済み: "border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]",
};

export default function CourseTag({
  code,
  target,
}: {
  code: string;
  target: CourseTarget;
}) {
  const tag = useTagMap()(code, target);
  if (!tag) return null;
  return (
    <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${TAG_STYLES[tag]}`}>
      あなたの課程では「{tag}」
    </span>
  );
}
