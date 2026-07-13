import Link from "next/link";
import type { SyllabusListItem } from "@/lib/syllabus-api";

export default function CourseCardGrid({ course }: { course: SyllabusListItem }) {
  return (
    <Link
      href={`/syllabus/${course.syllabus_code}`}
      className="flex flex-col bg-white border border-[#D1D5DB] rounded-xl p-4 hover:shadow-md transition-shadow group"
    >
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <span className="text-[10px] text-[#6B7280]">{course.syllabus_code}</span>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#E5E7EB] text-[#374151]">
          {course.term}
        </span>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#EFF6FF] text-[#1A2B4E]">
          {course.credits}単位
        </span>
      </div>
      <p className="text-sm font-semibold text-[#1A2B4E] line-clamp-2 group-hover:text-[#E60012] transition-colors leading-snug mb-1">
        {course.course_title}
        {course.subtitle && (
          <span className="text-xs font-normal text-[#6B7280] ml-1">({course.subtitle})</span>
        )}
      </p>
      <p className="text-xs text-[#6B7280] mt-auto pt-2">
        {course.day_of_week}曜{course.period}限 / {course.campus}
      </p>
      <p className="text-xs text-[#9CA3AF]">
        {course.grade_min === course.grade_max
          ? `${course.grade_min}年次`
          : `${course.grade_min}〜${course.grade_max}年次`}
      </p>
    </Link>
  );
}
