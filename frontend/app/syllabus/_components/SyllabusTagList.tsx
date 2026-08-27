"use client";

import { useEffect, useState } from "react";
import { useStudentStore } from "@/lib/student";
import { useSyllabusUIStore } from "@/lib/syllabusUI";
import { fetchCurricula, type SyllabusListItem, type CurriculaData } from "@/lib/syllabus-api";
import CourseCard from "./CourseCard";

export type TagType = "必修" | "選択" | "既修得済み" | null;

function getAdmissionYear(grade: number): number {
  const now = new Date();
  const month = now.getMonth() + 1;
  const academicYear = month >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return academicYear - grade + 1;
}

function buildTagMap(
  curricula: CurriculaData,
  passedCodes: Set<string>,
  passedTitles: Set<string>,
): Map<string, TagType> {
  const map = new Map<string, TagType>();
  for (const course of curricula.courses) {
    if (!course.syllabus_code) continue;
    if (passedCodes.has(course.syllabus_code) || passedTitles.has(course.title)) {
      map.set(course.syllabus_code, "既修得済み");
    } else if (course.type === "必修") {
      map.set(course.syllabus_code, "必修");
    } else if (course.type === "選択必修" || course.type === "選択") {
      map.set(course.syllabus_code, "選択");
    }
  }
  return map;
}

export default function SyllabusTagList({ results }: { results: SyllabusListItem[] }) {
  const profile = useStudentStore((s) => s.profile);
  const activeTag = useSyllabusUIStore((s) => s.activeTag);
  const [curricula, setCurricula] = useState<CurriculaData | null>(null);

  useEffect(() => {
    if (!profile?.program || !profile?.grade) return;
    const admissionYear = getAdmissionYear(profile.grade);
    fetchCurricula(profile.program, admissionYear)
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
