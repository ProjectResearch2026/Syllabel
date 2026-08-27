import { useState, useEffect } from "react";
import { fetchCurricula, type CurriculaData } from "@/lib/syllabus-api";
import type { StudentProfile } from "@/lib/student";

export const FALLBACK_GRADUATION_CREDITS = 124;

function getAdmissionYear(grade: number): number {
  const now = new Date();
  const month = now.getMonth() + 1;
  const academicYear = month >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return academicYear - grade + 1;
}

function totalCurriculaCredits(data: CurriculaData): number {
  return data.courses.reduce((sum, c) => sum + c.credits, 0);
}

/**
 * 学生プロファイルに基づき GET /api/curricula を呼び出し、
 * 卒業必要単位数を返す。取得失敗時は 124 にフォールバック。
 */
export function useGraduationCredits(profile: StudentProfile | null): number {
  const [graduationCredits, setGraduationCredits] = useState(FALLBACK_GRADUATION_CREDITS);

  useEffect(() => {
    if (!profile?.program || !profile?.grade) {
      setGraduationCredits(FALLBACK_GRADUATION_CREDITS);
      return;
    }
    const admissionYear = getAdmissionYear(profile.grade);
    fetchCurricula(profile.program, admissionYear)
      .then((data) => {
        const total = totalCurriculaCredits(data);
        if (total > 0) setGraduationCredits(total);
      })
      .catch(() => {
        // API 未対応・ネットワーク障害時はフォールバック値を維持
      });
  }, [profile?.program, profile?.grade]);

  return graduationCredits;
}
