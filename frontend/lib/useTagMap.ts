"use client";

import { useEffect, useMemo, useState } from "react";
import { useStudentStore } from "@/lib/student";
import { buildTagMap, type TagType } from "@/lib/syllabusUI";
import { getAdmissionYear, programCodeOf } from "@/lib/programs";
import { fetchCurricula, type CurriculaData } from "@/lib/syllabus-api";

/**
 * `syllabus_code` → タグ(必修 / 選択 / 既修得済み)の対応を作る。design.md §6.1。
 *
 * 学生プロファイルと履修要項の突合であり、**一覧(PC・モバイル)と講義詳細で
 * 同じ結果でなければならない**ため、取得と突合をここに1つだけ置く。
 * プロファイルが無い・履修要項が引けない場合は空の Map を返し、
 * 呼び出し側はタグ無しで描く。
 */
export function useTagMap(): Map<string, TagType> {
  const profile = useStudentStore((s) => s.profile);

  // 履修要項を引くキーは (課程コード, 入学年度)。プロファイルの `program` は
  // 課程名なのでコードに解決する(design.md §4.4.2)
  const programCode = programCodeOf(profile?.program);
  const admissionYear = profile?.grade ? getAdmissionYear(profile.grade) : null;
  const key = programCode && admissionYear ? `${programCode}/${admissionYear}` : null;

  // 取得したキーごと持つ。プロファイルが変わった直後に前の課程の要項で
  // タグを付けないため、キーが一致するときだけ使う
  const [loaded, setLoaded] = useState<{ key: string; data: CurriculaData } | null>(null);

  useEffect(() => {
    if (!key || !programCode || !admissionYear) return;
    let cancelled = false;
    fetchCurricula(programCode, admissionYear)
      .then((data) => {
        if (!cancelled) setLoaded({ key, data });
      })
      .catch(() => {
        // 履修要項が引けなくてもタグなしで動作を続ける
      });
    return () => {
      cancelled = true;
    };
  }, [key, programCode, admissionYear]);

  const curricula = loaded && loaded.key === key ? loaded.data : null;

  return useMemo(() => {
    if (!curricula) return new Map<string, TagType>();
    const completed = profile?.completedCourses ?? [];
    const passedCodes = new Set(
      completed.filter((c) => c.status === "passed" && c.code).map((c) => c.code as string),
    );
    const passedTitles = new Set(
      completed.filter((c) => c.status === "passed").map((c) => c.title),
    );
    return buildTagMap(curricula, passedCodes, passedTitles);
  }, [curricula, profile]);
}
