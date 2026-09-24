"use client";

import { useProposalStore } from "@/lib/proposal";
import { useCreditSummary } from "@/lib/creditSummary";
import TargetTermSelect from "./TargetTermSelect";
import RequirementsPanel from "./RequirementsPanel";

/**
 * 卒業要件の帯(PC)。ヘッダーカードの直下に貼り付き、卒業要件枠の充足状況
 * (`RequirementsPanel`。§8.3.5)と提案する学期を1本に並べる。
 *
 * 単位数(取得済み・今期登録・卒業残り)はヘッダーへ移した。帯を低く保ち、
 * 時間割に高さを回すためである。
 */
export default function CreditBar() {
  const status = useProposalStore((s) => s.status);
  const { requirements } = useCreditSummary();

  return (
    /* ヘッダーカードの直下に貼り付き、下だけ角を丸めて1枚のカードに見せる */
    <div className="flex shrink-0 items-center gap-4 rounded-b-lg bg-surface-primary px-8 py-3">
      <div className="min-w-0 flex-1">
        <RequirementsPanel view={requirements} />
      </div>
      {/* 提案する学期。ブラウザの今日の日付ではなく成績表から推定する(lib/targetTerm.ts) */}
      <div className="shrink-0">
        <TargetTermSelect disabled={status === "loading"} />
      </div>
    </div>
  );
}
