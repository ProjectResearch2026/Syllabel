"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Info,
  ShieldCheck,
  ArrowUpRight,
  FileUp,
  CirclePlay,
  FileCheck,
  TriangleAlert,
  CircleCheck,
  MessageCircle,
  CalendarDays,
  Check,
} from "lucide-react";
import { useStudentStore, type StudentProfile } from "@/lib/student";
import { DUMMY_PROFILES } from "@/lib/dummy/profiles";

const GRADUATION_CREDITS = 124;
const STEPS = ["アップロード", "確認", "完了"] as const;
const FAIL_GRADES = ["D", "E", "F", "不可", "×"];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-between px-5 h-12 bg-white border-b border-[#D1D5DB]">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const on = done || active;
        return (
          <Fragment key={label}>
            <div className="flex items-center gap-1.5 px-2">
              <div
                className={`w-[22px] h-[22px] rounded-full flex items-center justify-center ${
                  on ? "bg-[#1A2B4E]" : "bg-[#E5E7EB]"
                }`}
              >
                {done ? (
                  <Check size={12} className="text-white" strokeWidth={3} />
                ) : (
                  <span className={`text-[11px] font-bold font-mono ${active ? "text-white" : "text-[#9CA3AF]"}`}>
                    {i + 1}
                  </span>
                )}
              </div>
              <span
                className={`text-xs ${
                  active ? "text-[#1A2B4E] font-semibold" : on ? "text-[#1A2B4E]" : "text-[#9CA3AF]"
                }`}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && <div className="flex-1 h-px bg-[#D1D5DB] mx-1" />}
          </Fragment>
        );
      })}
    </div>
  );
}

