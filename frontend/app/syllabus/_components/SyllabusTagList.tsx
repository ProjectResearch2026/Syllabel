"use client";

import { useEffect, useState } from "react";
import { useStudentStore } from "@/lib/student";
import { useSyllabusUIStore, buildTagMap, type TagType } from "@/lib/syllabusUI";
import { getAdmissionYear, programCodeOf } from "@/lib/programs";
import { fetchCurricula, type SyllabusListItem, type CurriculaData } from "@/lib/syllabus-api";
import CourseCard from "./CourseCard";

export default function SyllabusTagList({ results }: { results: SyllabusListItem[] }) {
  const profile = useStudentStore((s) => s.profile);
  const activeTag = useSyllabusUIStore((s) => s.activeTag);
  const [curricula, setCurricula] = useState<CurriculaData | null>(null);

  useEffect(() => {
    // 履修要項を引くキーは (課程コード, 入学年度)。プロファイルの `program` は
    // 課程名なのでコードに解決する（design.md §4.4.2）
    const programCode = programCodeOf(profile?.program);
    if (!programCode || !profile?.grade) return;
    fetchCurricula(programCode, getAdmissionYear(profile.grade))
      .then(setCurricula)
      .catch(() => {
        // curricula 未取得でもタグなしで動作継続
      });
  }, [profile]);

  const passedCodes = new Set(
    (profile?.completedCourses ?? [])
      .filter((c) => c.status === "passed" && c.code)
      .map((c) => c.code as string),
  );
  const passedTitles = new Set(
    (profile?.completedCourses ?? [])
      .filter((c) => c.status === "passed")
      .map((c) => c.title),
  );

  const tagMap = curricula
    ? buildTagMap(curricula, passedCodes, passedTitles)
    : new Map<string, TagType>();

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
        />
      ))}
    </div>
  );
}
