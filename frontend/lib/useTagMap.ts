"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useStudentStore } from "@/lib/student";
import { buildTagMap, resolveTags, NO_TAGS, type CourseTags } from "@/lib/syllabusUI";
import { getAdmissionYear, programCodeOf } from "@/lib/programs";
import { fetchCurricula, type CurriculaData } from "@/lib/syllabus-api";
import type { CourseTarget } from "@/lib/eligibility";
import { normalizeTitle } from "@/lib/courseTitle";

/** `syllabus_code` と対象課程から、その学生にとってのタグ一式を決める関数。 */
export type TagResolver = (code: string, target: CourseTarget | undefined) => CourseTags;

/**
 * タグ(状態 / 区分 / 履修区分の3軸)を決める関数を返す。design.md §6.1 / §8。
 *
 * タグは2つの突合でできている。
 *
 * 1. **履修要項との突合** — `syllabus_code` → 区分・履修区分・修得済みかの候補。
 *    学生プロファイル(`student.ts`)と `GET /api/curricula` から作る
 * 2. **履修可否の判定** — シラバス側の対象課程で、その学生がそのクラスを
 *    履修登録できるかを判定し、できないものは候補を落とす
 *
 * **1つの関数として返すのは、2を掛け忘れられないようにするためである。**
 * 以前は `Map` を返しており、呼び出し側が `get()` した値をそのまま描いていた。
 * 一覧(PC・モバイル)と講義詳細で同じ結果でなければならない(§8.1)のと同じ理由で、
 * 判定はここに1つだけ置く。
 *
 * プロファイルが無い・履修要項が引けない場合は常に `NO_TAGS` を返し、呼び出し側は
 * タグ無しで描く。
 */
export function useTagMap(): TagResolver {
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

  const candidates = useMemo(() => {
    if (!curricula) return null;
    const completed = profile?.completedCourses ?? [];
    const passedCodes = new Set(
      completed.filter((c) => c.status === "passed" && c.code).map((c) => c.code as string),
    );
    // 成績表由来の科目名は表記が揺れる(全角英数字・空白)ため正規化して持つ。
    // backend の `normalize_title()` と同じ規則(`lib/courseTitle.ts`)
    const passedTitles = new Set(
      completed.filter((c) => c.status === "passed").map((c) => normalizeTitle(c.title)),
    );
    return buildTagMap(curricula, passedCodes, passedTitles);
  }, [curricula, profile]);

  const programName = profile?.program ?? null;

  return useCallback(
    (code, target) =>
      candidates ? resolveTags(candidates.get(code), target, programName) : NO_TAGS,
    [candidates, programName],
  );
}
