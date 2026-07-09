import Link from "next/link";
import { TYPE_META } from "@/lib/syllabus";
import type { Course } from "@/lib/syllabus";

export default function CourseCard({ course }: { course: Course }) {
  const meta = TYPE_META[course.type];
  return (
    <Link
      href={`/syllabus/${course.code}`}
      className="flex items-center gap-3 bg-white border border-[#D1D5DB] rounded-xl px-4 py-3 hover:shadow-sm transition-shadow group"
    >
      <div className={`w-1 self-stretch rounded-full shrink-0 ${meta.accent}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs text-[#6B7280]">{course.code}</span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${meta.pill}`}>
            {meta.label}
          </span>
        </div>
        <p className="text-sm font-semibold text-[#1A2B4E] truncate group-hover:text-[#E60012] transition-colors">
          {course.title}
        </p>
        <p className="text-xs text-[#6B7280] mt-0.5">
          {course.instructor} / {course.credits}単位 / {course.semester} {course.day}曜{course.period}
        </p>
      </div>
      <span className="text-[#D1D5DB] text-lg shrink-0">›</span>
    </Link>
  );
}
