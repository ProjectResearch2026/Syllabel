"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useStudentStore } from "@/lib/student";
import { useProposalStore } from "@/lib/proposal";
import { useGraduationCredits } from "@/lib/curricula";
import { useRequirements } from "@/lib/requirements";
import { useTargetTerm } from "@/lib/targetTerm";
import TargetTermSelect from "./TargetTermSelect";
import RequirementsPanel from "./RequirementsPanel";

/**
 * 単位バー(PC)。取得済み・今期登録・卒業残りの単位と提案する学期を出し、
 * 下に卒業要件枠ごとの充足状況(`RequirementsPanel`。§8.3.5)を開く。
 */
export default function CreditBar() {
  const profile = useStudentStore((s) => s.profile);
  const { status, totalCredits, courses } = useProposalStore();
  const graduationCredits = useGraduationCredits(profile);
  const { target } = useTargetTerm();
  // 提案の snapshot にも追従する(生成中から埋まっていく様子が見える)
  const requirements = useRequirements(profile, courses, target);
  // 既定は閉じる。開いたままだと時間割の高さを削って見にくい(§8.3.5)
  const [open, setOpen] = useState(false);

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

  const items = [
    {
      val: completedCredits !== null ? String(completedCredits) : "—",
      label: "取得済み単位",
      color: "text-fg-primary",
    },
    {
      val: currentCredits !== null ? String(currentCredits) : "—",
      label: "今期登録単位",
      color: "text-accent",
    },
    {
      val: remainingCredits !== null ? String(remainingCredits) : "—",
      label: "卒業残り単位",
      color: "text-[#5F6B7A]",
    },
  ];

  return (
    /* ヘッダーカードの直下に貼り付き、下だけ角を丸めて1枚のカードに見せる */
    <div className="flex shrink-0 flex-col rounded-b-lg bg-surface-primary">
      <div className="flex min-h-12 items-center justify-between px-8 py-1">
        <div className="flex items-center gap-8">
          {items.map(({ val, label, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={`tabular-nums text-xl font-bold ${color}`}>{val}</span>
              <span className="text-xs text-fg-tertiary">{label}</span>
            </div>
          ))}
          {requirements.status !== "unavailable" && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-fg-secondary transition-colors hover:bg-surface-gray"
            >
              卒業要件の内訳
              <ChevronDown
                size={14}
                aria-hidden="true"
                className={`transition-transform ${open ? "rotate-180" : ""}`}
              />
            </button>
          )}
        </div>
        {/* 提案する学期。ブラウザの今日の日付ではなく成績表から推定する(lib/targetTerm.ts) */}
        <TargetTermSelect disabled={status === "loading"} />
      </div>
      {open && <RequirementsPanel view={requirements} />}
    </div>
  );
}
