"use client";

import { useSearchParams } from "next/navigation";
import { ArrowUpDown } from "lucide-react";
import type { MatchedBy, SyllabusListItem } from "@/lib/syllabus-api";
import { detailHref } from "@/lib/syllabusQuery";
import { useTaggedResults } from "@/lib/useTaggedResults";
import CourseCard from "./CourseCard";
import SyllabusPagination from "./SyllabusPagination";

/**
 * 検索結果(PC)。件数・ページ送り・カードを1つのクライアントコンポーネントに置く。
 * design.md §8。
 *
 * **件数とページ送りをサーバ側描画から持ってこられない。** タグでの絞り込みは
 * クライアントで行う必要があり(学生プロファイルがブラウザにしか無く、絞り込んだ
 * 結果もサーバへ送れない。要件§5 / §6.1.3)、**表示件数とページ数は絞り込み後の
 * 並びで決まる**。以前は見出しの件数を `page.tsx` が描いていたため、
 * 「1,219件」と出しながら16件しか並ばない、という食い違いが起きていた。
 */
export default function SyllabusResults({
  results,
  targets,
  faculty,
  matchedBy,
  keyword,
  offset,
  limit,
}: {
  /** 条件に当たる**全件**。ページ送りはこの中から切り出す */
  results: SyllabusListItem[];
  /** `syllabus_code` → 対象課程(§6.1.3) */
  targets: Record<string, string[]>;
  faculty: string;
  matchedBy: MatchedBy | null;
  keyword: string | undefined;
  offset: number;
  limit: number;
}) {
  // 詳細へ移っても絞り込みを失わないよう、いまのクエリをリンクに畳む
  const searchParams = useSearchParams();
  const { visible, matched, total, filtering } = useTaggedResults(
    results,
    targets,
    faculty,
    offset,
    limit,
  );

  const pagination = (
    <SyllabusPagination
      limit={limit}
      offset={offset}
      total={matched}
    />
  );

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-4">
        <h1 className="text-sm font-bold text-[#1A2B4E]">
          検索結果 {matched.toLocaleString()}件
          {/* 絞っているときは、絞る前の母数も示す */}
          {filtering && (
            <span className="ml-2 text-xs font-normal text-[#4B5563]">
              （{total.toLocaleString()}件中）
            </span>
          )}
          {visible.length > 0 && (
            <span className="ml-2 text-xs font-normal text-[#4B5563]">
              {offset + 1}〜{offset + visible.length}件目を表示
            </span>
          )}
          {matchedBy === "instructor" && (
            <span className="ml-2 text-xs font-normal text-[#4B5563]">
              「{keyword}」を教員名として検索しました
            </span>
          )}
        </h1>
        <div className="flex shrink-0 items-center gap-1.5 text-xs text-[#4B5563]">
          <ArrowUpDown size={14} />
          <span>配当年次順</span>
        </div>
      </div>

      {/* ページ送りは結果の上にも置く。下まで送らないと移動できないのは手間 */}
      <div className="mb-4">{pagination}</div>

      {visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-[#6B7280]">
          {filtering
            ? "絞り込みに該当する科目がありません"
            : "該当する科目がありません"}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {visible.map(({ course, tags, instructors }) => (
            <CourseCard
              key={`${course.syllabus_code}-${course.year}`}
              course={course}
              tags={tags}
              instructors={instructors}
              href={detailHref(course.syllabus_code, searchParams.toString())}
            />
          ))}
        </div>
      )}

      {pagination}
    </>
  );
}
