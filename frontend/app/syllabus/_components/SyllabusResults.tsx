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
 * design.md §8 / ui-design_pc.pen 05_シラバス一覧 MainArea。
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
  /** `syllabus_code` → 対象課程。引けなかったときは null(§6.1.3) */
  targets: Record<string, string[]> | null;
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

  return (
    <>
      {/* ui-design_pc.pen ResultHeader。件数・内訳・並び順を1行に収める */}
      <div className="flex shrink-0 items-center justify-between gap-4">
        <h1 className="text-sm font-bold text-fg-primary">
          検索結果 {matched.toLocaleString()}件
          {/* 絞っているときは、絞る前の母数も示す */}
          {filtering && (
            <span className="ml-2 text-xs font-normal text-fg-secondary">
              （{total.toLocaleString()}件中）
            </span>
          )}
          {visible.length > 0 && (
            <span className="ml-2 text-xs font-normal text-fg-secondary">
              {offset + 1}〜{offset + visible.length}件目を表示
            </span>
          )}
          {matchedBy === "instructor" && (
            <span className="ml-2 text-xs font-normal text-fg-secondary">
              「{keyword}」を教員名として検索しました
            </span>
          )}
        </h1>
        <div className="flex shrink-0 items-center gap-1.5 text-xs text-fg-secondary">
          <ArrowUpDown size={14} aria-hidden="true" />
          <span>配当年次順</span>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-fg-tertiary">
          {filtering ? "絞り込みに該当する科目がありません" : "該当する科目がありません"}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
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

      {/* ページ送りは結果の下に一度だけ。上下に出すと1画面に2つ並んで見える */}
      <SyllabusPagination limit={limit} offset={offset} total={matched} />
    </>
  );
}
