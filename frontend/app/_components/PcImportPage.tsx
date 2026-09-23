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
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import StepBar from "./StepBar";
import PrivacyConsentModal from "./PrivacyConsentModal";
import { isUnearned, useStudentStore, type StudentProfile } from "@/lib/student";
import { DUMMY_PROFILES } from "@/lib/dummy/profiles";

/**
 * 成績表の取り込み（ui-design_pc.pen 01〜03_Import）。
 *
 * 3段（アップロード → 確認 → 完了）を1つのコンポーネントで持つ。
 * 1段目だけ左に「なぜ安全か」の説明パネルを置き、2・3段目は中央1カラムにする。
 * **説明を読むのは最初の1回だけ**で、確認や完了の画面で左半分を占め続ける理由が無い。
 */

const TERM_PLANNED_CREDITS = 18;
const GRADUATION_CREDITS = 124;

type ImportState =
  | { type: "idle" }
  | { type: "consent"; file: File }
  | { type: "parsing" }
  | { type: "error"; message: string };

/** グレーの地に浮かぶ中央カラム。2・3段目の骨格 */
function CenterColumn({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 px-16 py-12">
      {children}
    </div>
  );
}

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
  const unearnedCount = pending?.completedCourses.filter(isUnearned).length ?? 0;
  const registeredCount =
    pending?.completedCourses.filter((c) => c.status === "registered").length ?? 0;

  const handleConfirm = () => {
    if (pending) setProfile(pending);
    setStep(2);
  };

  // ---- 1段目: アップロード ----
  if (step === 0) {
    return (
      <>
        {importState.type === "consent" && (
          <PrivacyConsentModal
            onAccept={handleConsentAccept}
            onCancel={handleConsentCancel}
          />
        )}

        <div className="flex min-h-0 flex-1 gap-4">
          {/* 左: なぜ安全か（ui-design_pc.pen LeftPanel） */}
          <div className="flex w-[480px] shrink-0 flex-col items-center justify-center gap-8 rounded-lg bg-surface-primary p-12">
            <div className="flex flex-col items-center gap-5">
              <ShieldCheck size={64} className="text-fg-primary" aria-hidden="true" />
              <div className="flex flex-col items-center gap-3">
                <h2 className="w-80 text-center text-[22px] font-bold text-fg-primary">
                  安心のプライバシー設計
                </h2>
                <p className="w-80 text-center text-sm leading-6 text-fg-secondary">
                  成績表はブラウザ上でのみ処理されます。外部のAIサービスには送信されず、ページを閉じると即時に消去されます。
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {[
                { icon: Lock, label: "学内サーバーのみで処理" },
                { icon: WifiOff, label: "外部AI不使用" },
                { icon: Trash2, label: "閉じると即時消去" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-3">
                  <Icon size={16} className="shrink-0 text-fg-primary" aria-hidden="true" />
                  <span className="text-[13px] text-fg-secondary">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 右: 取り込みフォーム（ui-design_pc.pen RightPanel） */}
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 px-20 py-12">
            <StepBar current={0} />

            <div className="flex w-[480px] flex-col gap-6 rounded-lg border border-border-primary bg-surface-primary p-8">
              <h3 className="text-base font-bold text-fg-primary">成績表PDFを選択</h3>

              {importState.type === "parsing" ? (
                <div className="flex h-40 flex-col items-center justify-center gap-3 rounded border border-border-primary bg-[#FAFAFA]">
                  <Loader2 size={32} className="animate-spin text-fg-primary" aria-hidden="true" />
                  <p className="text-sm text-fg-tertiary">PDFを読み取っています…</p>
                </div>
              ) : importState.type === "error" ? (
                <div className="flex h-40 flex-col items-center justify-center gap-3 rounded border border-[#FCA5A5] bg-[#FFF8F8] px-6 text-center">
                  <AlertCircle size={28} className="text-[#EF4444]" aria-hidden="true" />
                  <p className="text-sm font-medium text-[#EF4444]">{importState.message}</p>
                  <button
                    onClick={handleRetry}
                    className="text-xs text-fg-primary underline underline-offset-2"
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
                  className={`flex h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded border transition-colors ${
                    isDragOver
                      ? "border-fg-primary bg-surface-soft"
                      : "border-border-primary bg-[#FAFAFA] hover:border-fg-primary"
                  }`}
                >
                  <span className="grid size-12 place-items-center rounded-full bg-surface-soft">
                    <Upload size={22} className="text-fg-primary" aria-hidden="true" />
                  </span>
                  <p className="text-center text-sm font-semibold text-fg-primary">
                    PDFファイルをクリックして選択 またはドラッグ&ドロップ
                  </p>
                  <p className="text-center text-xs text-fg-secondary">
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
                <div className="h-px flex-1 bg-[#E5E7EB]" />
                <span className="text-xs text-fg-faint">または</span>
                <div className="h-px flex-1 bg-[#E5E7EB]" />
              </div>

              <div className="relative">
                <button
                  onClick={() => setDemoOpen((o) => !o)}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded border border-fg-primary transition-colors hover:bg-surface-soft"
                >
                  <Play size={16} className="text-fg-primary" aria-hidden="true" />
                  <span className="text-sm font-semibold text-fg-primary">
                    ダミーデータで試す（展示用）
                  </span>
                  {demoOpen ? (
                    <ChevronUp size={15} className="text-fg-primary" aria-hidden="true" />
                  ) : (
                    <ChevronDown size={15} className="text-fg-primary" aria-hidden="true" />
                  )}
                </button>
                {demoOpen && (
                  <div className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded border border-border-primary bg-surface-primary shadow-popover">
                    {DUMMY_PROFILES.map((p, i) => (
                      <button
                        key={p.label}
                        onClick={() => handleDemoLoad(i)}
                        className="flex h-11 w-full items-center gap-2 border-b border-[#E5E7EB] px-4 text-left transition-colors last:border-b-0 hover:bg-surface-soft"
                      >
                        <span className="text-sm text-fg-primary">{p.label}</span>
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

  // ---- 2段目: 確認 ----
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
      // 登録済みで成績未確定。提案の候補から外すので、取り込んだことを見せる
      ...(registeredCount > 0
        ? [{ label: "登録済み科目（成績未確定）", value: `${registeredCount}科目` }]
        : []),
    ];
    return (
      <CenterColumn>
        <StepBar current={1} />

        <div className="flex w-[480px] flex-col gap-4">
          <h3 className="text-base font-bold text-fg-primary">取り込み内容の確認</h3>

          <div className="overflow-hidden rounded-lg border border-border-primary bg-surface-primary">
            <div className="flex h-12 items-center justify-between border-b border-[#E5E7EB] px-4">
              <div className="flex min-w-0 items-center gap-2">
                <FileCheck size={18} className="shrink-0 text-accent" aria-hidden="true" />
                <span className="truncate text-[13px] font-semibold text-fg-primary">
                  {fileName}
                </span>
              </div>
              <span className="shrink-0 rounded bg-[#D1FAE5] px-2 py-[3px] text-[11px] font-semibold text-[#065F46]">
                読み込み完了
              </span>
            </div>

            {rows.map((row, i) => (
              <div
                key={row.label}
                className={`flex h-10 items-center justify-between px-4 ${
                  i % 2 === 0 ? "bg-surface-gray" : "bg-surface-primary"
                } ${i < rows.length - 1 ? "border-b border-[#E5E7EB]" : ""}`}
              >
                <span className="text-xs text-fg-secondary">{row.label}</span>
                <span className="tabular-nums text-[13px] font-semibold text-fg-primary">
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep(0)}
              className="flex h-11 items-center justify-center gap-2 rounded border border-fg-primary px-5 transition-colors hover:bg-surface-soft"
            >
              <ChevronLeft size={16} className="text-fg-primary" aria-hidden="true" />
              <span className="text-sm font-semibold text-fg-primary">戻る</span>
            </button>
            <button
              onClick={handleConfirm}
              className="flex h-11 flex-1 items-center justify-center rounded bg-accent transition-colors hover:bg-primary-dark"
            >
              <span className="text-sm font-semibold text-fg-inverse">この内容で取り込む</span>
            </button>
          </div>
        </div>
      </CenterColumn>
    );
  }

  // ---- 3段目: 完了 ----
  const stats = [
    { val: totalCredits, label: "取得済み単位", color: "text-fg-primary" },
    { val: TERM_PLANNED_CREDITS, label: "今期登録予定", color: "text-accent" },
    { val: remaining, label: "卒業残り単位", color: "text-fg-secondary" },
  ];
  return (
    <CenterColumn>
      <StepBar current={2} />

      <div className="flex flex-col items-center gap-4">
        <span className="grid size-20 place-items-center rounded-full bg-surface-soft">
          <CircleCheck size={40} className="text-accent" aria-hidden="true" />
        </span>
        <h2 className="text-2xl font-bold text-fg-primary">インポート完了！</h2>
        <p className="w-90 text-center text-sm leading-6 text-fg-secondary">
          成績データが正常に取り込まれました。
          <br />
          AIアシスタントが履修分析を開始できます。
        </p>
      </div>

      <div className="flex w-[520px] justify-around rounded-lg border border-border-primary bg-surface-primary py-6">
        {stats.map(({ val, label, color }) => (
          <div key={label} className="flex flex-col items-center gap-1">
            <span className={`tabular-nums text-2xl font-bold ${color}`}>{val}</span>
            <span className="text-[11px] text-fg-secondary">{label}</span>
          </div>
        ))}
      </div>

      {/* 取り込み後の行き先は履修提案だけではない。**シラバス検索も同じ画面から出す**
          (§8)。取り込んだプロファイルは検索結果のタグ付けに効くため、ここが
          タグ付きのシラバス検索への入口になる */}
      <div className="flex w-[520px] flex-col gap-4">
        <button
          onClick={() => router.push("/proposal")}
          className="flex h-12 items-center justify-center gap-2 rounded bg-accent transition-colors hover:bg-primary-dark"
        >
          <span className="text-[15px] font-bold text-fg-inverse">履修提案を見る</span>
          <ArrowRight size={18} className="text-fg-inverse" aria-hidden="true" />
        </button>
        <button
          onClick={() => router.push("/syllabus")}
          className="flex h-12 items-center justify-center gap-2 rounded border-2 border-fg-primary transition-colors hover:bg-surface-soft"
        >
          <span className="text-[15px] font-bold text-fg-primary">シラバスをみる</span>
          <ArrowRight size={18} className="text-fg-primary" aria-hidden="true" />
        </button>
      </div>
    </CenterColumn>
  );
}