export default function MobileImportFlow() {
  const router = useRouter();
  const setProfile = useStudentStore((s) => s.setProfile);

  const [step, setStep] = useState(0);
  const [pending, setPending] = useState<StudentProfile | null>(null);
  const [fileName, setFileName] = useState("成績表_2024.pdf");

  const stage = (profile: StudentProfile, name?: string) => {
    setPending(profile);
    if (name) setFileName(name);
    setStep(1);
  };

  const handleDemoLoad = () => stage(DUMMY_PROFILES[0].profile);
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stage(DUMMY_PROFILES[0].profile, file.name);
  };

  const totalCredits = pending?.completedCourses.reduce((sum, c) => sum + c.credits, 0) ?? 0;
  const remaining = Math.max(0, GRADUATION_CREDITS - totalCredits);
  const courses = pending?.completedCourses ?? [];
  const failCourses = courses.filter((c) => FAIL_GRADES.includes(c.grade));

  const handleConfirm = () => {
    if (pending) setProfile(pending);
    setStep(2);
  };

  return (
    <div className="flex flex-col bg-white min-h-full">
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-5 h-14 bg-white border-b border-[#D1D5DB]">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/mydata")} aria-label="戻る" className="-ml-1.5">
            <ChevronLeft size={22} className="text-[#1A2B4E]" />
          </button>
          <span className="text-[#1A2B4E] text-lg font-bold">成績表インポート</span>
        </div>
        <Info size={22} className="text-[#6B7280]" />
      </header>

      <StepBar current={step} />

      {/* ── Step 0: アップロード ── */}
      {step === 0 && (
        <>
          <div className="flex items-start gap-2.5 px-4 py-3 bg-[#F8F9FA] border-l-[3px] border-[#E60012]">
            <ShieldCheck size={18} className="text-[#E60012] shrink-0 mt-px" />
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-semibold text-[#1A2B4E]">
                データは学内サーバーのみで処理されます
              </span>
              <span className="text-[11px] text-[#4B5563] leading-relaxed">
                アップロードした成績表はブラウザ上でのみ保持され、外部のAIサービスには送信されません。ページを閉じると即時消去されます。
              </span>
              <button
                onClick={() => router.push("/privacy")}
                className="flex items-center gap-1 text-[11px] text-[#E60012] mt-0.5"
              >
                プライバシーポリシーを確認
                <ArrowUpRight size={12} />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-5 p-5">
            <h2 className="text-[15px] font-bold text-[#1A2B4E]">成績表PDFを選択</h2>

            <label className="w-full h-[180px] bg-[#FAFAFA] rounded-lg border-2 border-dashed border-[#D1D5DB] flex flex-col items-center justify-center gap-3 cursor-pointer active:border-[#1A2B4E] transition-colors">
              <input type="file" accept="application/pdf" className="hidden" onChange={handleFile} />
              <div className="w-14 h-14 rounded-full bg-[#EEF0F5] flex items-center justify-center">
                <FileUp size={28} className="text-[#1A2B4E]" />
              </div>
              <span className="text-sm font-semibold text-[#1A2B4E]">PDFファイルをタップして選択</span>
              <span className="text-xs text-[#4B5563] text-center leading-relaxed">
                龍谷大学ポータルから
                <br />
                ダウンロードした成績表PDF
              </span>
            </label>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-[#E5E7EB]" />
              <span className="text-xs text-[#9CA3AF]">または</span>
              <div className="flex-1 h-px bg-[#E5E7EB]" />
            </div>

            <button
              onClick={handleDemoLoad}
              className="w-full h-12 rounded-lg border-2 border-[#1A2B4E] flex items-center justify-center gap-2.5 active:bg-[#EEF1F8] transition-colors"
            >
              <CirclePlay size={18} className="text-[#1A2B4E]" />
              <span className="text-sm font-semibold text-[#1A2B4E]">ダミーデータで試す（展示用）</span>
            </button>

            <h2 className="text-[15px] font-bold text-[#1A2B4E] mt-1">インポート方法</h2>
            {[
              { title: "ポータルにアクセス", desc: "龍谷大学ポータルサイト (kukuli) にログイン" },
              { title: "成績照会を開く", desc: "「成績照会」→「成績表印刷」からPDFをダウンロード" },
              { title: "このページで選択", desc: "ダウンロードしたPDFを上のボタンから選択" },
            ].map((s, i) => (
              <div key={s.title} className="flex items-start gap-3.5">
                <div className="w-8 h-8 rounded-md bg-[#1A2B4E] flex items-center justify-center shrink-0">
                  <span className="text-white text-sm font-bold font-mono">{i + 1}</span>
                </div>
                <div className="flex flex-col gap-0.5 pt-0.5">
                  <span className="text-[13px] font-semibold text-[#1A2B4E]">{s.title}</span>
                  <span className="text-xs text-[#4B5563]">{s.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Step 1: 確認 ── */}
      {step === 1 && (
        <div className="flex flex-col gap-5 p-5">
          <h2 className="text-[15px] font-bold text-[#1A2B4E]">取り込み内容の確認</h2>

          <div className="rounded-lg border border-[#D1D5DB] overflow-hidden">
            {/* Card header */}
            <div className="flex items-center justify-between h-11 px-3.5 border-b border-[#D1D5DB]">
              <div className="flex items-center gap-2 min-w-0">
                <FileCheck size={18} className="text-[#E60012] shrink-0" />
                <span className="text-[13px] font-semibold text-[#1A2B4E] truncate">{fileName}</span>
              </div>
              <span className="shrink-0 px-2 py-[3px] rounded bg-[#D1FAE5] text-[10px] font-semibold text-[#065F46]">
                読み込み完了
              </span>
            </div>

            {/* Summary rows */}
            {[
              { label: "学年", value: `${pending?.grade ?? "-"}回生` },
              { label: "課程", value: pending?.program ?? "-" },
              { label: "取得単位数", value: `${totalCredits}単位` },
              { label: "登録科目数", value: `${courses.length}科目` },
            ].map((r, i) => (
              <div
                key={r.label}
                className={`flex items-center justify-between h-[38px] px-3.5 border-b border-[#E5E7EB] ${
                  i % 2 === 0 ? "bg-[#F8F9FA]" : "bg-white"
                }`}
              >
                <span className="text-xs text-[#4B5563]">{r.label}</span>
                <span className="text-[13px] font-semibold text-[#1A2B4E] font-mono">{r.value}</span>
              </div>
            ))}

            {/* Course preview */}
            <div className="flex items-center justify-between h-9 px-3.5 bg-[#EEF0F5] border-b border-[#E5E7EB]">
              <span className="text-[11px] font-semibold text-[#4B5563]">取り込まれた科目（一部）</span>
              <span className="text-[11px] text-[#E60012] font-mono">全{courses.length}件 →</span>
            </div>
            {courses.slice(0, 5).map((c, i) => {
              const fail = FAIL_GRADES.includes(c.grade);
              return (
                <div
                  key={c.code}
                  className={`flex items-center gap-2.5 h-11 px-3.5 border-b border-[#E5E7EB] last:border-b-0 ${
                    i % 2 === 0 ? "bg-white" : "bg-[#F8F9FA]"
                  }`}
                >
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                      fail ? "bg-[#FEE2E2] text-[#991B1B]" : "bg-[#D1FAE5] text-[#065F46]"
                    }`}
                  >
                    {c.grade}
                  </span>
                  <span className="flex-1 text-xs font-semibold text-[#1A2B4E] truncate">{c.title}</span>
                </div>
              );
            })}
          </div>

          {/* Warning */}
          {failCourses.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-[#FFF3CD] border-l-[3px] border-[#F59E0B] rounded-r">
              <TriangleAlert size={16} className="text-[#F59E0B] shrink-0" />
              <span className="flex-1 text-[11px] text-[#92400E]">
                不合格科目（{failCourses.map((c) => c.title).join("・")}）が{failCourses.length}件含まれています。再履修の提案に活用されます。
              </span>
            </div>
          )}

          {/* Buttons */}
          <button
            onClick={handleConfirm}
            className="w-full h-[52px] rounded-lg bg-[#E60012] flex items-center justify-center gap-2 active:bg-[#b7000c] transition-colors"
          >
            <CircleCheck size={20} className="text-white" />
            <span className="text-[15px] font-bold text-white">この内容でインポートする</span>
          </button>
          <button
            onClick={() => setStep(0)}
            className="w-full h-11 rounded-lg border border-[#D1D5DB] flex items-center justify-center active:bg-[#F8F9FA] transition-colors"
          >
            <span className="text-sm text-[#4B5563]">キャンセル</span>
          </button>
        </div>
      )}

      {/* ── Step 2: 完了 ── */}
      {step === 2 && (
        <div className="flex flex-col">
          <div className="flex flex-col items-center gap-4 px-6 pt-12 pb-8">
            <div className="w-20 h-20 rounded-full bg-[#EEF0F5] flex items-center justify-center">
              <CircleCheck size={40} className="text-[#E60012]" />
            </div>
            <h2 className="text-[22px] font-bold text-[#1A2B4E]">インポート完了！</h2>
            <p className="text-sm text-[#4B5563] text-center leading-relaxed">
              成績データが正常に取り込まれました
              <br />
              AIアシスタントが分析を開始できます
            </p>
          </div>

          <div className="flex items-center justify-around h-20 bg-[#F8F9FA] border-y border-[#E5E7EB]">
            {[
              { val: totalCredits, label: "取得済み単位" },
              { val: remaining, label: "卒業残り単位" },
            ].map((s) => (
              <div key={s.label} className="flex flex-col items-center gap-1">
                <span className="text-[22px] font-bold font-mono text-[#1A2B4E]">{s.val}</span>
                <span className="text-[10px] text-[#6B7280]">{s.label}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 px-5 pt-6 pb-5">
            <h2 className="text-[15px] font-bold text-[#1A2B4E]">次のステップ</h2>

            <button
              onClick={() => router.push("/chat")}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-lg bg-[#E60012] text-left"
            >
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <MessageCircle size={20} className="text-white" />
              </div>
              <div className="flex-1 flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-white">AIに履修相談する</span>
                <span className="text-xs text-white/80">取得単位を元に来期の履修をアドバイス</span>
              </div>
              <ChevronRight size={18} className="text-white shrink-0" />
            </button>

            <button
              onClick={() => router.push("/")}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-lg bg-white border border-[#E5E7EB] text-left"
            >
              <div className="w-10 h-10 rounded-full bg-[#F0FDF4] flex items-center justify-center shrink-0">
                <CalendarDays size={20} className="text-[#059669]" />
              </div>
              <div className="flex-1 flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-[#1A2B4E]">時間割を確認する</span>
                <span className="text-xs text-[#4B5563]">今期の登録科目を時間割で確認</span>
              </div>
              <ChevronRight size={18} className="text-[#9CA3AF] shrink-0" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
