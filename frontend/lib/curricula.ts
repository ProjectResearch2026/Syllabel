import { useState, useEffect } from "react";
import { fetchCurricula } from "@/lib/syllabus-api";
import { getAdmissionYear, programCodeOf } from "@/lib/programs";
import type { StudentProfile } from "@/lib/student";

export const FALLBACK_GRADUATION_CREDITS = 124;

/**
 * 学生プロファイルに基づき `GET /api/curricula/{program_code}/{admission_year}` を
 * 呼び出し、卒業必要単位数を返す。design.md §6.1 / §4.4.5。
 *
 * 値は backend が返す `graduation.totalCredits` を使う。**設置科目の単位数の総和は
 * 卒業必要単位数ではない**ため、`courses` から算出してはならない（§6.1）。
 * 取得失敗時と課程・学年が未取得のときは 124 にフォールバックする。
 */
export function useGraduationCredits(profile: StudentProfile | null): number {
  // 取得元のプロファイルを key として保持する。プロファイルが変わった時点で
  // 前の課程の値を返さなくなるため、effect の中で setState する必要がない
  const [fetched, setFetched] = useState<{ key: string; credits: number } | null>(null);

  // 履修要項を引くキーは (課程コード, 入学年度)。プロファイルの `program` は
  // 課程名なのでコードに解決する（§4.4.2、`lib/programs.ts`）
  const programCode = programCodeOf(profile?.program);
  const grade = profile?.grade ?? null;
  const key = `${programCode ?? ""}:${grade ?? ""}`;

  useEffect(() => {
    if (!programCode || !grade) return;

    let active = true;
    fetchCurricula(programCode, getAdmissionYear(grade))
      .then((data) => {
        if (active && data.graduation.totalCredits > 0) {
          setFetched({ key, credits: data.graduation.totalCredits });
        }
      })
      .catch(() => {
        // API 未対応・ネットワーク障害時はフォールバック値を維持
      });

    return () => {
      active = false;
    };
  }, [programCode, grade, key]);

  return fetched?.key === key ? fetched.credits : FALLBACK_GRADUATION_CREDITS;
}
