import Link from "next/link";
import { User, Award, Clock } from "lucide-react";
import type { SyllabusListItem } from "@/lib/syllabus-api";

export default function CourseCard({ course }: { course: SyllabusListItem }) {
  const grade =
    course.grade_min === course.grade_max
      ? `${course.grade_min}年次`
      : `${course.grade_min}〜${course.grade_max}年次`;

  return (
    <Link
      href={`/syllabus/${course.syllabus_code}`}
      className="flex bg-white border border-[#D1D5DB] rounded-lg overflow-hidden hover:shadow-md transition-shadow group"
    >
      {/* Accent bar */}
      <div className="w-1 self-stretch shrink-0 bg-[#1A2B4E]" />

      <div className="flex flex-col gap-1.5 px-3.5 py-3 flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold text-[#4B5563] font-mono">
            {course.syllabus_code}
          </span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#1A2B4E] shrink-0">
            {course.term}
          </span>
        </div>

        <p className="text-sm font-semibold text-[#1A2B4E] truncate group-hover:text-[#E60012] transition-colors">
          {course.course_title}
          {course.subtitle && (
            <span className="text-xs font-normal text-[#6B7280] ml-1">({course.subtitle})</span>
          )}
        </p>

        <div className="flex items-center gap-3 text-xs text-[#4B5563] flex-wrap">
          <span className="flex items-center gap-1">
            <Award size={13} className="text-[#9CA3AF]" />
            {course.credits}単位
          </span>
          <span className="flex items-center gap-1">
            <Clock size={13} className="text-[#9CA3AF]" />
            {course.day_of_week}
            {course.period}限
          </span>
          <span className="flex items-center gap-1">
            <User size={13} className="text-[#9CA3AF]" />
            {course.campus} / {grade}
          </span>
        </div>
      </div>
    </Link>
  );
}
