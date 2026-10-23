"use client";

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Lock,
  WifiOff,
  History,
  Upload,
  Play,
  FileCheck,
  ChevronLeft,
  CircleCheck,
  ArrowRight,
  AlertCircle,
  Loader2,
  X,
} from "lucide-react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import StepBar from "./StepBar";
import PrivacyConsentModal from "./PrivacyConsentModal";
import { isUnearned, type StudentProfile } from "@/lib/student";
import { useReplaceStudent } from "@/lib/replaceStudent";
import { useAiStore } from "@/lib/ai";
import { demoLabel, isFreshmanDemo } from "@/lib/dummy/profiles";
import DemoPicker from "./DemoPicker";

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

/**
 * 段の切り替え。進むときは右から、戻るときは左から入る(モバイルの
 * `MobileImportFlow` と同じ動き)。向きは `custom` で渡し、出ていく側にも効かせる
 */
const stepVariants: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: 20 * dir }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: -20 * dir }),
};

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
  // 前の学生の提案と会話は持ち越さない(別の学生に差し替える)
  const replaceStudent = useReplaceStudent();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStepState] = useState(0);
  // 段の切り替えの向き(進む 1 / 戻る -1)
  const [dir, setDir] = useState(1);
  const setStep = (next: number) => {
    setDir(next >= step ? 1 : -1);
    setStepState(next);
  };
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

  const handleDemoLoad = (profile: StudentProfile) => {
    setDemoOpen(false);
    stage(profile, `デモ: ${profile.demo ? demoLabel(profile.demo.key) : ""}・${profile.program ?? ""}`);
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
          message: "成績表を読み取れませんでした。もう一度選ぶか、デモの学生で試してください。",
        });
        return;
      }

      setImportState({ type: "idle" });
      stage(profile, file.name);
    } catch {
      setImportState({
        type: "error",
        message: "PDFの読み取りに失敗しました。もう一度選ぶか、デモの学生で試してください。",
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
    if (pending) replaceStudent(pending);
    setStep(2);
  };

  return (
    <>
      {/* 同意のモーダルは段の外に置く。段の動きの transform の中に入ると、
          fixed の基準が画面ではなく段になる */}
      {step === 0 && importState.type === "consent" && (
        <PrivacyConsentModal onAccept={handleConsentAccept} onCancel={handleConsentCancel} />
      )}
      {/*
        デモの学生を選ぶ欄は画面の中央に開く。ボタンの下に開いていた頃は、取り込みの
        カードが画面の中ほどにあるため欄の下半分が画面の外に出て、スクロールしないと
        「この学生で試す」まで届かなかった
      */}
      <AnimatePresence>
        {step === 0 && demoOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            onKeyDown={(e) => e.key === "Escape" && setDemoOpen(false)}
          >
            <motion.div
              className="absolute inset-0 bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setDemoOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="demo-dialog-title"
              className="relative flex max-h-[calc(100dvh-32px)] w-[440px] flex-col gap-4 overflow-y-auto rounded-2xl bg-surface-primary p-6 shadow-xl"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 4 }}
              transition={{ duration: 0.16, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <h2 id="demo-dialog-title" className="text-lg font-bold text-fg-primary">
                    ダミーデータで試す
                  </h2>
                  <p className="text-xs text-fg-secondary">展示用のダミー学生で、成績表なしで体験できます。</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDemoOpen(false)}
                  aria-label="閉じる"
                  className="grid size-8 shrink-0 place-items-center rounded-full text-fg-secondary transition-colors hover:bg-surface-soft"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              <DemoPicker onLoad={handleDemoLoad} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence mode="wait" initial={false} custom={dir}>
        <motion.div
          key={step}
          custom={dir}
          variants={stepVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {renderStep()}
        </motion.div>
      </AnimatePresence>
    </>
  );

  function renderStep() {
    // ---- 1段目: アップロード ----
    if (step === 0) {
      return (
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
                  成績表はブラウザの中で読み取り、PDFはサーバーへ送りません。AIに時間割を組ませるときと質問するときは、履修状況を学内のAIサーバーにだけ送ります。送った内容は学内で100日間記録されます。
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {[
                { icon: Lock, label: "PDFはブラウザの中だけで読み取り" },
                { icon: WifiOff, label: "学外のAIサービスは使わない" },
                { icon: History, label: "AIに送った内容は学内で100日間記録" },
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
                <div className="flex h-40 flex-col items-center justify-center gap-3 rounded border border-border-primary bg-[#FAFAFA] motion-safe:animate-fade-in">
                  <Loader2 size={32} className="animate-spin text-fg-primary" aria-hidden="true" />
                  <p className="text-sm text-fg-tertiary">PDFを読み取っています…</p>
                </div>
              ) : importState.type === "error" ? (
                <div className="flex h-40 flex-col items-center justify-center gap-3 rounded border border-[#FCA5A5] bg-[#FFF8F8] px-6 text-center motion-safe:animate-fade-in">
                  <AlertCircle size={28} className="text-[#EF4444]" aria-hidden="true" />
                  <p className="text-sm font-medium text-[#EF4444]">{importState.message}</p>
                  {/* 手入力のフォームは置かない(要件§4.1)。デモの学生を読み込み、マイデータで直す */}
                  <div className="flex items-center gap-4">
                    <button
                      onClick={handleRetry}
                      className="text-xs text-fg-primary underline underline-offset-2"
                    >
                      もう一度選択する
                    </button>
                    <button
                      onClick={() => setDemoOpen(true)}
                      aria-haspopup="dialog"
                      className="text-xs text-fg-primary underline underline-offset-2"
                    >
                      デモの学生で試す
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  // ファイルを重ねているあいだは枠を少し広げ、アイコンを持ち上げて受け口を示す
                  className={`group flex h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded border transition-[color,background-color,border-color,scale] duration-200 motion-safe:animate-fade-in ${
                    isDragOver
                      ? "border-fg-primary bg-surface-soft motion-safe:scale-[1.02]"
                      : "border-border-primary bg-[#FAFAFA] hover:border-fg-primary"
                  }`}
                >
                  <span
                    className={`grid size-12 place-items-center rounded-full bg-surface-soft transition-[translate,background-color] duration-200 ${
                      isDragOver ? "bg-surface-primary motion-safe:-translate-y-1" : ""
                    }`}
                  >
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

              <button
                onClick={() => setDemoOpen(true)}
                aria-haspopup="dialog"
                className="flex h-11 w-full items-center justify-center gap-2 rounded border border-fg-primary transition-colors hover:bg-surface-soft"
              >
                <Play size={16} className="text-fg-primary" aria-hidden="true" />
                <span className="text-sm font-semibold text-fg-primary">ダミーデータで試す（展示用）</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    // ---- 2段目: 確認 ----
    // 1年前期のデモは入学直後で成績表が無い。「取り込み」とは言わず、新入生として始める
    const freshman = isFreshmanDemo(pending);
    if (step === 1 && freshman) {
      return (
        <CenterColumn>
          <StepBar current={1} />

          <div className="flex w-[480px] flex-col gap-4">
            <h3 className="text-base font-bold text-fg-primary">新入生として始める</h3>

            <div className="overflow-hidden rounded-lg border border-border-primary bg-surface-primary">
              <div className="flex h-12 items-center justify-between border-b border-[#E5E7EB] px-4">
                <span className="truncate text-[13px] font-semibold text-fg-primary">{fileName}</span>
                <span className="shrink-0 rounded bg-surface-soft px-2 py-[3px] text-[11px] font-semibold text-fg-secondary">
                  成績なし
                </span>
              </div>
              {[
                { label: "学年", value: "1回生" },
                { label: "課程", value: pending?.program ?? "-" },
                { label: "取得済み単位", value: "0単位" },
              ].map((row, i, rows) => (
                <div
                  key={row.label}
                  className={`flex h-10 items-center justify-between px-4 ${
                    i % 2 === 0 ? "bg-surface-gray" : "bg-surface-primary"
                  } ${i < rows.length - 1 ? "border-b border-[#E5E7EB]" : ""}`}
                >
                  <span className="text-xs text-fg-secondary">{row.label}</span>
                  <span className="tabular-nums text-[13px] font-semibold text-fg-primary">{row.value}</span>
                </div>
              ))}
            </div>

            <p className="text-xs leading-relaxed text-fg-secondary">
              入学したばかりで、成績表はまだありません。1年前期の必修を中心に、はじめての時間割を提案します。
            </p>

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
                <span className="text-sm font-semibold text-fg-inverse">この学生で始める</span>
              </button>
            </div>
          </div>
        </CenterColumn>
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
          {/* 完了の印はばねで弾ませる(モバイルの完了画面と同じ値) */}
          <motion.span
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", damping: 16, stiffness: 260, delay: 0.15 }}
            className="grid size-20 place-items-center rounded-full bg-surface-soft"
          >
            <CircleCheck size={40} className="text-accent" aria-hidden="true" />
          </motion.span>
          <h2 className="text-2xl font-bold text-fg-primary">
            {freshman ? "準備ができました！" : "インポート完了！"}
          </h2>
          <p className="w-90 text-center text-sm leading-6 text-fg-secondary">
            {freshman ? "入学したばかりの学生として始めます。" : "成績データが正常に取り込まれました。"}
            <br />
            AIアシスタントが履修分析を開始できます。
          </p>
        </div>

        <div className="flex w-[520px] justify-around rounded-lg border border-border-primary bg-surface-primary py-6 motion-safe:animate-rise-in [animation-delay:250ms]">
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
        <div className="flex w-[520px] flex-col gap-4 motion-safe:animate-rise-in [animation-delay:350ms]">
          <button
            onClick={() => {
              // 時間割に着いたら AI の入力欄をすぐ出す（§8.3.1）。希望条件を聞くのが次の一手
              useAiStore.getState().setOpenOnArrival(true);
              router.push("/proposal");
            }}
            className="flex h-12 items-center justify-center gap-2 rounded bg-accent transition-colors hover:bg-primary-dark"
          >
            <span className="text-[15px] font-bold text-fg-inverse">履修提案を受ける</span>
            <ArrowRight size={18} className="text-fg-inverse" aria-hidden="true" />
          </button>
          <button
            onClick={() => router.push("/syllabus")}
            className="flex h-12 items-center justify-center gap-2 rounded border-2 border-fg-primary transition-colors hover:bg-surface-soft"
          >
            <span className="text-[15px] font-bold text-fg-primary">シラバスを見る</span>
            <ArrowRight size={18} className="text-fg-primary" aria-hidden="true" />
          </button>
        </div>
      </CenterColumn>
    );
  }
}
