"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { proposalDetailHref } from "@/lib/syllabusQuery";
import { DAYS, PERIODS, CELL_STYLES, coursesToSlotTable, type SlotEntry } from "@/lib/timetable";
import { useProposalStore } from "@/lib/proposal";

/** 科目の同一性。key に使い、科目が入れ替わったマスだけを作り直して現れる動きを流す */
function entryKey(entry: SlotEntry): string {
  return `${entry.code ?? entry.name}-${entry.quarter ?? ""}`;
}

/**
 * 科目が入るときの動き。マスの位置(曜日・時限の順)で少しずつずらし、表が
 * 組み上がっていくように見せる。CSS の動きはマウント時に1回だけなので、
 * 同じ科目が残っているマスは流れ直さない
 */
const ENTER = "motion-safe:animate-pop-in";
function enterDelay(order: number): React.CSSProperties {
  return { animationDelay: `${Math.min(order, 20) * 30}ms` };
}

/** 科目名と、履修区分・クォーターの印 */
function EntryBody({ entry, clamp }: { entry: SlotEntry; clamp: string }) {
  const style = CELL_STYLES[entry.type];
  return (
    <>
      <span className={`${clamp} text-[11px] font-semibold leading-[14px] text-fg-primary`}>
        {entry.name}
      </span>
      <span className="flex flex-wrap items-center gap-1">
        <span className={`rounded-sm px-1.5 py-0.5 text-[9px] ${style.tag}`}>{style.label}</span>
        {entry.quarter && (
          <span className="rounded-sm border border-border-primary bg-surface-primary px-1 py-0.5 text-[9px] font-semibold leading-none text-fg-secondary">
            {entry.quarter}
          </span>
        )}
      </span>
    </>
  );
}

/**
 * 科目の枠。シラバスコードがあれば講義詳細(`/syllabus/[code]`)へのリンクにする
 * (design.md §8.3.4)。同じタブのクライアント遷移で開くので、提案と対話は
 * 残ったまま「時間割に戻る」で戻れる(`proposalDetailHref()`)。
 */
