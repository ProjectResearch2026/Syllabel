import Link from "next/link";
import { User, Award, Clock, ArrowUpRight } from "lucide-react";
import type { SyllabusListItem } from "@/lib/syllabus-api";
import type { TagType } from "@/lib/syllabusUI";

const TAG_STYLES: Record<NonNullable<TagType>, string> = {
  必修: "bg-[#FFF1F2] text-[#BE123C] border-[#FECDD3]",
  選択: "bg-[#F0F9FF] text-[#0369A1] border-[#BAE6FD]",
  既修得済み: "bg-[#F0FDF4] text-[#15803D] border-[#BBF7D0]",
};

export default function CourseCard({
  course,
  tag,
}: {
  course: SyllabusListItem;
  tag?: TagType;
}) {
  const grade =
    course.grade_min === course.grade_max
      ? `${course.grade_min}年次`
      : `${course.grade_min}〜${course.grade_max}年次`;

  return (
    <Link
      href={`/syllabus/${course.syllabus_code}`}
      className="group flex min-h-[172px] flex-col justify-between rounded-xl border border-[#D9DEE7] bg-white p-4 shadow-[0_2px_8px_rgba(26,43,78,0.04)] transition-all hover:-translate-y-0.5 hover:border-[#9AA8BC] hover:shadow-[0_8px_20px_rgba(26,43,78,0.10)]"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <span className="font-mono text-[11px] font-bold tracking-[0.04em] text-[#667085]">
          {course.syllabus_code}
        </span>
        <ArrowUpRight
          size={17}
          strokeWidth={1.8}
          aria-hidden="true"
          className="shrink-0 text-[#98A2B3] transition-colors group-hover:text-[#E60012]"
        />
      </div>

      <div className="mt-3 min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {tag && (
            <span
              className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${TAG_STYLES[tag]}`}
            >
              {tag}
            </span>
          )}
          <span className="rounded-md bg-[#F2F4F7] px-2 py-0.5 text-[10px] font-semibold text-[#475467]">
            {course.term}
          </span>
        </div>

        <p className="line-clamp-2 text-[15px] font-bold leading-6 text-[#1A2B4E] transition-colors group-hover:text-[#C1121F]">
          {course.course_title}
          {course.subtitle && (
            <span className="ml-1 text-xs font-normal text-[#667085]">({course.subtitle})</span>
          )}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-3 divide-x divide-[#EAECF0] border-t border-[#EAECF0] pt-3 text-[11px] text-[#667085]">
        <span className="flex items-center gap-1 pr-2">
          <Award size={13} className="shrink-0 text-[#98A2B3]" />
          {course.credits}単位
        </span>
        <span className="flex items-center gap-1 px-2">
          <Clock size={13} className="shrink-0 text-[#98A2B3]" />
          {course.day_of_week}{course.period}限
        </span>
        <span className="flex min-w-0 items-center gap-1 pl-2">
          <User size={13} className="shrink-0 text-[#98A2B3]" />
          <span className="truncate">{course.campus} / {grade}</span>
        </span>
      </div>
    </Link>
  );
}
