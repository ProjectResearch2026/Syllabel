"use client";

import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { CELL_STYLES, categoryToCourseType, occupiedSlots, slotBadge } from "@/lib/timetable";
import type { ProposedCourse } from "@/lib/chatApi";

const VISIBLE = 2;

/**
 * AIの回答に添える候補科目カード（ui-design_phone.pen STEP5 ProposalCard）。
 * 3件目以降は「他N件を見る」に畳む。
 */
export default function AiProposalCard({
  courses,
  onAdd,
}: {
  courses: ProposedCourse[];
  onAdd?: (course: ProposedCourse) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? courses : courses.slice(0, VISIBLE);
  const hidden = courses.length - shown.length;

  return (
    <div className="w-[308px] overflow-hidden rounded-[14px] border border-border-primary bg-surface-primary">
      {shown.map((course) => {
        const style = CELL_STYLES[categoryToCourseType(course.category)];
        // 曜日・時限は集中講義などで null になる（design.md §5.3）。
        // 複数コマの科目は「金 / 4・5」と全コマを書く
        const badge = slotBadge(occupiedSlots(course));
        return (
          <div
            key={`${course.syllabusCode ?? course.title}-${course.day ?? ""}${course.period ?? ""}`}
            className="flex items-center gap-2.5 border-b border-border-subtle px-3 py-2.5"
          >
            <span
              className={`flex size-9 shrink-0 flex-col items-center justify-center rounded-[10px] ${style.badge}`}
            >
              {badge ? (
                <>
                  <span className="text-[9px] font-bold text-fg-secondary">{badge.day}</span>
                  <span
                    className={`tabular-nums font-bold leading-[1.2] text-fg-primary ${
                      badge.period.length > 1 ? "text-[10px]" : "text-[14px]"
                    }`}
                  >
                    {badge.period}
                  </span>
                </>
              ) : (
                <span className="text-[9px] font-bold text-fg-secondary">集中</span>
              )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className="truncate text-[13px] font-bold text-fg-primary">{course.title}</span>
              <span className="truncate text-[10px] text-fg-muted">
                {[course.syllabusCode, course.credits != null && `${course.credits}単位`]
                  .filter(Boolean)
                  .join(" ・ ")}
              </span>
            </span>
            <span
              className={`shrink-0 rounded-full px-2 py-[3px] text-[10px] font-bold ${style.pill}`}
            >
              {style.label}
            </span>
            <button
              type="button"
              onClick={() => onAdd?.(course)}
              aria-label={`${course.title}を時間割に追加`}
              className="grid size-7 shrink-0 place-items-center rounded-full bg-accent active:opacity-80"
            >
              <Plus size={14} className="text-fg-inverse" />
            </button>
          </div>
        );
      })}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex w-full items-center justify-center gap-[5px] px-3 py-[9px]"
        >
          <span className="text-[11px] font-bold text-accent">他{hidden}件を見る</span>
          <ChevronDown size={12} className="text-accent" />
        </button>
      )}
    </div>
  );
}
