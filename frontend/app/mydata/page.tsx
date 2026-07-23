"use client";

import Link from "next/link";
import { Upload } from "lucide-react";
import { useStudentStore } from "@/lib/student";

export default function MyDataPage() {
  const profile = useStudentStore((s) => s.profile);

  if (!profile) {
    return (
      <div className="max-w-screen-md mx-auto px-4 md:px-8 py-12 flex flex-col items-center gap-6 text-center">
        <div className="w-16 h-16 rounded-full bg-[#F3F4F6] flex items-center justify-center">
          <Upload size={28} className="text-[#9CA3AF]" />
        </div>
        <div>
          <p className="text-[#1A2B4E] font-semibold text-base mb-1">学生データがありません</p>
          <p className="text-[#6B7280] text-sm">
            成績表PDFを取り込むか、ダミーデータで試してください。
          </p>
        </div>
        <Link
          href="/"
          className="px-5 py-2.5 rounded-lg bg-[#1A2B4E] text-white text-sm font-semibold hover:bg-[#0f1d36] transition-colors"
        >
          トップへ戻る
        </Link>
      </div>
    );
  }

  const totalCredits = profile.completedCourses.reduce((sum, c) => sum + c.credits, 0);

  return (
    <div className="max-w-screen-md mx-auto px-4 md:px-8 py-6">
      <h1 className="text-[#1A2B4E] text-xl font-bold mb-6">マイデータ</h1>

      {/* プロファイルサマリー */}
      <div className="bg-white border border-[#D1D5DB] rounded-xl px-5 py-4 mb-4 flex flex-wrap gap-6">
        <div>
          <span className="text-xs text-[#9CA3AF]">学年</span>
          <p className="text-[#1A2B4E] font-semibold text-sm mt-0.5">{profile.grade}回生</p>
        </div>
        <div>
          <span className="text-xs text-[#9CA3AF]">課程</span>
          <p className="text-[#1A2B4E] font-semibold text-sm mt-0.5">{profile.program}</p>
        </div>
        <div>
          <span className="text-xs text-[#9CA3AF]">修得済み単位</span>
          <p className="text-[#1A2B4E] font-bold text-lg font-mono mt-0.5">{totalCredits}単位</p>
        </div>
        <div>
          <span className="text-xs text-[#9CA3AF]">修得科目数</span>
          <p className="text-[#1A2B4E] font-bold text-lg font-mono mt-0.5">{profile.completedCourses.length}科目</p>
        </div>
      </div>

      {/* 修得済み科目リスト */}
      <div className="bg-white border border-[#D1D5DB] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#E5E7EB] bg-[#F9FAFB]">
          <h2 className="text-sm font-semibold text-[#1A2B4E]">修得済み科目</h2>
        </div>
        <div className="divide-y divide-[#F3F4F6]">
          {profile.completedCourses.map((course) => (
            <div key={`${course.title}-${course.year}-${course.term}`} className="flex items-center justify-between px-5 py-3 gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#1A2B4E] font-medium truncate">{course.title}</p>
                <p className="text-xs text-[#9CA3AF] mt-0.5">
                  {course.year}年度 {course.term}
                  {course.code ? ` · ${course.code}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-[#6B7280]">{course.credits}単位</span>
                {course.rawScore && (
                  <span className="text-xs font-semibold text-center text-[#1A2B4E] bg-[#EFF6FF] rounded px-1.5 py-0.5">
                    {course.rawScore}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
