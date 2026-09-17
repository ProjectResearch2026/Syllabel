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
import { useStudentStore, type Course } from "@/lib/student";
import { useChatStore } from "@/lib/chat";
import { useChatHistoryStore } from "@/lib/chatHistory";
import { DUMMY_PROFILES } from "@/lib/dummy/profiles";

const GRADUATION_CREDITS = 124;

export default function PcMyDataPage() {
  const router = useRouter();
  const profile = useStudentStore((s) => s.profile);
  const setProfile = useStudentStore((s) => s.setProfile);
  const clearProfile = useStudentStore((s) => s.clearProfile);
  const clearAll = useChatStore((s) => s.clearAll);
  const clearHistory = useChatHistoryStore((s) => s.clearAll);
  const [demoMode, setDemoMode] = useState(false);
  const [demoIndex, setDemoIndex] = useState(0);

  const handleDemoToggle = () => {
    if (!demoMode) {
      setProfile(DUMMY_PROFILES[demoIndex].profile);
    } else {
      clearProfile();
    }
    setDemoMode((v) => !v);
  };

  const handleDemoSelect = (index: number) => {
    setDemoIndex(index);
    setProfile(DUMMY_PROFILES[index].profile);
  };

  const handleReset = () => {
    if (confirm("取り込んだ成績・対話履歴をすべて消去しますか? この操作は取り消せません。")) {
      clearProfile();
      clearAll();
      clearHistory();
      router.push("/");
    }
  };

  if (!profile) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
        <span className="grid size-16 place-items-center rounded-full bg-surface-soft">
          <Upload size={28} className="text-fg-faint" aria-hidden="true" />
        </span>
        <div>
          <p className="mb-1 text-base font-bold text-fg-primary">学生データがありません</p>
          <p className="text-sm text-fg-tertiary">
            成績表PDFを取り込むか、ダミーデータで試してください。
          </p>
        </div>
        <button
          onClick={() => router.push("/")}
          className="rounded bg-fg-primary px-5 py-2.5 text-sm font-semibold text-fg-inverse transition-colors hover:bg-[#0f1d36]"
        >
          取り込み画面へ
        </button>
      </div>
    );
  }

  // 取り込みは不合格・履修辞退も含む全科目。単位に数えるのは合格したものだけ(要件§4.2)
  const passedCourses = profile.completedCourses.filter((c) => c.status === "passed");
  const totalCredits = passedCourses.reduce((sum, c) => sum + c.credits, 0);
  // 不合格と履修辞退は「未修得」に丸める(設計書 §6.1。再履修の対象として同じ扱い)
  const unearnedCourses = profile.completedCourses.filter((c) => c.status !== "passed");
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
    /* ui-design_pc.pen 08_マイデータ Content。720px の1カラムを中央に置く */
    <div className="flex flex-1 flex-col items-center px-4 py-10 md:px-16">
      <div className="flex w-full max-w-[720px] flex-col gap-[18px]">
        {/* Page head */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-fg-primary">マイデータ</h1>
          <p className="text-[13px] text-fg-secondary">取り込んだ成績データと表示設定を管理します。</p>
        </div>

        {/* 履修プロファイル */}
        <section className="flex flex-col gap-4 rounded-lg border border-border-primary bg-surface-primary p-6">
          <div className="flex items-center gap-2">
            <User size={18} className="text-accent" aria-hidden="true" />
            <h2 className="text-[15px] font-bold text-fg-primary">履修プロファイル</h2>
          </div>
          <div className="overflow-hidden rounded border border-border-primary">
            {profRows.map((row, i) => (
              <div
                key={row.label}
                className={`flex items-center justify-between h-11 px-4 ${
                  i % 2 === 0 ? "bg-surface-gray" : "bg-surface-primary"
                } ${i < profRows.length - 1 ? "border-b border-border-primary" : ""}`}
              >
                <span className="text-[13px] text-fg-secondary">{row.label}</span>
                <span className="font-mono text-[13px] font-semibold text-fg-primary">{row.value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 取り込み済みデータ */}
        <section className="flex flex-col gap-4 rounded-lg border border-border-primary bg-surface-primary p-6">
          <div className="flex items-center gap-2">
            <FileCheck size={18} className="text-accent" aria-hidden="true" />
            <h2 className="text-[15px] font-bold text-fg-primary">取り込み済みデータ</h2>
          </div>
          <div className="flex items-center justify-between gap-3 rounded border border-border-primary bg-surface-gray p-3.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <FileText size={20} className="shrink-0 text-accent" aria-hidden="true" />
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="truncate text-[13px] font-semibold text-fg-primary">
                  成績表_2024.pdf
                </span>
                <span className="text-[11px] text-fg-secondary">
                  {profile.completedCourses.length}科目を認識・ブラウザ内で保持中
                </span>
              </div>
            </div>
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-1.5 h-9 px-3.5 rounded border border-fg-primary text-fg-primary hover:bg-surface-soft transition-colors shrink-0"
            >
              <RotateCcw size={14} />
              <span className="text-[13px] font-semibold">再取り込み</span>
            </button>
          </div>
        </section>

        function CourseSection({
          title,
          courses,
          unearned = false,
        }: {
          title: string;
          courses: Course[];
          unearned?: boolean;
        }) {
          return (
            <section className="overflow-hidden rounded-xl border border-border-primary bg-surface-primary">
              <div className="px-5 py-3 border-b border-[#E5E7EB] bg-[#F9FAFB]">
                <h2 className="text-sm font-semibold text-fg-primary">{title}</h2>
              </div>
              <div className="divide-y divide-[#F3F4F6]">
                {courses.map((course) => (
                  <div
                    key={`${course.title}-${course.year}-${course.term}`}
                    className="flex items-center justify-between px-5 py-3 gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-fg-primary">{course.title}</p>
                      <p className="mt-0.5 text-xs text-fg-faint">
                        {course.year}年度 {course.term}
                        {course.code ? ` · ${course.code}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-fg-tertiary">{course.credits}単位</span>
                      {course.rawScore && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-center text-xs font-semibold ${
                            unearned ? "bg-[#FEE2E2] text-[#991B1B]" : "bg-[#EFF6FF] text-fg-primary"
                          }`}
                        >
                          {course.rawScore}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        }

        {/* デモモード */}
        <section className="flex flex-col gap-4 rounded-lg border border-border-primary bg-surface-primary p-6">
          <div className="flex items-center gap-2">
            <Monitor size={18} className="text-accent" aria-hidden="true" />
            <h2 className="text-[15px] font-bold text-fg-primary">デモモード</h2>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-semibold text-fg-primary">展示用ダミーデータを使用</span>
              <span className="text-[11px] text-fg-secondary">
                龍谷祭の展示端末ではPDF取り込みを無効化します
              </span>
            </div>
            <button
              role="switch"
              aria-checked={demoMode}
              onClick={handleDemoToggle}
              className={`w-11 h-6 rounded-full p-0.5 flex items-center transition-colors shrink-0 ${
                demoMode ? "justify-end bg-accent" : "justify-start bg-border-primary"
              }`}
            >
              <span className="size-5 rounded-full bg-surface-primary shadow-sm" />
            </button>
          </div>
          {demoMode && (
            <select
              value={demoIndex}
              onChange={(e) => handleDemoSelect(Number(e.target.value))}
              className="w-full rounded border border-border-primary bg-surface-gray px-3 py-2 text-[13px] text-fg-primary focus:border-fg-primary focus:outline-none"
            >
              {DUMMY_PROFILES.map((p, i) => (
                <option key={i} value={i}>{p.label}</option>
              ))}
            </select>
          )}
        </section>

        {/* Danger zone */}
        <section className="flex flex-col gap-3.5 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-6">
          <div className="flex items-center gap-2">
            <TriangleAlert size={18} className="text-accent" aria-hidden="true" />
            <h2 className="text-[15px] font-bold text-accent">データのリセット</h2>
          </div>
          <div className="flex items-center justify-between gap-4">
            <p className="max-w-[480px] text-xs leading-[1.6] text-fg-secondary">
              取り込んだ成績・対話履歴をすべて消去し、初期状態に戻します。この操作は取り消せません。
            </p>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 h-10 rounded bg-accent px-5 hover:bg-primary-dark transition-colors shrink-0"
            >
              <Trash2 size={15} className="text-fg-inverse" aria-hidden="true" />
              <span className="text-[13px] font-semibold text-fg-inverse">すべて消去</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function CourseSection({
  title,
  courses,
  unearned = false,
}: {
  title: string;
  courses: Course[];
  unearned?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border-primary bg-surface-primary">
      <div className="px-5 py-3 border-b border-[#E5E7EB] bg-[#F9FAFB]">
        <h2 className="text-sm font-semibold text-fg-primary">{title}</h2>
      </div>
      <div className="divide-y divide-[#F3F4F6]">
        {courses.map((course) => (
          <div
            key={`${course.title}-${course.year}-${course.term}`}
            className="flex items-center justify-between px-5 py-3 gap-3"
          >
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-fg-primary">{course.title}</p>
              <p className="mt-0.5 text-xs text-fg-faint">
                {course.year}年度 {course.term}
                {course.code ? ` · ${course.code}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs text-fg-tertiary">{course.credits}単位</span>
              {course.rawScore && (
                <span
                  className={`rounded px-1.5 py-0.5 text-center text-xs font-semibold ${
                    unearned ? "bg-[#FEE2E2] text-[#991B1B]" : "bg-[#EFF6FF] text-fg-primary"
                  }`}
                >
                  {course.rawScore}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
