"use client";

import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { PROGRAMS } from "@/lib/programs";
import type { StudentProfile } from "@/lib/student";
import type { HalfTerm } from "@/lib/targetTerm";
import {
  defaultDemoTerm,
  demoSummary,
  loadDemoProfile,
  type DemoKey,
} from "@/lib/dummy/profiles";

const GRADES = [1, 2, 3, 4] as const;
const TERMS: HalfTerm[] = ["前期", "後期"];

/**
 * デモの学生を選ぶ(展示用。`lib/dummy/profiles.ts`)。学年・課程・学期の3つを選んで読み込む。
 *
 * 学期の初期値は今日の日付から決める(`defaultDemoTerm()`)。来場者が選び直せる。
 * 選んでいるのは「どの時点の学生か」であり、読み込んだあとに提案の学期を選び直す
 * わけではない(提案する学期はデモの学生ごとに決まっている。`lib/targetTerm.ts`)。
 * PC の取り込み画面・マイデータ、モバイルの取り込み画面・設定画面で共用する。
 */
export default function DemoPicker({
  initial,
  onLoad,
  submitLabel = "この学生で試す",
}: {
  /** いま読み込んでいるデモの学生。あればその選択から始める */
  initial?: DemoKey | null;
  onLoad: (profile: StudentProfile) => void;
  submitLabel?: string;
}) {
  const [grade, setGrade] = useState<DemoKey["grade"]>(initial?.grade ?? 2);
  const [programCode, setProgramCode] = useState(initial?.programCode ?? PROGRAMS[0].code);
  const [term, setTerm] = useState<HalfTerm>(initial?.term ?? defaultDemoTerm());
  const [termTouched, setTermTouched] = useState(initial != null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const handleLoad = async () => {
    setLoading(true);
    setError(false);
    try {
      onLoad(await loadDemoProfile({ programCode, grade, term }));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const segment = (active: boolean) =>
    `flex h-9 flex-1 items-center justify-center text-[13px] font-semibold transition-colors ${
      active ? "bg-fg-primary text-fg-inverse" : "bg-surface-primary text-fg-primary hover:bg-surface-soft"
    }`;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold text-fg-secondary">学年</span>
        <div className="flex overflow-hidden rounded border border-border-primary divide-x divide-border-primary">
          {GRADES.map((g) => (
            <button key={g} type="button" onClick={() => setGrade(g)} className={segment(g === grade)} aria-pressed={g === grade}>
              {g}年
            </button>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold text-fg-secondary">課程</span>
        <span className="relative flex items-center">
          <select
            value={programCode}
            onChange={(e) => setProgramCode(e.target.value)}
            className="h-9 w-full appearance-none rounded border border-border-primary bg-surface-primary px-2.5 pr-8 text-[13px] text-fg-primary focus:border-fg-primary focus:outline-none"
          >
            {PROGRAMS.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-2.5 text-fg-secondary" aria-hidden="true" />
        </span>
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-semibold text-fg-secondary">履修を組む学期</span>
          {!termTouched && <span className="text-[10px] text-fg-faint">今日の日付から選んでいます</span>}
        </span>
        <div className="flex overflow-hidden rounded border border-border-primary divide-x divide-border-primary">
          {TERMS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTerm(t);
                setTermTouched(true);
              }}
              className={segment(t === term)}
              aria-pressed={t === term}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <p className="rounded bg-surface-gray px-3 py-2 text-[11px] leading-relaxed text-fg-secondary">
        {demoSummary({ grade, term })}
      </p>

      {error && <p className="text-[11px] text-accent">ダミーデータを読み込めませんでした。</p>}

      <button
        type="button"
        onClick={handleLoad}
        disabled={loading}
        className="flex h-10 items-center justify-center gap-2 rounded bg-fg-primary text-[13px] font-semibold text-fg-inverse transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {loading && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
        {submitLabel}
      </button>
    </div>
  );
}
