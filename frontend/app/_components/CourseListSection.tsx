"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { motion } from "motion/react";
import { CELL_STYLES, toCourseList, type Timetable } from "@/lib/timetable";

const MotionLink = motion.create(Link);

/**
 * 登録予定の科目リスト（ui-design_phone.pen CalendarPage CourseListSection）。
 * グリッドでは読み切れない科目コード・単位数をここで補う。
 */
export default function CourseListSection({ timetable }: { timetable: Timetable }) {
  const rows = toCourseList(timetable);
  if (rows.length === 0) return null;

  const totalCredits = rows.reduce((sum, r) => sum + (r.course.credits ?? 0), 0);

  return (
    <section className="flex flex-col bg-surface-primary">
      {/* グリッドとリストの境目 */}
      <div className="h-2 border-y border-border-primary bg-[#f1f3f6]" />

      <div className="flex items-center gap-2 px-4 pb-[11px] pt-[13px]">
        <h2 className="text-[14px] font-bold text-fg-primary">登録予定の科目</h2>
        <div className="flex-1">
          <span className="rounded-full bg-surface-gray px-2 py-[3px] text-[10px] font-bold text-fg-secondary">
            {rows.length}科目{totalCredits > 0 ? ` ・ ${totalCredits}単位` : ""}
          </span>
        </div>
        <span className="flex items-center gap-1 text-[11px] font-bold text-fg-secondary">
          曜日順
          <ChevronDown size={13} />
        </span>
      </div>

      {rows.map(({ day, period, course }, index) => {
        const style = CELL_STYLES[course.type];
        const meta = [course.code, course.teacher, course.credits && `${course.credits}単位`]
          .filter(Boolean)
          .join(" ・ ");
        const row = (
          <>
            <span
              className={`flex size-10 shrink-0 flex-col items-center justify-center rounded-[10px] ${style.badge}`}
            >
              <span className="text-[9px] font-bold text-fg-secondary">{day}</span>
              <span className="font-mono text-[15px] font-bold leading-[1.2] text-fg-primary">
                {period}
              </span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className="truncate text-[13px] font-bold text-fg-primary">{course.name}</span>
              {meta && <span className="truncate text-[10px] text-fg-muted">{meta}</span>}
            </span>
            <span className={`shrink-0 rounded-full px-2 py-[3px] text-[10px] font-bold ${style.pill}`}>
              {style.label}
            </span>
            <ChevronRight size={15} className="shrink-0 text-chevron" />
          </>
        );

        const itemClass =
          "flex items-center gap-[11px] border-b border-border-subtle px-4 py-[9px] last:border-b-0 active:bg-surface-gray";
        const anim = {
          initial: { opacity: 0, x: -8 },
          animate: { opacity: 1, x: 0 },
          transition: { duration: 0.18, delay: index * 0.04, ease: [0.25, 0.1, 0.25, 1] as const },
        };

        return course.code ? (
          <MotionLink
            key={`${day}${period}`}
            href={`/syllabus/${course.code}`}
            className={itemClass}
            {...anim}
          >
            {row}
          </MotionLink>
        ) : (
          <motion.div key={`${day}${period}`} className={itemClass} {...anim}>
            {row}
          </motion.div>
        );
      })}
    </section>
  );
}
