"use client";

import { useSearchParams } from "next/navigation";
import { useSyllabusUIStore } from "@/lib/syllabusUI";
import { useTagMap } from "@/lib/useTagMap";
import type { SyllabusListItem, CardMeta } from "@/lib/syllabus-api";
import { detailHref } from "@/lib/syllabusQuery";
import CourseCard from "./CourseCard";

export default function SyllabusTagList({
  results,
  /**
   * `syllabus_code` → 担当教員名と対象課程。一覧APIがどちらも返さないため
   * サーバ側で詳細から補っている(§6.1 / §6.2)
   */
  cardMeta,
}: {
  results: SyllabusListItem[];
  cardMeta: Record<string, CardMeta>;
}) {
  // 詳細へ移っても絞り込みを失わないよう、いまのクエリをリンクに畳む
  const searchParams = useSearchParams();
  const activeTag = useSyllabusUIStore((s) => s.activeTag);
  const tagOf = useTagMap();

  // タグは履修要項と対象課程の両方から決まる。絞り込みも描画も同じ値を使う
  const tagged = results.map((c) => ({
    course: c,
    tag: tagOf(c.syllabus_code, cardMeta[c.syllabus_code]),
  }));

  const filtered = tagged.filter(({ tag }) => {
    if (activeTag === "すべて") return true;
    return tag === activeTag;
  });

  if (filtered.length === 0) {
    return (
      <p className="text-sm text-[#6B7280] text-center py-16 col-span-2">
        該当する科目がありません
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {filtered.map(({ course, tag }) => (
        <CourseCard
          key={`${course.syllabus_code}-${course.year}`}
          course={course}
          tag={tag}
          instructors={cardMeta[course.syllabus_code]?.instructors ?? null}
          href={detailHref(course.syllabus_code, searchParams.toString())}
        />
      ))}
    </div>
  );
}
