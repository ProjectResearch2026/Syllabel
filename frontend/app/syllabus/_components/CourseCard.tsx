import Link from "next/link";
import type { SyllabusListItem } from "@/lib/syllabus-api";

export default function CourseCard({ course }: { course: SyllabusListItem }) {
  return (
    <Link
      href={`/syllabus/${course.syllabus_code}`}
      className="flex items-center gap-3 bg-white border border-[#D1D5DB] rounded-xl px-4 py-3 hover:shadow-sm transition-shadow group"
    >
      <div className="w-1 self-stretch rounded-full shrink-0 bg-[#1A2B4E]" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="text-xs text-[#6B7280]">{course.syllabus_code}</span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#E5E7EB] text-[#374151]">
            {course.term} {course.day_of_week}曜{course.period}限
          </span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#1A2B4E]">
            {course.credits}単位
          </span>
        </div>
        <p className="text-sm font-semibold text-[#1A2B4E] truncate group-hover:text-[#E60012] transition-colors">
          {course.course_title}
          {course.subtitle && <span className="text-xs font-normal text-[#6B7280] ml-1">({course.subtitle})</span>}
        </p>
        <p className="text-xs text-[#6B7280] mt-0.5">
          {course.campus} / {course.grade_min === course.grade_max ? `${course.grade_min}年次` : `${course.grade_min}〜${course.grade_max}年次`}
        </p>
      </div>
      <span className="text-[#D1D5DB] text-lg shrink-0">›</span>
    </Link>
  );
}
