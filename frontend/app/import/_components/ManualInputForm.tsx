"use client";

import { useState } from "react";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import { isUnearned, type StudentProfile, type Course, type CourseTerm } from "@/lib/student";
// 課程の正本は `curricula/admission-<年度>/` の課程ファイル（design.md §4.4.2）。
// 履修要項を引けない課程名を選ばせないため、一覧はそこから引く
import { PROGRAM_NAMES as PROGRAMS, getAdmissionYear } from "@/lib/programs";

const TERMS: CourseTerm[] = ["前期", "後期", "通年", "1Q", "2Q", "3Q", "4Q", "サ集"];
const CREDIT_OPTIONS = [1, 2, 3, 4, 6, 8];
const YEARS = Array.from({ length: 7 }, (_, i) => 2026 - i);

type CourseFormState = {
  title: string;
  credits: number;
  year: number;
  term: CourseTerm;
};

const DEFAULT_COURSE: CourseFormState = { title: "", credits: 2, year: 2025, term: "前期" };

interface Props {
  initialProfile?: StudentProfile;
  mode?: "create" | "edit";
  onComplete: (profile: StudentProfile) => void;
  onCancel: () => void;
}

export default function ManualInputForm({
  initialProfile,
  mode = "create",
  onComplete,
  onCancel,
}: Props) {
  const [grade, setGrade] = useState<1 | 2 | 3 | 4 | null>(initialProfile?.grade ?? null);
  const [program, setProgram] = useState(initialProfile?.program ?? "");
  const [courses, setCourses] = useState<Course[]>(initialProfile?.completedCourses ?? []);
  // PDF から読んだ入学年度は学年が変わらない限り引き継ぐ。
  // 毎回 getAdmissionYear() で再計算すると、過年度の成績表を取り込んだ場合や
  // 年度をまたいで開き直した場合に正確な値が失われる。
  const initialGrade = initialProfile?.grade ?? null;
  const initialAdmissionYear = initialProfile?.admissionYear ?? null;
  const [addingCourse, setAddingCourse] = useState(false);
  const [courseForm, setCourseForm] = useState<CourseFormState>(DEFAULT_COURSE);
  const [errors, setErrors] = useState<{ grade?: boolean; program?: boolean }>({});

  // 成績表から取り込んだ一覧には不合格・履修辞退も並ぶ。
  // 単位に数えるのは合格したものだけ(要件§4.2)。手入力で足した科目は合格扱い。
  const totalCredits = courses
    .filter((c) => c.status === "passed")
    .reduce((s, c) => s + c.credits, 0);

  const handleSubmit = () => {
    const e: typeof errors = {};
    if (!grade) e.grade = true;
    if (!program) e.program = true;
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    const admissionYear =
      grade === initialGrade && initialAdmissionYear !== null
        ? initialAdmissionYear
        : grade !== null ? getAdmissionYear(grade) : null;
    onComplete({ grade, program, completedCourses: courses, admissionYear });
  };

  const handleAddCourse = () => {
    if (!courseForm.title.trim()) return;
    setCourses((prev) => [
      ...prev,
      { title: courseForm.title.trim(), credits: courseForm.credits, year: courseForm.year, term: courseForm.term, status: "passed" },
    ]);
    setCourseForm(DEFAULT_COURSE);
    setAddingCourse(false);
  };

  const removeCourse = (index: number) => setCourses((prev) => prev.filter((_, i) => i !== index));

  return (
    <div className="flex flex-col bg-white min-h-full">
      <header className="sticky top-0 z-20 flex items-center gap-3 px-5 h-14 bg-white border-b border-[#D1D5DB]">
        <button onClick={onCancel} aria-label="戻る" className="-ml-1.5">
          <ChevronLeft size={22} className="text-[#1A2B4E]" />
        </button>
        <span className="text-[#1A2B4E] text-lg font-bold">
          {mode === "edit" ? "学生情報を編集" : "手入力で登録"}
        </span>
      </header>

      <div className="flex flex-col overflow-y-auto">
        {/* 学年 */}
        <section className="px-5 pt-5 pb-4 border-b border-[#E5E7EB]">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-[13px] font-bold text-[#1A2B4E]">学年</h2>
            {errors.grade && <span className="text-[11px] text-[#DC2626]">選択してください</span>}
          </div>
          <div className="flex gap-2">
            {([1, 2, 3, 4] as const).map((g) => (
              <button
                key={g}
                onClick={() => { setGrade(g); setErrors((e) => ({ ...e, grade: false })); }}
                className={`flex-1 h-11 rounded-lg border-2 text-sm font-bold transition-colors ${
                  grade === g
                    ? "border-[#1A2B4E] bg-[#1A2B4E] text-white"
                    : errors.grade
                    ? "border-[#DC2626] text-[#DC2626]"
                    : "border-[#D1D5DB] text-[#4B5563] active:bg-[#F3F4F6]"
                }`}
              >
                {g}回生
              </button>
            ))}
          </div>
        </section>

        {/* 課程 */}
        <section className="px-5 pt-4 pb-4 border-b border-[#E5E7EB]">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-[13px] font-bold text-[#1A2B4E]">課程</h2>
            {errors.program && <span className="text-[11px] text-[#DC2626]">選択してください</span>}
          </div>
          <div className="flex flex-col gap-1.5">
            {PROGRAMS.map((p) => (
              <button
                key={p}
                onClick={() => { setProgram(p); setErrors((e) => ({ ...e, program: false })); }}
                className={`w-full h-11 px-4 rounded-lg border-2 text-sm font-semibold text-left transition-colors ${
                  program === p
                    ? "border-[#1A2B4E] bg-[#EEF0F5] text-[#1A2B4E]"
                    : errors.program
                    ? "border-[#DC2626] text-[#DC2626]"
                    : "border-[#E5E7EB] text-[#4B5563] active:bg-[#F8F9FA]"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </section>

        {/* 科目一覧。編集時は成績表から取り込んだ未修得の科目も並ぶ */}
        <section className="px-5 pt-4 pb-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-bold text-[#1A2B4E]">
              {mode === "edit" ? "取り込んだ科目" : "修得科目"}
              <span className="ml-2 text-[11px] font-normal text-[#9CA3AF]">
                {courses.length}科目 · 修得{totalCredits}単位
              </span>
            </h2>
            <span className="text-[11px] text-[#9CA3AF]">任意</span>
          </div>

          {courses.length > 0 && (
            <div className="mb-3 rounded-lg border border-[#E5E7EB] overflow-hidden">
              {courses.map((c, i) => (
                <div
                  key={`${c.title}-${i}`}
                  className={`flex items-center gap-2.5 h-12 px-3.5 border-b border-[#F3F4F6] last:border-b-0 ${
                    i % 2 === 0 ? "bg-white" : "bg-[#F8F9FA]"
                  }`}
                >
                  <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                    <span className="text-[13px] font-semibold text-[#1A2B4E] truncate">{c.title}</span>
                    <span className="text-[10px] text-[#9CA3AF]">
                      {c.year} {c.term} · {c.credits}単位
                    </span>
                  </div>
                  {isUnearned(c) && (
                    <span className="shrink-0 px-1.5 py-0.5 rounded bg-[#FEE2E2] text-[10px] font-bold text-[#991B1B]">
                      未修得
                    </span>
                  )}
                  {c.status === "registered" && (
                    <span className="shrink-0 px-1.5 py-0.5 rounded bg-[#EFF6FF] text-[10px] font-bold text-fg-primary">
                      登録中
                    </span>
                  )}
                  <button
                    onClick={() => removeCourse(i)}
                    aria-label="削除"
                    className="w-8 h-8 flex items-center justify-center rounded-md active:bg-[#FEE2E2] transition-colors"
                  >
                    <Trash2 size={15} className="text-[#EF4444]" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {addingCourse ? (
            <div className="rounded-lg border-2 border-[#1A2B4E] bg-[#F8F9FA] p-4 flex flex-col gap-3">
              <h3 className="text-[13px] font-bold text-[#1A2B4E]">科目を追加</h3>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-[#6B7280]">科目名</label>
                <input
                  type="text"
                  value={courseForm.title}
                  onChange={(e) => setCourseForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="例: 微分積分・演習"
                  className="w-full h-10 px-3 rounded-lg border border-[#D1D5DB] bg-white text-sm text-[#1A2B4E] placeholder:text-[#D1D5DB] focus:outline-none focus:border-[#1A2B4E]"
                />
              </div>

              <div className="flex gap-2">
                <div className="flex flex-col gap-1 w-24">
                  <label className="text-[11px] font-semibold text-[#6B7280]">単位数</label>
                  <select
                    value={courseForm.credits}
                    onChange={(e) => setCourseForm((f) => ({ ...f, credits: Number(e.target.value) }))}
                    className="h-10 px-2 rounded-lg border border-[#D1D5DB] bg-white text-sm text-[#1A2B4E] focus:outline-none focus:border-[#1A2B4E]"
                  >
                    {CREDIT_OPTIONS.map((n) => (
                      <option key={n} value={n}>{n}単位</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-[11px] font-semibold text-[#6B7280]">年度</label>
                  <select
                    value={courseForm.year}
                    onChange={(e) => setCourseForm((f) => ({ ...f, year: Number(e.target.value) }))}
                    className="h-10 px-2 rounded-lg border border-[#D1D5DB] bg-white text-sm text-[#1A2B4E] focus:outline-none focus:border-[#1A2B4E]"
                  >
                    {YEARS.map((y) => (
                      <option key={y} value={y}>{y}年度</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-[11px] font-semibold text-[#6B7280]">学期</label>
                  <select
                    value={courseForm.term}
                    onChange={(e) => setCourseForm((f) => ({ ...f, term: e.target.value as CourseTerm }))}
                    className="h-10 px-2 rounded-lg border border-[#D1D5DB] bg-white text-sm text-[#1A2B4E] focus:outline-none focus:border-[#1A2B4E]"
                  >
                    {TERMS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setCourseForm(DEFAULT_COURSE); setAddingCourse(false); }}
                  className="flex-1 h-9 rounded-lg border border-[#D1D5DB] text-sm text-[#4B5563] active:bg-[#F3F4F6] transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleAddCourse}
                  disabled={!courseForm.title.trim()}
                  className="flex-1 h-9 rounded-lg bg-[#1A2B4E] text-sm font-semibold text-white active:bg-[#111e35] transition-colors disabled:opacity-40"
                >
                  追加する
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingCourse(true)}
              className="w-full h-11 rounded-lg border-2 border-dashed border-[#D1D5DB] flex items-center justify-center gap-2 active:border-[#1A2B4E] active:bg-[#F8F9FA] transition-colors"
            >
              <Plus size={16} className="text-[#6B7280]" />
              <span className="text-sm text-[#6B7280]">科目を追加</span>
            </button>
          )}
        </section>

        {/* Submit */}
        <div className="px-5 pb-10 flex flex-col gap-2 border-t border-[#E5E7EB] pt-4">
          <button
            onClick={handleSubmit}
            className="w-full h-[52px] rounded-lg bg-[#E60012] flex items-center justify-center active:bg-[#b7000c] transition-colors"
          >
            <span className="text-[15px] font-bold text-white">
              {mode === "edit" ? "保存する" : "この内容で続ける"}
            </span>
          </button>
          <button
            onClick={onCancel}
            className="w-full h-11 rounded-lg border border-[#D1D5DB] flex items-center justify-center active:bg-[#F8F9FA] transition-colors"
          >
            <span className="text-sm text-[#4B5563]">キャンセル</span>
          </button>
        </div>
      </div>
    </div>
  );
}
