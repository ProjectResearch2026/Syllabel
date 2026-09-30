"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Info,
  FileUp,
  CirclePlay,
  FileCheck,
  TriangleAlert,
  CircleCheck,
  CalendarCheck,
  BookOpen,
  Check,
  Loader2,
  CircleAlert,
} from "lucide-react";
import { isUnearned, useStudentStore, type StudentProfile } from "@/lib/student";
import { useCreditSummary } from "@/lib/creditSummary";
import { demoLabel, isFreshmanDemo } from "@/lib/dummy/profiles";
import DemoPicker from "./DemoPicker";
import ManualInputForm from "./ManualInputForm";
import PrivacyConsentModal from "./PrivacyConsentModal";

const STEPS = ["アップロード", "確認", "完了"] as const;

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
                  <span className={`text-[11px] font-bold tabular-nums ${active ? "text-white" : "text-[#9CA3AF]"}`}>
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

type ParseState =
  | { type: "idle" }
  /** PDF を選んだ。解析の前に取り扱いの確認を出す（要件§5.6。ui-design_phone.pen 01-2） */
  | { type: "consent"; file: File }
  | { type: "parsing" }
  | { type: "error"; message: string }
  | { type: "manual" };

/**
 * 成績表の取り込み（モバイル。ui-design_phone.pen 01〜03、`/`）。
 *
 * **PC と同じ `/` に置く。** 以前はモバイルだけ `/` が時間割で、取り込みは `/import` に
 * 分かれていた。URL が端末で違うと、同じリンクが端末によって別の画面を開く。
 */
