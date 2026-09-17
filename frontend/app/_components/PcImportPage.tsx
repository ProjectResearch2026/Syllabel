"use client";

import { useRef, useState, useCallback } from "react";
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
  BookOpen,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import StepBar from "./StepBar";
import PrivacyConsentModal from "./PrivacyConsentModal";
import { useStudentStore, type StudentProfile } from "@/lib/student";
import { DUMMY_PROFILES } from "@/lib/dummy/profiles";

const TERM_PLANNED_CREDITS = 18;
const GRADUATION_CREDITS = 124;

type ImportState =
  | { type: "idle" }
  | { type: "consent"; file: File }
  | { type: "parsing" }
  | { type: "error"; message: string };

export default function PcImportPage() {
  const router = useRouter();
  const setProfile = useStudentStore((s) => s.setProfile);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [pending, setPending] = useState<StudentProfile | null>(null);
  const [fileName, setFileName] = useState("");
  const [importState, setImportState] = useState<ImportState>({ type: "idle" });
  const [isDragOver, setIsDragOver] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  const stage = (profile: StudentProfile, name?: string) => {
    setPending(profile);
    if (name) setFileName(name);
    setStep(1);
  };

  const handleDemoLoad = (index: number) => {
    setDemoOpen(false);
    stage(DUMMY_PROFILES[index].profile, `デモ: ${DUMMY_PROFILES[index].label}`);
  };

  const handleFileSelect = useCallback((file: File) => {
    if (file.type !== "application/pdf") {
      setImportState({ type: "error", message: "PDFファイルを選択してください。" });
      return;
    }
    setImportState({ type: "consent", file });
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleConsentAccept = async () => {
    if (importState.type !== "consent") return;

    const file = importState.file;
    setImportState({ type: "parsing" });

    try {
      const { parseGradeReport } = await import("@/lib/pdf/parseGradeReport");
      const { profile, warnings } = await parseGradeReport(file);

      if (profile.completedCourses.length === 0 && warnings.length > 0) {
        setImportState({
          type: "error",
          message: "成績表を読み取れませんでした。手入力でご入力ください。",
        });
        return;
      }

      setImportState({ type: "idle" });
      stage(profile, file.name);
    } catch {
      setImportState({
        type: "error",
        message: "PDFの読み取りに失敗しました。手入力に切り替えてください。",
      });
    }
  };

  const handleConsentCancel = () => setImportState({ type: "idle" });

  const handleRetry = () => {
    setImportState({ type: "idle" });
    fileInputRef.current?.click();
  };

  // 取り込みは不合格・履修辞退も含む全科目。単位に数えるのは合格したものだけ(要件§4.2)
  const passedCourses =
    pending?.completedCourses.filter((c) => c.status === "passed") ?? [];
  const totalCredits = passedCourses.reduce((sum, c) => sum + c.credits, 0);
  const remaining = Math.max(0, GRADUATION_CREDITS - totalCredits);
  // 不合格と履修辞退は「未修得」に丸める(設計書 §6.1。再履修の対象として同じ扱い)
  const unearnedCount =
    (pending?.completedCourses.length ?? 0) - passedCourses.length;

  const handleConfirm = () => {
    if (pending) setProfile(pending);
    setStep(2);
  };

  if (step === 0) {
    return (
      <>
        {importState.type === "consent" && (
          <PrivacyConsentModal
            onAccept={handleConsentAccept}
            onCancel={handleConsentCancel}
          />
        )}

        <div className="flex flex-1 min-h-[calc(100vh-60px)]">
          <div className="w-[480px] shrink-0 bg-white flex flex-col items-center justify-center gap-8 px-[60px] py-[60px]">
            <div className="flex flex-col items-center gap-5">
              <ShieldCheck size={64} className="text-[#1A2B4E]" />
              <div className="flex flex-col items-center gap-3">
                <h2 className="text-[#1A2B4E] text-[22px] font-bold text-center w-[320px]">
                  安心のプライバシー設計
                </h2>
                <p className="text-[#4c5663] text-sm text-center leading-[1.7] w-[320px]">
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
                  <Icon size={16} className="text-[#1a2c4f] shrink-0" />
                  <span className="text-[#4c5663] text-[13px]">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 bg-[#F8F9FA] flex flex-col items-center justify-center gap-8 px-[80px] py-[48px]">
            <StepBar current={0} />

            <div className="w-[480px] bg-white rounded-xl border border-[#D1D5DB] p-8 flex flex-col gap-6">
              <h3 className="text-[#1A2B4E] text-base font-bold">成績表PDFを選択</h3>

              {importState.type === "parsing" ? (
                <div className="w-full h-[160px] bg-[#FAFAFA] rounded-lg border border-[#D1D5DB] flex flex-col items-center justify-center gap-3">
                  <Loader2 size={32} className="text-[#1A2B4E] animate-spin" />
                  <p className="text-[#6B7280] text-sm">PDFを読み取っています…</p>
                </div>
              ) : importState.type === "error" ? (
                <div className="w-full h-[160px] bg-[#FFF8F8] rounded-lg border border-[#FCA5A5] flex flex-col items-center justify-center gap-3 px-6 text-center">
                  <AlertCircle size={28} className="text-[#EF4444]" />
                  <p className="text-[#EF4444] text-sm font-medium">{importState.message}</p>
                  <button
                    onClick={handleRetry}
                    className="text-xs text-[#1A2B4E] underline underline-offset-2"
                  >
                    もう一度選択する
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`w-full h-[160px] rounded-lg border flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${
                    isDragOver
                      ? "bg-[#EEF1F8] border-[#1A2B4E]"
                      : "bg-[#FAFAFA] border-[#D1D5DB] hover:border-[#1A2B4E]"
                  }`}
                >
                  <div className="w-12 h-12 rounded-full bg-[#1A2B4E] flex items-center justify-center">
                    <Upload size={22} className="text-white" />
                  </div>
                  <p className="text-[#1A2B4E] text-sm font-semibold text-center w-[360px]">
                    PDFファイルをクリックして選択 またはドラッグ&ドロップ
                  </p>
                  <p className="text-[#6B7280] text-xs text-center w-[360px]">
                    龍谷大学ポータルからダウンロードした成績表PDF
                  </p>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleInputChange}
              />

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-[#E5E7EB]" />
                <span className="text-[#9CA3AF] text-xs">または</span>
                <div className="flex-1 h-px bg-[#E5E7EB]" />
              </div>

              <div className="relative">
                <button
                  onClick={() => setDemoOpen((o) => !o)}
                  className="w-full h-11 rounded-lg border border-[#1A2B4E] flex items-center justify-center gap-2 hover:bg-[#EEF1F8] transition-colors"
                >
                  <Play size={16} className="text-[#1A2B4E]" />
                  <span className="text-[#1A2B4E] text-sm font-semibold">
                    ダミーデータで試す（展示用）
                  </span>
                  {demoOpen ? (
                    <ChevronUp size={15} className="text-[#1A2B4E]" />
                  ) : (
                    <ChevronDown size={15} className="text-[#1A2B4E]" />
                  )}
                </button>
                {demoOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#D1D5DB] rounded-lg shadow-md overflow-hidden z-10">
                    {DUMMY_PROFILES.map((p, i) => (
                      <button
                        key={p.label}
                        onClick={() => handleDemoLoad(i)}
                        className="w-full h-11 px-4 flex items-center gap-2 text-left hover:bg-[#EEF1F8] transition-colors border-b border-[#E5E7EB] last:border-b-0"
                      >
                        <span className="text-[#1A2B4E] text-sm">{p.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (step === 1) {
    const rows = [
      { label: "学年", value: `${pending?.grade ?? "-"}回生` },
      { label: "課程", value: pending?.program ?? "-" },
      { label: "取得済み単位", value: `${totalCredits}単位` },
      { label: "判定科目数", value: `${passedCourses.length}科目` },
      // 未修得は単位に数えないが、再履修の提案に使うので取り込んだことを見せる
      ...(unearnedCount > 0
        ? [{ label: "未修得科目（再履修の対象）", value: `${unearnedCount}科目` }]
        : []),
    ];
    return (
      <div className="flex-1 bg-[#F8F9FA] flex flex-col items-center justify-center gap-8 px-[80px] py-[48px]">
        <StepBar current={1} />

        <div className="w-[480px] flex flex-col gap-4">
          <h3 className="text-[#1A2B4E] text-base font-bold">取り込み内容の確認</h3>

          <div className="bg-white rounded-lg border border-[#D1D5DB] overflow-hidden">
            <div className="flex items-center justify-between h-12 px-4 border-b border-[#E5E7EB]">
              <div className="flex items-center gap-2">
                <FileCheck size={18} className="text-[#E60012]" />
                <span className="text-[#1A2B4E] text-[13px] font-semibold">{fileName}</span>
              </div>
              <span className="bg-[#D1FAE5] text-[#065F46] text-[11px] font-semibold rounded px-2 py-0.5">
                読み込み完了
              </span>
            </div>

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

      {/* 取り込み後の行き先は履修提案だけではない。**シラバス検索も同じ画面から出す**
          (§8)。取り込んだプロファイルは検索結果のタグ付けに効くため、ここが
          タグ付きのシラバス検索への入口になる */}
      <div className="flex w-[520px] flex-col gap-3">
        <button
          onClick={() => router.push("/proposal")}
          className="h-12 rounded bg-[#E60012] flex items-center justify-center gap-2 hover:bg-[#b7000c] transition-colors"
        >
          <span className="text-white text-[15px] font-bold">履修提案を見る</span>
          <ArrowRight size={18} className="text-white" />
        </button>
        <button
          onClick={() => router.push("/syllabus")}
          className="h-12 rounded border border-[#1A2B4E] bg-white flex items-center justify-center gap-2 hover:bg-[#EEF1F8] transition-colors"
        >
          <BookOpen size={18} className="text-[#1A2B4E]" />
          <span className="text-[#1A2B4E] text-[15px] font-bold">シラバスを検索する</span>
        </button>
      </div>
    </div>
  );
}
