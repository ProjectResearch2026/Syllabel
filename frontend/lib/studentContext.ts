"use client";

import { useMemo } from "react";
import type { TargetTermBody } from "@/lib/chatApi";
import { programCodeOf, resolveAdmissionYear } from "@/lib/programs";
import { useStudentStore, type StudentProfile } from "@/lib/student";
import { useTargetTerm } from "@/lib/targetTerm";

/**
 * backend が学生の文脈(`StudentContext`。design.md §7.2)を作るのに要るもの。
 * 履修要項を引くキーは (課程コード, 入学年度)(§4.4.2)で、プロファイルの `program` は
 * 課程名なのでコードに直す。対象学期は画面の表示(`TargetTermLabel`)と同じ値を使う。
 */
export type StudentContextBody = {
  programCode: string;
  admissionYear: number;
  targetTerm: TargetTermBody;
};

export type StudentContextState = {
  profile: StudentProfile | null;
  /** 揃わなければ null */
  context: StudentContextBody | null;
  /**
   * 揃わない理由。時間割を組めない理由として画面に出す(§8.3.2)。揃えば null。
   * **投げても 404 / 400 になるものは投げる前に画面で示す**
   */
  blockedReason: string | null;
};

export function useStudentContext(): StudentContextState {
  const profile = useStudentStore((s) => s.profile);
  const { target, grade } = useTargetTerm();

  return useMemo(() => {
    const programCode = programCodeOf(profile?.program);
    const admissionYear = resolveAdmissionYear(profile);
    const blockedReason = !profile
      ? "成績表がまだ取り込まれていません。ヘッダーの「マイデータ」から取り込むと、履修提案を作れます。"
      : profile.grade == null || grade == null
        ? "学年が取り込めていません。ヘッダーの「マイデータ」から学年を入力すると、履修提案を作れます。"
        : !programCode
          ? `課程「${profile.program ?? "未設定"}」に対応する履修要項がありません。ヘッダーの「マイデータ」から課程を選び直してください。`
          : admissionYear == null
            ? "入学年度が分かりません。ヘッダーの「マイデータ」から入学年度を入力してください。"
            : null;
    const context =
      blockedReason === null && programCode && admissionYear != null && grade != null
        ? { programCode, admissionYear, targetTerm: { ...target, grade } }
        : null;
    return { profile, context, blockedReason };
  }, [profile, target, grade]);
}