export default function MobileImportFlow() {
  const router = useRouter();
  const profile = useStudentStore((s) => s.profile);
  const setProfile = useStudentStore((s) => s.setProfile);
  const { currentCredits, remainingCredits } = useCreditSummary();

  const [step, setStep] = useState(0);
  const [pending, setPending] = useState<StudentProfile | null>(null);
  const [fileName, setFileName] = useState("");
  const [parseState, setParseState] = useState<ParseState>({ type: "idle" });
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

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setParseState({ type: "consent", file });
  };

  const parse = async (file: File) => {
    setParseState({ type: "parsing" });
    try {
      const { parseGradeReport } = await import("@/lib/pdf/parseGradeReport");
      const { profile, warnings } = await parseGradeReport(file);
      if (warnings.length > 0) console.warn("PDF parse warnings:", warnings);
      stage(profile, file.name);
      setParseState({ type: "idle" });
    } catch (err) {
      setParseState({
        type: "error",
        message: err instanceof Error ? err.message : "PDFの読み取りに失敗しました",
      });
    }
  };

  const courses = pending?.completedCourses ?? [];
  // 取り込みは不合格・履修辞退も含む全科目。単位に数えるのは合格したものだけ(要件§4.2)
  const totalCredits = courses
    .filter((c) => c.status === "passed")
    .reduce((sum, c) => sum + c.credits, 0);
  // 不合格と履修辞退は「未修得」に丸める(設計書 §6.1。再履修の対象として同じ扱い)
  const unearnedCourses = courses.filter(isUnearned);
  const passedCount = courses.filter((c) => c.status === "passed").length;
  const registeredCount = courses.filter((c) => c.status === "registered").length;

  const handleConfirm = () => {
    if (pending) setProfile(pending);
    setStep(2);
  };

  // 1年前期のデモは入学直後で成績表が無い。「取り込み」とは言わず、新入生として始める
  const freshman = isFreshmanDemo(pending);

  if (parseState.type === "manual") {
    return (
      <ManualInputForm
        onComplete={(profile) => {
          stage(profile, "手入力");
          setParseState({ type: "idle" });
        }}
        onCancel={() => setParseState({ type: "idle" })}
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-white">
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-5 h-14 bg-white border-b border-[#D1D5DB]">
        <div className="flex items-center gap-3">
          {/* 取り込み直し（マイデータから来た）ときだけ戻れる。初回はここが入口 */}
          {profile && (
            <button onClick={() => router.push("/mydata")} aria-label="マイデータに戻る" className="-ml-1.5">
              <ChevronLeft size={22} className="text-[#1A2B4E]" />
            </button>
          )}
          <span className="text-[#1A2B4E] text-lg font-bold">成績表インポート</span>
        </div>
        <button onClick={() => router.push("/privacy")} aria-label="プライバシーとデータの取り扱い">
          <Info size={22} className="text-[#6B7280]" />
        </button>
      </header>

      {parseState.type === "consent" && (
        <PrivacyConsentModal
          compact
          onAccept={() => parse(parseState.file)}
          onCancel={() => setParseState({ type: "idle" })}
        />
      )}

      <StepBar current={step} />

      <AnimatePresence mode="wait" initial={false}>
      {/* ── Step 0: アップロード ── */}
      {step === 0 && (
        <motion.div
          key="step0"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <div className="flex flex-col gap-5 p-5">
            <h2 className="text-[15px] font-bold text-[#1A2B4E]">成績表PDFを選択</h2>

            {parseState.type === "parsing" ? (
              <div className="w-full h-[180px] bg-[#FAFAFA] rounded-lg border-2 border-dashed border-[#D1D5DB] flex flex-col items-center justify-center gap-3">
                <Loader2 size={32} className="text-[#1A2B4E] animate-spin" />
                <span className="text-sm font-semibold text-[#1A2B4E]">解析中...</span>
              </div>
            ) : parseState.type === "error" ? (
              <div className="w-full rounded-lg border-2 border-[#FECACA] bg-[#FEF2F2] px-4 py-5 flex flex-col gap-2.5">
                <div className="flex items-start gap-1.5">
                  <CircleAlert size={18} className="text-[#BA1A1A] shrink-0 mt-px" />
                  <p className="text-[13px] font-semibold text-[#93000A]">
                    成績表を読み取れませんでした。手入力でご入力ください。
                  </p>
                </div>
                <p className="text-[11px] text-[#93000A]/80">{parseState.message}</p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setParseState({ type: "manual" })}
                    className="h-11 rounded bg-accent text-sm font-semibold text-fg-inverse active:bg-primary-dark transition-colors"
                  >
                    手入力で続ける
                  </button>
                  <label className="h-11 rounded border-[1.5px] border-fg-primary bg-surface-primary flex items-center justify-center cursor-pointer active:bg-surface-gray transition-colors">
                    <input type="file" accept="application/pdf" className="hidden" onChange={handleFile} />
                    <span className="text-sm font-semibold text-fg-primary">もう一度選択する</span>
                  </label>
                </div>
              </div>
            ) : (
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
            )}

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-[#E5E7EB]" />
              <span className="text-xs text-[#9CA3AF]">または</span>
              <div className="flex-1 h-px bg-[#E5E7EB]" />
            </div>

            <div className="relative">
              <button
                onClick={() => setDemoOpen((o) => !o)}
                className="w-full h-12 rounded-lg border-2 border-[#1A2B4E] flex items-center justify-center gap-2.5 active:bg-[#EEF1F8] transition-colors"
              >
                <CirclePlay size={18} className="text-[#1A2B4E]" />
                <span className="text-sm font-semibold text-[#1A2B4E]">ダミーデータで試す（展示用）</span>
                {demoOpen ? (
                  <ChevronUp size={15} className="text-[#1A2B4E]" />
                ) : (
                  <ChevronDown size={15} className="text-[#1A2B4E]" />
                )}
              </button>
              <AnimatePresence>
                {demoOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scaleY: 0.95 }}
                    animate={{ opacity: 1, y: 0, scaleY: 1 }}
                    exit={{ opacity: 0, y: -4, scaleY: 0.97 }}
                    transition={{ duration: 0.16, ease: [0.25, 0.1, 0.25, 1] }}
                    style={{ originY: "top" }}
                    className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#D1D5DB] rounded-lg shadow-md overflow-hidden z-10"
                  >
                    <div className="p-4">
                      <DemoPicker onLoad={handleDemoLoad} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <h2 className="text-[15px] font-bold text-[#1A2B4E] mt-1">インポート方法</h2>
            {[
              { title: "ポータルにアクセス", desc: "龍谷大学ポータルサイト (kukuli) にログイン" },
              { title: "成績照会を開く", desc: "「成績照会」→「成績表印刷」からPDFをダウンロード" },
              { title: "このページで選択", desc: "ダウンロードしたPDFを上のボタンから選択" },
            ].map((s, i) => (
              <div key={s.title} className="flex items-start gap-3.5">
                <div className="w-8 h-8 rounded-md bg-[#1A2B4E] flex items-center justify-center shrink-0">
                  <span className="text-white text-sm font-bold tabular-nums">{i + 1}</span>
                </div>
                <div className="flex flex-col gap-0.5 pt-0.5">
                  <span className="text-[13px] font-semibold text-[#1A2B4E]">{s.title}</span>
                  <span className="text-xs text-[#4B5563]">{s.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Step 1: 確認 ── */}
      {step === 1 && (
        <motion.div
          key="step1"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex flex-col gap-5 p-5"
        >
          <h2 className="text-[15px] font-bold text-[#1A2B4E]">
            {freshman ? "新入生として始める" : "取り込み内容の確認"}
          </h2>

          <div className="rounded-lg border border-[#D1D5DB] overflow-hidden">
            {/* Card header */}
            <div className="flex items-center justify-between h-11 px-3.5 border-b border-[#D1D5DB]">
              <div className="flex items-center gap-2 min-w-0">
                <FileCheck size={18} className="text-[#E60012] shrink-0" />
                <span className="text-[13px] font-semibold text-[#1A2B4E] truncate">{fileName}</span>
              </div>
              {freshman ? (
                <span className="shrink-0 px-2 py-[3px] rounded bg-surface-soft text-[10px] font-semibold text-fg-secondary">
                  成績なし
                </span>
              ) : (
                <span className="shrink-0 px-2 py-[3px] rounded bg-[#D1FAE5] text-[10px] font-semibold text-[#065F46]">
                  読み込み完了
                </span>
              )}
            </div>

            {/* Summary rows */}
            {[
              { label: "学年", value: `${pending?.grade ?? "-"}回生` },
              { label: "課程", value: pending?.program ?? "-" },
              { label: "取得済み単位", value: `${totalCredits}単位` },
              ...(freshman ? [] : [{ label: "判定科目数", value: `${passedCount}科目` }]),
              // 未修得は単位に数えないが、再履修の提案に使うので取り込んだことを見せる
              ...(unearnedCourses.length > 0
                ? [{ label: "未修得科目（再履修の対象）", value: `${unearnedCourses.length}科目` }]
                : []),
              // 登録済みで成績未確定。提案の候補から外すので、取り込んだことを見せる
              ...(registeredCount > 0
                ? [{ label: "登録済み科目（成績未確定）", value: `${registeredCount}科目` }]
                : []),
            ].map((r, i) => (
              <div
                key={r.label}
                className={`flex items-center justify-between h-[38px] px-3.5 border-b border-[#E5E7EB] ${
                  i % 2 === 0 ? "bg-[#F8F9FA]" : "bg-white"
                }`}
              >
                <span className="text-xs text-[#4B5563]">{r.label}</span>
                <span className="text-[13px] font-semibold text-[#1A2B4E] tabular-nums">{r.value}</span>
              </div>
            ))}

            {/* Course preview。新入生には見せる科目が無い */}
            {!freshman && (
            <div className="flex items-center justify-between h-9 px-3.5 bg-[#EEF0F5] border-b border-[#E5E7EB]">
              <span className="text-[11px] font-semibold text-[#4B5563]">取り込まれた科目（一部）</span>
              <span className="text-[11px] text-[#E60012] tabular-nums">全{courses.length}件 →</span>
            </div>
            )}
            {courses.slice(0, 5).map((c, i) => {
              const fail = isUnearned(c);
              const scoreLabel =
                c.status === "registered" ? "登録中" : (c.rawScore ?? (fail ? "未修得" : "合格"));
              return (
                <div
                  key={`${c.title}-${i}`}
                  className={`flex items-center gap-2.5 h-11 px-3.5 border-b border-[#E5E7EB] last:border-b-0 ${
                    i % 2 === 0 ? "bg-white" : "bg-[#F8F9FA]"
                  }`}
                >
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums ${
                      fail ? "bg-[#FEE2E2] text-[#991B1B]" : "bg-[#D1FAE5] text-[#065F46]"
                    }`}
                  >
                    {scoreLabel}
                  </span>
                  <span className="flex-1 text-xs font-semibold text-[#1A2B4E] truncate">{c.title}</span>
                </div>
              );
            })}
          </div>

          {freshman && (
            <p className="text-xs leading-relaxed text-[#4B5563]">
              入学したばかりで、成績表はまだありません。1年前期の必修を中心に、はじめての時間割を提案します。
            </p>
          )}

          {/* Warning */}
          {unearnedCourses.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-[#FFF3CD] border-l-[3px] border-[#F59E0B] rounded-r">
              <TriangleAlert size={16} className="text-[#F59E0B] shrink-0" />
              <span className="flex-1 text-[11px] text-[#92400E]">
                不合格科目（{unearnedCourses.map((c) => c.title).join("・")}）が{unearnedCourses.length}件含まれています。再履修の提案に活用されます。
              </span>
            </div>
          )}

          {/* Buttons */}
          <button
            onClick={handleConfirm}
            className="w-full h-[52px] rounded-lg bg-[#E60012] flex items-center justify-center gap-2 active:bg-[#b7000c] transition-colors"
          >
            <CircleCheck size={20} className="text-white" />
            <span className="text-[15px] font-bold text-white">
              {freshman ? "この学生で始める" : "この内容で取り込む"}
            </span>
          </button>
          <button
            onClick={() => setStep(0)}
            className="w-full h-11 rounded-lg border border-[#D1D5DB] flex items-center justify-center active:bg-[#F8F9FA] transition-colors"
          >
            <span className="text-sm text-[#4B5563]">戻る</span>
          </button>
        </motion.div>
      )}

      {/* ── Step 2: 完了 ── */}
      {step === 2 && (
        <motion.div
          key="step2"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex flex-col"
        >
          <div className="flex flex-col items-center gap-4 px-6 pt-12 pb-8">
            <motion.div
              className="w-20 h-20 rounded-full bg-[#EEF0F5] flex items-center justify-center"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 16, stiffness: 260, delay: 0.1 }}
            >
              <CircleCheck size={40} className="text-[#E60012]" />
            </motion.div>
            <h2 className="text-[22px] font-bold text-[#1A2B4E]">
              {freshman ? "準備ができました！" : "インポート完了！"}
            </h2>
            <p className="text-sm text-[#4B5563] text-center leading-relaxed">
              {freshman ? "入学したばかりの学生として始めます。" : "成績データが正常に取り込まれました。"}
              <br />
              AIアシスタントが履修分析を開始できます。
            </p>
          </div>

          <div className="flex items-center justify-around h-20 bg-[#F8F9FA] border-y border-[#E5E7EB]">
            {/* ヘッダー・時間割の単位バーと同じ集計（lib/creditSummary.tsx） */}
            {[
              { val: totalCredits, label: "取得済み単位", color: "text-[#1A2B4E]" },
              { val: currentCredits, label: "今期登録予定", color: "text-accent" },
              { val: remainingCredits, label: "卒業残り単位", color: "text-[#1A2B4E]" },
            ].map((s) => (
              <div key={s.label} className="flex flex-col items-center gap-1">
                <span className={`text-[22px] font-bold tabular-nums ${s.color}`}>{s.val ?? "—"}</span>
                <span className="text-[10px] text-[#6B7280]">{s.label}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 px-5 pt-6 pb-5">
            <h2 className="text-[15px] font-bold text-[#1A2B4E]">次のステップ</h2>

            <button
              onClick={() => router.push("/proposal")}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-lg bg-[#E60012] text-left"
            >
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <CalendarCheck size={20} className="text-white" />
              </div>
              <div className="flex-1 flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-white">履修提案を見る</span>
                <span className="text-xs text-white/80">卒業要件から逆算して今期の時間割を提案</span>
              </div>
              <ChevronRight size={18} className="text-white shrink-0" />
            </button>

            {/* 取り込んだプロファイルは検索結果のタグ付けに効く(§6.1.3)。
                ここをタグ付きのシラバス検索への入口にする */}
            <button
              onClick={() => router.push("/syllabus")}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-lg bg-white border border-[#E5E7EB] text-left"
            >
              <div className="w-10 h-10 rounded-full bg-[#F0FDF4] flex items-center justify-center shrink-0">
                <BookOpen size={20} className="text-[#059669]" />
              </div>
              <div className="flex-1 flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-[#1A2B4E]">シラバスをみる</span>
                <span className="text-xs text-[#4B5563]">履修できる科目にタグを付けて表示</span>
              </div>
              <ChevronRight size={18} className="text-[#9CA3AF] shrink-0" />
            </button>
          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
