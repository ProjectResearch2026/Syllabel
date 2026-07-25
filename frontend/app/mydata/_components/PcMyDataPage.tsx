"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  FileCheck,
  FileText,
  RotateCcw,
  Monitor,
  TriangleAlert,
  Trash2,
  Upload,
} from "lucide-react";
import { useStudentStore } from "@/lib/student";
import { useChatStore } from "@/lib/chat";

const GRADUATION_CREDITS = 124;

export default function PcMyDataPage() {
  const router = useRouter();
  const profile = useStudentStore((s) => s.profile);
  const clearProfile = useStudentStore((s) => s.clearProfile);
  const clearAll = useChatStore((s) => s.clearAll);
  const [demoMode, setDemoMode] = useState(true);

  const handleReset = () => {
    if (confirm("取り込んだ成績・対話履歴をすべて消去しますか? この操作は取り消せません。")) {
      clearProfile();
      clearAll();
      router.push("/");
    }
  };

  if (!profile) {
    return (
      <div className="flex-1 bg-[#F8F9FA] flex flex-col items-center justify-center gap-6 px-4 py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-[#EEF0F5] flex items-center justify-center">
          <Upload size={28} className="text-[#9CA3AF]" />
        </div>
        <div>
          <p className="text-[#1A2B4E] font-bold text-base mb-1">学生データがありません</p>
          <p className="text-[#6B7280] text-sm">
            成績表PDFを取り込むか、ダミーデータで試してください。
          </p>
        </div>
        <button
          onClick={() => router.push("/")}
          className="px-5 py-2.5 rounded bg-[#1A2B4E] text-white text-sm font-semibold hover:bg-[#0f1d36] transition-colors"
        >
          取り込み画面へ
        </button>
      </div>
    );
  }

  const totalCredits = profile.completedCourses.reduce((sum, c) => sum + c.credits, 0);
  const now = new Date();
  const currentNendo = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const enrollmentYear = profile.grade != null ? currentNendo - (profile.grade - 1) : null;

  const profRows = [
    { label: "学年", value: profile.grade != null ? `${profile.grade}回生` : "不明" },
    { label: "課程", value: profile.program },
    { label: "入学年度", value: enrollmentYear != null ? `${enrollmentYear}年度` : "不明" },
    { label: "取得単位", value: `${totalCredits} / ${GRADUATION_CREDITS} 単位` },
  ];

  return (
    <div className="flex-1 bg-[#F8F9FA] px-4 md:px-20 py-7 flex flex-col items-center">
      <div className="w-full max-w-[720px] flex flex-col gap-[18px]">
        {/* Page head */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-[#1A2B4E]">マイデータ</h1>
          <p className="text-[13px] text-[#4B5563]">取り込んだ成績データと表示設定を管理します。</p>
        </div>

        {/* 履修プロファイル */}
        <section className="bg-white rounded-lg border border-[#D1D5DB] p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <User size={18} className="text-[#E60012]" />
            <h2 className="text-[15px] font-bold text-[#1A2B4E]">履修プロファイル</h2>
          </div>
          <div className="rounded border border-[#D1D5DB] overflow-hidden">
            {profRows.map((row, i) => (
              <div
                key={row.label}
                className={`flex items-center justify-between h-11 px-4 ${
                  i % 2 === 0 ? "bg-[#F8F9FA]" : "bg-white"
                } ${i < profRows.length - 1 ? "border-b border-[#D1D5DB]" : ""}`}
              >
                <span className="text-[13px] text-[#4B5563]">{row.label}</span>
                <span className="text-[13px] font-semibold text-[#1A2B4E] font-mono">{row.value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 取り込み済みデータ */}
        <section className="bg-white rounded-lg border border-[#D1D5DB] p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <FileCheck size={18} className="text-[#E60012]" />
            <h2 className="text-[15px] font-bold text-[#1A2B4E]">取り込み済みデータ</h2>
          </div>
          <div className="flex items-center justify-between gap-3 bg-[#F8F9FA] border border-[#D1D5DB] rounded p-3.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <FileText size={20} className="text-[#E60012] shrink-0" />
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[13px] font-semibold text-[#1A2B4E] truncate">
                  成績表_2024.pdf
                </span>
                <span className="text-[11px] text-[#4B5563]">
                  {profile.completedCourses.length}科目を認識・ブラウザ内で保持中
                </span>
              </div>
            </div>
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-1.5 h-9 px-3.5 rounded border border-[#1A2B4E] text-[#1A2B4E] hover:bg-[#EEF1F8] transition-colors shrink-0"
            >
              <RotateCcw size={14} />
              <span className="text-[13px] font-semibold">再取り込み</span>
            </button>
          </div>
        </section>

        <section className="bg-white border border-[#D1D5DB] rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[#E5E7EB] bg-[#F9FAFB]">
            <h2 className="text-sm font-semibold text-[#1A2B4E]">修得済み科目</h2>
          </div>
          <div className="divide-y divide-[#F3F4F6]">
            {profile.completedCourses.map((course) => (
              <div
                key={`${course.title}-${course.year}-${course.term}`}
                className="flex items-center justify-between px-5 py-3 gap-3"
              >
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
        </section>

        {/* デモモード */}
        <section className="bg-white rounded-lg border border-[#D1D5DB] p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Monitor size={18} className="text-[#E60012]" />
            <h2 className="text-[15px] font-bold text-[#1A2B4E]">デモモード</h2>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-semibold text-[#1A2B4E]">展示用ダミーデータを使用</span>
              <span className="text-[11px] text-[#4B5563]">
                龍谷祭の展示端末ではPDF取り込みを無効化します
              </span>
            </div>
            <button
              role="switch"
              aria-checked={demoMode}
              onClick={() => setDemoMode((v) => !v)}
              className={`w-11 h-6 rounded-full p-0.5 flex items-center transition-colors shrink-0 ${
                demoMode ? "bg-[#E60012] justify-end" : "bg-[#D1D5DB] justify-start"
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-white shadow-sm" />
            </button>
          </div>
        </section>

        {/* Danger zone */}
        <section className="bg-[#FEF2F2] rounded-lg border border-[#FCA5A5] p-6 flex flex-col gap-3.5">
          <div className="flex items-center gap-2">
            <TriangleAlert size={18} className="text-[#E60012]" />
            <h2 className="text-[15px] font-bold text-[#E60012]">データのリセット</h2>
          </div>
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-[#4B5563] leading-[1.6] max-w-[480px]">
              取り込んだ成績・対話履歴をすべて消去し、初期状態に戻します。この操作は取り消せません。
            </p>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 h-10 px-5 rounded bg-[#E60012] hover:bg-[#b7000c] transition-colors shrink-0"
            >
              <Trash2 size={15} className="text-white" />
              <span className="text-[13px] font-semibold text-white">すべて消去</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