function CourseLink({
  entry,
  className,
  style,
  children,
}: {
  entry: SlotEntry;
  className: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  if (!entry.code) return <div className={className} style={style}>{children}</div>;
  return (
    <Link
      style={style}
      href={proposalDetailHref(entry.code)}
      aria-label={`${entry.name}のシラバスを開く`}
      className={`${className} transition-[filter] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent`}
    >
      {children}
    </Link>
  );
}

/**
 * 時間割カード（ui-design_pc.pen 04_履修提案 TimetableCard）。
 *
 * 高さは親いっぱいで、5つの限が**均等に伸びる**（`flex-1`）。縦スクロールは
 * 起こさない。列は限ラベル 44px ＋ 曜日6列。
 *
 * **提案の科目はすべて画面に出す**（design.md §8.3）。1マスに複数の科目（3Q と 4Q）が
 * 入り得るので縦に並べ、クォーターの科目には印を付ける。曜日・時限の無い科目
 * （集中講義など）は表の下の「曜日・時限未定」に並べる。どちらかを欠くと、
 * 表の科目の単位の和が「今期登録単位」と合わなくなる。
 */
export default function TimetablePanel() {
  const { status, courses } = useProposalStore();
  // 生成中に届く snapshot も描く（逐次描画。design.md §6.1.1 / §7.2）
  const { table, unscheduled } = coursesToSlotTable(courses);
  const isLoading = status === "loading";
  // まだ投げていない（§5.2.3 の `idle`）。空の表だけを出すと、提案が終わって
  // 何も無いのか、これからなのかが区別できない（§8.3.2）
  const isIdle = status === "idle";

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border-primary bg-surface-primary">
      {/* 曜日ヘッダー */}
      <div className="flex h-10 shrink-0 border-b border-border-primary bg-surface-gray">
        <div className="w-11 shrink-0" />
        {DAYS.map((d) => (
          <div
            key={d}
            className="flex flex-1 items-center justify-center border-l border-border-primary"
          >
            <span className="text-[13px] font-semibold text-fg-primary">{d}</span>
          </div>
        ))}
      </div>

      {PERIODS.map((p) => (
        <div key={p} className="flex min-h-0 flex-1 border-b border-border-primary last:border-b-0">
          <div className="flex w-11 shrink-0 flex-col items-center justify-center gap-0.5 border-r border-border-primary bg-cell-free">
            <span className="text-sm font-bold leading-none text-fg-primary">{p}</span>
            <span className="text-[9px] text-fg-faint">限</span>
          </div>

          {DAYS.map((d, di) => {
            const order = di * PERIODS.length + (p - PERIODS[0]);
            const entries = table[p]?.[d] ?? [];
            // 1科目ならマス全体を区分の色で塗り、マスごとリンクにする。
            // 複数なら科目ごとに色の付いた枠を積み、枠ごとにリンクにする
            const single = entries.length === 1 ? entries[0] : null;
            const cellClass = `flex min-w-0 flex-1 flex-col justify-center gap-1 border-r border-border-primary last:border-r-0 ${
              entries.length > 1 ? "p-1" : "p-2"
            } ${single ? `${CELL_STYLES[single.type].cell} ${ENTER}` : "bg-surface-primary"}`;
            if (single) {
              return (
                <CourseLink
                  key={`${d}:${entryKey(single)}`}
                  entry={single}
                  className={cellClass}
                  style={enterDelay(order)}
                >
                  <EntryBody entry={single} clamp="line-clamp-3" />
                </CourseLink>
              );
            }
            return (
              <div key={d} className={cellClass}>
                {entries.map((entry) => (
                  <CourseLink
                    key={entryKey(entry)}
                    entry={entry}
                    className={`flex min-h-0 flex-1 flex-col justify-center gap-0.5 rounded-sm px-1.5 py-1 ${
                      CELL_STYLES[entry.type].cell
                    } ${ENTER}`}
                    style={enterDelay(order)}
                  >
                    <EntryBody entry={entry} clamp="line-clamp-2" />
                  </CourseLink>
                ))}
              </div>
            );
          })}
        </div>
      ))}

      {unscheduled.length > 0 && (
        <div className="flex shrink-0 items-center gap-3 border-t border-border-primary bg-surface-gray px-3 py-2">
          <span className="shrink-0 text-[11px] font-semibold text-fg-secondary">曜日・時限未定</span>
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {unscheduled.map((entry) => (
              <CourseLink
                key={entry.code ?? entry.name}
                entry={entry}
                className={`flex items-center gap-1.5 rounded-sm px-2 py-1 ${CELL_STYLES[entry.type].cell} ${ENTER}`}
              >
                <span className="text-[11px] font-semibold text-fg-primary">{entry.name}</span>
                <span className={`rounded-sm px-1.5 py-0.5 text-[9px] ${CELL_STYLES[entry.type].tag}`}>
                  {CELL_STYLES[entry.type].label}
                </span>
                {entry.quarter && (
                  <span className="text-[9px] font-semibold text-fg-secondary">{entry.quarter}</span>
                )}
              </CourseLink>
            ))}
          </div>
        </div>
      )}

      {/* 生成中は表の上を光が流れる。4〜5分待つ場面なので、止まっていないことを示す
          (§7.2)。マスごとの点滅にしないのは、届いた科目が現れる動きと重なるため */}
      {isLoading && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden"
        >
          <div className="h-full w-full bg-linear-to-r from-transparent via-white/60 to-transparent motion-safe:animate-shimmer" />
        </div>
      )}

      <AnimatePresence>
        {isIdle && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none absolute inset-0 grid place-items-center bg-surface-primary/80"
          >
            <p className="max-w-[260px] text-center text-[13px] leading-5 text-fg-tertiary">
              右のAI履修アシスタントに希望条件を送ると、ここに時間割が出ます。
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
