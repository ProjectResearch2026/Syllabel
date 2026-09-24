"use client";

import { createContext, useContext } from "react";
import { useStudentStore } from "@/lib/student";
import { useProposalStore } from "@/lib/proposal";
import { useGraduationCredits } from "@/lib/curricula";
import { useRequirements, type RequirementsView } from "@/lib/requirements";
import { useTargetTerm } from "@/lib/targetTerm";

/**
 * 単位の集計(取得済み・今期登録・卒業残り)と卒業要件枠の判定。design.md §8.3.5。
 *
 * ヘッダー(`components/Header.tsx`)の単位数と、履修提案の卒業要件の帯
 * (`app/proposal/_components/CreditBar.tsx`)が同じ値を見る。**判定は
 * `CreditSummaryProvider` で1回だけ引く** — 各所で `useRequirements()` を呼ぶと
 * `POST /api/requirements` が呼んだ数だけ飛ぶ。
 */
export type CreditSummary = {
  completedCredits: number | null;
  currentCredits: number | null;
  remainingCredits: number | null;
  requirements: RequirementsView;
};

function useComputeCreditSummary(): CreditSummary {
  const profile = useStudentStore((s) => s.profile);
  const { status, totalCredits, courses } = useProposalStore();
  const graduationCredits = useGraduationCredits(profile);
  const { target } = useTargetTerm();
  // 提案の snapshot にも追従する(生成中から埋まっていく様子が見える)
  const requirements = useRequirements(profile, courses, target);

  const completedCredits = profile
    ? profile.completedCourses
        .filter((c) => c.status === "passed")
        .reduce((sum, c) => sum + c.credits, 0)
    : null;

  const currentCredits = status === "done" ? totalCredits : null;

  // 卒業残りは backend の判定(今期の時間割を修得したあと)を使う。算入上限や随意科目で
  // 数えられない単位があると、単純な引き算は残りを少なく見せる。判定が時間割に
  // 追いつくまでは従来の計算で出す
  const judged =
    requirements.status === "ready" && !requirements.updating && status !== "loading"
      ? requirements.remainingCredits
      : null;
  const remainingCredits =
    judged ??
    (completedCredits != null
      ? Math.max(0, graduationCredits - completedCredits - (currentCredits ?? 0))
      : null);

  return { completedCredits, currentCredits, remainingCredits, requirements };
}

const CreditSummaryContext = createContext<CreditSummary | null>(null);

export function CreditSummaryProvider({ children }: { children: React.ReactNode }) {
  const summary = useComputeCreditSummary();
  return <CreditSummaryContext.Provider value={summary}>{children}</CreditSummaryContext.Provider>;
}

export function useCreditSummary(): CreditSummary {
  const summary = useContext(CreditSummaryContext);
  if (!summary) throw new Error("useCreditSummary() は CreditSummaryProvider の中で使う");
  return summary;
}
