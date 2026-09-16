"use client";

import { useSearchParams } from "next/navigation";
import { useSyllabusUIStore } from "@/lib/syllabusUI";
import { useTagMap } from "@/lib/useTagMap";
import type { SyllabusListItem } from "@/lib/syllabus-api";
import { detailHref } from "@/lib/syllabusQuery";
import CourseCard from "./CourseCard";

export default function SyllabusTagList({
  results,
  /** `syllabus_code` → 担当教員名。一覧APIに教員が無いためサーバ側で補っている(§6.2) */
  instructors,
}: {
  results: SyllabusListItem[];
  instructors: Record<string, string>;
}) {
  // 詳細へ移っても絞り込みを失わないよう、いまのクエリをリンクに畳む
  const searchParams = useSearchParams();
  const activeTag = useSyllabusUIStore((s) => s.activeTag);
  const tagMap = useTagMap();

  const filtered = results.filter((c) => {
    if (activeTag === "すべて") return true;
    const tag = tagMap.get(c.syllabus_code);
    if (activeTag === "必修") return tag === "必修";
    if (activeTag === "選択") return tag === "選択";
    if (activeTag === "既修得済み") return tag === "既修得済み";
    return true;
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
      {filtered.map((c) => (
        <CourseCard
          key={`${c.syllabus_code}-${c.year}`}
          course={c}
          tag={tagMap.get(c.syllabus_code) ?? null}
          instructors={instructors[c.syllabus_code] ?? null}
          href={detailHref(c.syllabus_code, searchParams.toString())}
        />
      ))}
    </div>
  );
}
