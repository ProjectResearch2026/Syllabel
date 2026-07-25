"use client";

import { useState } from "react";
import { Plus, Trash2, CircleCheck } from "lucide-react";
import type { StudentProfile, Course, CourseTerm } from "@/lib/student";

const PROGRAMS = [
  "知能情報メディア課程",
  "電子情報通信課程",
  "機械工学・ロボティクス課程",
  "環境・応用化学課程",
  "数理・情報科学課程",
  "物質化学課程",
];

const TERMS: CourseTerm[] = ["前期", "後期", "通年", "1Q", "2Q", "3Q", "4Q", "サ集"];

type ManualCourseRow = {
  title: string;
  year: string;
  term: CourseTerm;
  credits: string;
  status: "passed" | "failed";
};

const EMPTY_ROW: ManualCourseRow = {
  title: "",
  year: String(new Date().getFullYear()),
  term: "前期",
  credits: "2",
  status: "passed",
};

export default function ManualInputForm({
  onComplete,
}: {
  onComplete: (profile: StudentProfile) => void;
}) {
  const [grade, setGrade] = useState<"1" | "2" | "3" | "4">("1");
  const [program, setProgram] = useState(PROGRAMS[0]);
  const [rows, setRows] = useState<ManualCourseRow[]>([]);
  const [error, setError] = useState("");

  const addRow = () => setRows((r) => [...r, { ...EMPTY_ROW }]);

  const updateRow = (i: number, patch: Partial<ManualCourseRow>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  const handleSubmit = () => {
    const invalid = rows.find((r) => !r.title.trim());
    if (invalid !== undefined) {
      setError("科目名が空の行があります");
      return;
    }
    setError("");

    const completedCourses: Course[] = rows
      .filter((r) => r.title.trim())
      .map((r) => ({
        title: r.title.trim(),
        year: parseInt(r.year, 10) || new Date().getFullYear(),
        term: r.term,
        credits: parseFloat(r.credits) || 2,
        status: r.status,
      }));

    onComplete({
      grade: parseInt(grade, 10) as 1 | 2 | 3 | 4,
      program,
      completedCourses,
    });
  };

  return (
    <div className="flex flex-col gap-5 px-5 py-5">
      <h2 className="text-[15px] font-bold text-[#1A2B4E]">手入力で続ける</h2>

      {/* Grade + Program */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-[#1A2B4E]">学年</label>
          <div className="flex gap-2">
            {(["1", "2", "3", "4"] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGrade(g)}
                className={`flex-1 h-10 rounded-lg border text-sm font-semibold transition-colors ${
                  grade === g
                    ? "bg-[#1A2B4E] border-[#1A2B4E] text-white"
                    : "bg-white border-[#D1D5DB] text-[#1A2B4E]"
                }`}
              >
                {g}回生
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-[#1A2B4E]">課程</label>
          <select
            value={program}
            onChange={(e) => setProgram(e.target.value)}
            className="w-full h-10 rounded-lg border border-[#D1D5DB] px-3 text-sm text-[#1A2B4E] bg-white focus:outline-none focus:border-[#1A2B4E]"
          >
            {PROGRAMS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Courses */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[#1A2B4E]">修得済み科目（省略可）</span>
          <span className="text-[11px] text-[#6B7280]">{rows.length}件</span>
        </div>

        {rows.length > 0 && (
          <div className="flex flex-col gap-2">
            {rows.map((row, i) => (
              <div key={i} className="rounded-lg border border-[#D1D5DB] overflow-hidden">
                {/* Title row */}
                <div className="flex items-center gap-2 px-3 h-11 border-b border-[#E5E7EB]">
                  <input
                    type="text"
                    value={row.title}
                    onChange={(e) => updateRow(i, { title: e.target.value })}
                    placeholder="科目名"
                    className="flex-1 text-sm text-[#1A2B4E] placeholder-[#9CA3AF] focus:outline-none bg-transparent"
                  />
                  <button
                    onClick={() => removeRow(i)}
                    className="w-7 h-7 flex items-center justify-center rounded text-[#9CA3AF] active:text-[#EF4444] transition-colors"
                    aria-label="削除"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                {/* Detail row */}
                <div className="flex items-center gap-1 px-3 h-10 bg-[#F8F9FA]">
                  <input
                    type="number"
                    value={row.year}
                    onChange={(e) => updateRow(i, { year: e.target.value })}
                    className="w-16 h-7 rounded border border-[#D1D5DB] px-2 text-xs text-[#1A2B4E] bg-white focus:outline-none text-center"
                    placeholder="年度"
                  />
                  <span className="text-xs text-[#6B7280]">年度</span>

                  <select
                    value={row.term}
                    onChange={(e) => updateRow(i, { term: e.target.value as CourseTerm })}
                    className="h-7 rounded border border-[#D1D5DB] px-1 text-xs text-[#1A2B4E] bg-white focus:outline-none"
                  >
                    {TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>

                  <input
                    type="number"
                    value={row.credits}
                    onChange={(e) => updateRow(i, { credits: e.target.value })}
                    className="w-12 h-7 rounded border border-[#D1D5DB] px-2 text-xs text-[#1A2B4E] bg-white focus:outline-none text-center"
                    placeholder="単位"
                    step="0.5"
                    min="0.5"
                  />
                  <span className="text-xs text-[#6B7280]">単位</span>

                  <div className="flex-1" />
                  <div className="flex gap-1">
                    {(["passed", "failed"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => updateRow(i, { status: s })}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                          row.status === s
                            ? s === "passed"
                              ? "bg-[#D1FAE5] text-[#065F46]"
                              : "bg-[#FEE2E2] text-[#991B1B]"
                            : "bg-[#E5E7EB] text-[#9CA3AF]"
                        }`}
                      >
                        {s === "passed" ? "合格" : "不合格"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={addRow}
          className="w-full h-10 rounded-lg border-2 border-dashed border-[#D1D5DB] flex items-center justify-center gap-2 active:border-[#1A2B4E] transition-colors"
        >
          <Plus size={16} className="text-[#4B5563]" />
          <span className="text-sm text-[#4B5563]">科目を追加</span>
        </button>
      </div>

      {error && <p className="text-sm text-[#DC2626]">{error}</p>}

      <button
        onClick={handleSubmit}
        className="w-full h-[52px] rounded-lg bg-[#E60012] flex items-center justify-center gap-2 active:bg-[#b7000c] transition-colors"
      >
        <CircleCheck size={20} className="text-white" />
        <span className="text-[15px] font-bold text-white">この内容で続ける</span>
      </button>
    </div>
  );
}
