"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Lock,
  WifiOff,
  Trash2,
  Upload,
  Play,
  FileCheck,
  ChevronLeft,
  CircleCheck,
  ArrowRight,
} from "lucide-react";
import StepBar from "./StepBar";
import { useStudentStore, type StudentProfile } from "@/lib/student";
import { DUMMY_PROFILES } from "@/lib/dummy/profiles";

const TERM_PLANNED_CREDITS = 18;
const GRADUATION_CREDITS = 124;

export default function PcImportPage() {
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
    // プロトタイプ: PDF解析は未実装のためダミーデータで代替
    stage(DUMMY_PROFILES[0].profile, file.name);
  };

  const totalCredits =
    pending?.completedCourses.reduce((sum, c) => sum + c.credits, 0) ?? 0;
  const remaining = Math.max(0, GRADUATION_CREDITS - totalCredits);

  const handleConfirm = () => {
    if (pending) setProfile(pending);
    setStep(2);
  };

  // ── Step 0: アップロード ──────────────────────────────
  if (step === 0) {
    return (
      <div className="flex flex-1 min-h-[calc(100vh-60px)]">
        {/* Left Panel */}
        <div className="w-[480px] shrink-0 bg-[#1A2B4E] flex flex-col items-center justify-center gap-8 px-[60px] py-[60px]">
          <div className="flex flex-col items-center gap-5">
            <ShieldCheck size={64} className="text-white" />
            <div className="flex flex-col items-center gap-3">
              <h2 className="text-white text-[22px] font-bold text-center w-[320px]">
                安心のプライバシー設計
              </h2>
              <p className="text-[#93A8C4] text-sm text-center leading-[1.7] w-[320px]">
                成績表はブラウザ上でのみ処理されます。外部のAIサービスには送信されず、ページを閉じると即時に消去されます。
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4 w-full">
            {[
              { icon: Lock, label: "学内サーバーのみで処理" },
              { icon: WifiOff, label: "外部AI不使用" },
              { icon: Trash2, label: "閉じると即時消去" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3">
                <Icon size={16} className="text-[#93A8C4] shrink-0" />
                <span className="text-[#D1D5DB] text-[13px]">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right Panel */}
        <div className="flex-1 bg-[#F8F9FA] flex flex-col items-center justify-center gap-8 px-[80px] py-[48px]">
          <StepBar current={0} />

          <div className="w-[480px] bg-white rounded-xl border border-[#D1D5DB] p-8 flex flex-col gap-6">
            <h3 className="text-[#1A2B4E] text-base font-bold">成績表PDFを選択</h3>

            {/* Upload zone */}
            <label className="w-full h-[160px] bg-[#FAFAFA] rounded-lg border border-[#D1D5DB] flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-[#1A2B4E] transition-colors">
              <input type="file" accept="application/pdf" className="hidden" onChange={handleFile} />
              <div className="w-12 h-12 rounded-full bg-[#1A2B4E] flex items-center justify-center">
                <Upload size={22} className="text-white" />
              </div>
              <p className="text-[#1A2B4E] text-sm font-semibold text-center w-[360px]">
                PDFファイルをクリックして選択 またはドラッグ&ドロップ
              </p>
              <p className="text-[#6B7280] text-xs text-center w-[360px]">
                龍谷大学ポータルからダウンロードした成績表PDF
              </p>
            </label>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-[#E5E7EB]" />
              <span className="text-[#9CA3AF] text-xs">または</span>
              <div className="flex-1 h-px bg-[#E5E7EB]" />
            </div>

            <button
              onClick={handleDemoLoad}
              className="w-full h-11 rounded-lg border border-[#1A2B4E] flex items-center justify-center gap-2 hover:bg-[#EEF1F8] transition-colors"
            >
              <Play size={16} className="text-[#1A2B4E]" />
              <span className="text-[#1A2B4E] text-sm font-semibold">
                ダミーデータで試す（展示用）
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 1: 確認 ──────────────────────────────────────
  if (step === 1) {
    const rows = [
      { label: "学年", value: `${pending?.grade ?? "-"}回生` },
      { label: "課程", value: pending?.program ?? "-" },
      { label: "取得済み単位", value: `${totalCredits}単位` },
      { label: "判定科目数", value: `${pending?.completedCourses.length ?? 0}科目` },
    ];
    return (
      <div className="flex-1 bg-[#F8F9FA] flex flex-col items-center justify-center gap-8 px-[80px] py-[48px]">
        <StepBar current={1} />

        <div className="w-[480px] flex flex-col gap-4">
          <h3 className="text-[#1A2B4E] text-base font-bold">取り込み内容の確認</h3>

          <div className="bg-white rounded-lg border border-[#D1D5DB] overflow-hidden">
            {/* Card header */}
            <div className="flex items-center justify-between h-12 px-4 border-b border-[#E5E7EB]">
              <div className="flex items-center gap-2">
                <FileCheck size={18} className="text-[#E60012]" />
                <span className="text-[#1A2B4E] text-[13px] font-semibold">{fileName}</span>
              </div>
              <span className="bg-[#D1FAE5] text-[#065F46] text-[11px] font-semibold rounded px-2 py-0.5">
                読み込み完了
              </span>
            </div>

            {/* Summary rows */}
            {rows.map((row, i) => (
              <div
                key={row.label}
                className={`flex items-center justify-between h-10 px-4 ${
                  i % 2 === 0 ? "bg-[#F8F9FA]" : "bg-white"
                } ${i < rows.length - 1 ? "border-b border-[#E5E7EB]" : ""}`}
              >
                <span className="text-[#4B5563] text-xs">{row.label}</span>
                <span className="text-[#1A2B4E] text-[13px] font-semibold font-mono">
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => setStep(0)}
              className="h-11 px-5 rounded border border-[#1A2B4E] flex items-center justify-center gap-2 hover:bg-[#EEF1F8] transition-colors"
            >
              <ChevronLeft size={16} className="text-[#1A2B4E]" />
              <span className="text-[#1A2B4E] text-sm font-semibold">戻る</span>
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 h-11 rounded bg-[#E60012] flex items-center justify-center hover:bg-[#b7000c] transition-colors"
            >
              <span className="text-white text-sm font-semibold">この内容で取り込む</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: 完了 ──────────────────────────────────────
  const stats = [
    { val: totalCredits, label: "取得済み単位", color: "text-[#1A2B4E]" },
    { val: TERM_PLANNED_CREDITS, label: "今期登録予定", color: "text-[#E60012]" },
    { val: remaining, label: "卒業残り単位", color: "text-[#4B5563]" },
  ];
  return (
    <div className="flex-1 bg-[#F8F9FA] flex flex-col items-center justify-center gap-8 px-[80px] py-[48px]">
      <StepBar current={2} />

      <div className="flex flex-col items-center gap-4">
        <div className="w-20 h-20 rounded-full bg-[#EEF0F5] flex items-center justify-center">
          <CircleCheck size={40} className="text-[#E60012]" />
        </div>
        <h2 className="text-[#1A2B4E] text-2xl font-bold">インポート完了！</h2>
        <p className="text-[#4B5563] text-sm text-center leading-[1.7] w-[360px]">
          成績データが正常に取り込まれました。
          <br />
          AIアシスタントが履修分析を開始できます。
        </p>
      </div>

      <div className="w-[520px] bg-white rounded-lg border border-[#D1D5DB] flex justify-around py-5">
        {stats.map(({ val, label, color }) => (
          <div key={label} className="flex flex-col items-center gap-1">
            <span className={`text-2xl font-bold font-mono ${color}`}>{val}</span>
            <span className="text-[#4B5563] text-[11px]">{label}</span>
          </div>
        ))}
      </div>

      <button
        onClick={() => router.push("/proposal")}
        className="w-[520px] h-12 rounded bg-[#E60012] flex items-center justify-center gap-2 hover:bg-[#b7000c] transition-colors"
      >
        <span className="text-white text-[15px] font-bold">履修提案を見る</span>
        <ArrowRight size={18} className="text-white" />
      </button>
    </div>
  );
}
