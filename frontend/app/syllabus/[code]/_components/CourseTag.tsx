"use client";

import { useTagMap } from "@/lib/useTagMap";
import { hasTags } from "@/lib/syllabusUI";
import type { CourseTarget } from "@/lib/eligibility";
import CourseTags from "../../_components/CourseTags";

/**
 * この科目が自分にとってどの区分でどの履修区分かを講義詳細でも示す。design.md §8。
 *
 * 一覧のカードには出ているのに詳細に無く、開いた瞬間に分からなくなっていた。
 * プロファイル未入力なら何も出さない(要件§5: 学生データはブラウザにのみ持つ)。
 *
 * **対象課程を受け取って渡す。** 履修できないクラスにタグを出さないための判定に
 * 要る(§6.1.3)。詳細ページはシラバス本体を持っているので追加の取得は要らない。
 */
export default function CourseTag({
  code,
  target,
}: {
  code: string;
  target: CourseTarget;
}) {
  const tags = useTagMap()(code, target);
  if (!hasTags(tags)) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-semibold text-fg-muted">あなたの課程では</span>
      <CourseTags tags={tags} size="detail" />
    </span>
  );
}
