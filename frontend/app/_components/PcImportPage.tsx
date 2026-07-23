"use client";

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Lock, WifiOff, Trash2, Upload, Play, AlertCircle, Loader2 } from "lucide-react";
import StepItem from "./StepItem";
import PrivacyConsentModal from "./PrivacyConsentModal";
import { useStudentStore } from "@/lib/student";
import { DUMMY_PROFILES } from "@/lib/dummy/profiles";

type ImportState =
  | { type: "idle" }
  | { type: "consent"; file: File }
  | { type: "parsing" }
  | { type: "error"; message: string };

export default function PcImportPage() {
  const router = useRouter();
  const setProfile = useStudentStore((s) => s.setProfile);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importState, setImportState] = useState<ImportState>({ type: "idle" });
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDemoLoad = () => {
    setProfile(DUMMY_PROFILES[0].profile);
    router.push("/mydata");
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
    // 同じファイルを再選択できるようリセット
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

      setProfile(profile);
      router.push("/mydata");
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

  return (
    <>
      {importState.type === "consent" && (
        <PrivacyConsentModal
          onAccept={handleConsentAccept}
          onCancel={handleConsentCancel}
        />
      )}

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
          {/* Step bar */}
          <div className="flex items-center w-[480px]">
            <StepItem num={1} label="アップロード" active />
            <div className="w-[60px] h-px bg-[#D1D5DB]" />
            <StepItem num={2} label="確認" active={false} />
            <div className="w-[60px] h-px bg-[#D1D5DB]" />
            <StepItem num={3} label="完了" active={false} />
          </div>

          {/* Form card */}
          <div className="w-[480px] bg-white rounded-xl border border-[#E5E7EB] p-8 flex flex-col gap-6">
            <div>
              <h3 className="text-[#1A2B4E] text-base font-bold">成績表PDFを選択</h3>
            </div>

            {/* Upload zone */}
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
    </>
  );
}
