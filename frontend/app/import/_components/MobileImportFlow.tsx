"use client";

import { Fragment, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
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
  BookOpen,
  Check,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { isUnearned, useStudentStore, type StudentProfile } from "@/lib/student";
import { TIMETABLE_CONTEXT, useAiStore } from "@/lib/ai";
import { DUMMY_PROFILES } from "@/lib/dummy/profiles";
import ManualInputForm from "./ManualInputForm";

const GRADUATION_CREDITS = 124;
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
  | { type: "parsing" }
  | { type: "error"; message: string }
  | { type: "manual" };

export default function MobileImportFlow() {
  const router = useRouter();
  const openHalf = useAiStore((s) => s.openHalf);
  const setProfile = useStudentStore((s) => s.setProfile);

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

  const handleDemoLoad = (index: number) => {
    setDemoOpen(false);
    stage(DUMMY_PROFILES[index].profile, `デモ: ${DUMMY_PROFILES[index].label}`);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
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
  const remaining = Math.max(0, GRADUATION_CREDITS - totalCredits);
  // 不合格と履修辞退は「未修得」に丸める(設計書 §6.1。再履修の対象として同じ扱い)
  const unearnedCourses = courses.filter(isUnearned);

  const handleConfirm = () => {
    if (pending) setProfile(pending);
    setStep(2);
  };

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

            {parseState.type === "parsing" ? (
              <div className="w-full h-[180px] bg-[#FAFAFA] rounded-lg border-2 border-dashed border-[#D1D5DB] flex flex-col items-center justify-center gap-3">
                <Loader2 size={32} className="text-[#1A2B4E] animate-spin" />
                <span className="text-sm font-semibold text-[#1A2B4E]">解析中...</span>
              </div>
            ) : parseState.type === "error" ? (
              <div className="w-full rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-4 flex flex-col gap-3">
                <div className="flex items-start gap-2">
                  <AlertCircle size={18} className="text-[#DC2626] shrink-0 mt-px" />
                  <p className="text-sm text-[#991B1B]">{parseState.message}</p>
                </div>
                <div className="flex gap-2">
                  <label className="flex-1 h-10 rounded-lg border border-[#DC2626] flex items-center justify-center gap-2 cursor-pointer active:bg-[#FEE2E2] transition-colors">
                    <input type="file" accept="application/pdf" className="hidden" onChange={handleFile} />
                    <span className="text-sm font-semibold text-[#DC2626]">もう一度選択する</span>
                  </label>
                  <button
                    onClick={() => setParseState({ type: "manual" })}
                    className="flex-1 h-10 rounded-lg border border-[#1A2B4E] flex items-center justify-center gap-2 active:bg-[#EEF0F5] transition-colors"
                  >
                    <span className="text-sm font-semibold text-[#1A2B4E]">手入力で続ける</span>
                  </button>
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
                    {DUMMY_PROFILES.map((p, i) => (
                      <button
                        key={p.label}
                        onClick={() => handleDemoLoad(i)}
                        className="w-full h-12 px-4 flex items-center text-left active:bg-[#EEF1F8] transition-colors border-b border-[#E5E7EB] last:border-b-0"
                      >
                        <span className="text-sm text-[#1A2B4E]">{p.label}</span>
                      </button>
                    ))}
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
                <span className="text-[13px] font-semibold text-[#1A2B4E] tabular-nums">{r.value}</span>
              </div>
            ))}

            {/* Course preview */}
            <div className="flex items-center justify-between h-9 px-3.5 bg-[#EEF0F5] border-b border-[#E5E7EB]">
              <span className="text-[11px] font-semibold text-[#4B5563]">取り込まれた科目（一部）</span>
              <span className="text-[11px] text-[#E60012] tabular-nums">全{courses.length}件 →</span>
            </div>
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

          {/* Warning */}
          {unearnedCourses.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-[#FFF3CD] border-l-[3px] border-[#F59E0B] rounded-r">
              <TriangleAlert size={16} className="text-[#F59E0B] shrink-0" />
              <span className="flex-1 text-[11px] text-[#92400E]">
                未修得科目（{unearnedCourses.map((c) => c.title).join("・")}）が{unearnedCourses.length}件含まれています。再履修の提案に活用されます。
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
                <span className="text-[22px] font-bold tabular-nums text-[#1A2B4E]">{s.val}</span>
                <span className="text-[10px] text-[#6B7280]">{s.label}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 px-5 pt-6 pb-5">
            <h2 className="text-[15px] font-bold text-[#1A2B4E]">次のステップ</h2>

            <button
              onClick={() => {
                // AI専用ページは持たないため、時間割へ戻ってその画面上にシートを開く
                openHalf(TIMETABLE_CONTEXT);
                router.push("/");
              }}
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

            {/* 取り込んだプロファイルは検索結果のタグ付けに効く(§6.1.3)。
                ここをタグ付きのシラバス検索への入口にする */}
            <button
              onClick={() => router.push("/syllabus")}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-lg bg-white border border-[#E5E7EB] text-left"
            >
              <div className="w-10 h-10 rounded-full bg-[#EEF1F8] flex items-center justify-center shrink-0">
                <BookOpen size={20} className="text-[#1A2B4E]" />
              </div>
              <div className="flex-1 flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-[#1A2B4E]">シラバスを検索する</span>
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
