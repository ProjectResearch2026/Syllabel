"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  GraduationCap,
  FileText,
  FileUp,
  Shield,
  Database,
  Trash2,
  ChevronRight,
} from "lucide-react";
import { isUnearned, useStudentStore, type Course, type StudentProfile } from "@/lib/student";
import { useChatStore } from "@/lib/chat";
import { useChatHistoryStore } from "@/lib/chatHistory";
import { useProposalStore } from "@/lib/proposal";
import { useSyllabusUIStore } from "@/lib/syllabusUI";
import { useCreditSummary } from "@/lib/creditSummary";
import { useGraduationCredits } from "@/lib/curricula";
import { resolveAdmissionYear } from "@/lib/programs";
import { demoLabel, isFreshmanDemo } from "@/lib/dummy/profiles";
import DemoPicker from "@/app/_components/DemoPicker";
import ManualInputForm from "@/app/_components/ManualInputForm";

/** 修得済み科目は先頭の数件だけ出し、残りは「すべて表示」で開く */
const PREVIEW_COUNT = 4;

function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={`flex h-[26px] w-11 shrink-0 items-center rounded-full p-[3px] transition-colors ${
        on ? "justify-end bg-accent" : "justify-start bg-[#D1D5DB]"
      }`}
    >
      <span className="size-5 rounded-full bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.1)]" />
    </button>
  );
}

/** 見出し（ui-design_phone.pen SecLabel_*） */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="px-5 text-[11px] font-bold text-[#1A2B4E]">{children}</h2>;
}

/** 白地の囲み（上下だけ罫線） */
function Group({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col border-y border-border-primary bg-surface-primary">{children}</div>
  );
}

/** ラベルと値の1行（履修プロファイル） */
function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className={`flex h-11 items-center justify-between gap-3 px-5 ${
        last ? "" : "border-b border-[#F3F4F6]"
      }`}
    >
      <span className="text-[13px] text-fg-secondary">{label}</span>
      <span className="truncate text-[13px] font-semibold text-fg-primary">{value}</span>
    </div>
  );
}

/** アイコン付きの押せる1行（学生情報の編集・プライバシー・リセット） */
function NavRow({
  icon,
  label,
  value,
  onClick,
  danger,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  onClick: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-[52px] w-full items-center gap-3 bg-surface-primary px-5 text-left transition-colors active:bg-surface-gray ${
        last ? "" : "border-b border-[#F3F4F6]"
      }`}
    >
      <span
        className={`flex size-[30px] shrink-0 items-center justify-center ${
          danger ? "bg-[#FFE8E9]" : "bg-[#F0F2F5]"
        }`}
      >
        {icon}
      </span>
      <span className={`flex-1 text-sm ${danger ? "text-[#BA1A1A]" : "text-fg-primary"}`}>{label}</span>
      {value && <span className="truncate text-[13px] text-[#9CA3AF]">{value}</span>}
      <ChevronRight size={16} className={`shrink-0 ${danger ? "text-[#BA1A1A]" : "text-[#D1D5DB]"}`} />
    </button>
  );
}

/** 取り込んだ科目の1行。成績の印は修得済みが紺、未修得が赤で、登録済み（未確定）は出さない */
function CourseRow({ course, last }: { course: Course; last?: boolean }) {
  const unearned = isUnearned(course);
  const meta = [`${course.year}年度 ${course.term}`, course.code].filter(Boolean).join(" · ");
  return (
    <div
      className={`flex items-center gap-2.5 px-5 py-2.5 ${last ? "" : "border-b border-[#F3F4F6]"}`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13px] font-semibold text-fg-primary">{course.title}</span>
        <span className="text-[10px] text-fg-secondary">{meta}</span>
      </div>
      <span className="shrink-0 text-[11px] text-fg-secondary">{course.credits}単位</span>
      {course.status !== "registered" && course.rawScore && (
        <span
          className={`flex h-[22px] min-w-7 shrink-0 items-center justify-center rounded px-1 text-xs font-bold tabular-nums text-white ${
            unearned ? "bg-[#BA1A1A]" : "bg-[#1A2B4E]"
          }`}
        >
          {course.rawScore}
        </span>
      )}
    </div>
  );
}

/**
 * マイデータ（モバイル。ui-design_phone.pen 08_マイデータ、`/mydata`）。
 *
 * 取り込んだ成績データの確認・編集・破棄（要件§4.1、§4.8）。単位数はヘッダー・
 * 時間割と同じ集計（`lib/creditSummary.tsx`）を使い、画面で足し算しない。
 */
export default function MobileSettingsPage() {
  const router = useRouter();
  const profile = useStudentStore((s) => s.profile);
  const setProfile = useStudentStore((s) => s.setProfile);
  const clearProfile = useStudentStore((s) => s.clearProfile);
  const clearAll = useChatStore((s) => s.clearAll);
  const clearHistory = useChatHistoryStore((s) => s.clearAll);
  // 生成済みの提案と、学生が書いた希望条件もここで消す（要件§4.8、§5.2.3）
  const clearProposal = useProposalStore((s) => s.clear);
  const resetSyllabusUI = useSyllabusUIStore((s) => s.reset);
  const { completedCredits } = useCreditSummary();
  const graduationCredits = useGraduationCredits(profile);
  const [editMode, setEditMode] = useState<"grade-program" | "courses" | null>(null);
  const [showAllPassed, setShowAllPassed] = useState(false);

  // いま読み込んでいるのがデモのプロファイルか。デモを選ぶとその内容に差し替わる
  const [demoOn, setDemoOn] = useState(profile?.demo != null);

  const handleReset = () => {
    if (confirm("学生データ・成績情報・対話履歴をすべて消去しますか? この操作は取り消せません。")) {
      clearProfile();
      clearAll();
      clearHistory();
      clearProposal();
      resetSyllabusUI();
      router.push("/");
    }
  };

  /** デモの学生に切り替える。前の学生の提案を残すと食い違うので捨てる */
  const loadDemo = (next: StudentProfile) => {
    clearProposal();
    setProfile(next);
  };

  const courses = profile?.completedCourses ?? [];
  const passed = courses.filter((c) => c.status === "passed");
  const unearned = courses.filter(isUnearned);
  const registered = courses.filter((c) => c.status === "registered");
  const visiblePassed = showAllPassed ? passed : passed.slice(0, PREVIEW_COUNT);
  const admissionYear = resolveAdmissionYear(profile);
  const iconCls = "text-fg-primary";

  if (editMode !== null) {
    return (
      <ManualInputForm
        initialProfile={profile ?? undefined}
        mode="edit"
        onComplete={(updated) => {
          setProfile(updated);
          setEditMode(null);
        }}
        onCancel={() => setEditMode(null)}
      />
    );
  }

  return (
    <div className="flex min-h-full flex-col bg-surface-gray">
      {/* Header */}
      <header className="sticky top-0 z-20 flex h-16 flex-col items-center justify-center gap-0.5 border-b border-[#D1D5DB] bg-surface-primary px-5">
        <span className="text-lg font-bold text-[#1A2B4E]">マイデータ</span>
        <span className="text-[11px] text-fg-secondary">取り込んだ成績データと表示設定を管理します。</span>
      </header>

      <div className="flex flex-col gap-2 py-3">
        <div className="h-1 bg-[#F3F4F6]" />

        {/* 履修プロファイル */}
        <SectionLabel>履修プロファイル</SectionLabel>
        <Group>
          <InfoRow label="学年" value={profile?.grade != null ? `${profile.grade}回生` : "未登録"} />
          <InfoRow label="課程" value={profile?.program ?? "未登録"} />
          <InfoRow label="入学年度" value={admissionYear != null ? `${admissionYear}年度` : "未登録"} />
          <InfoRow
            label="取得単位"
            value={completedCredits != null ? `${completedCredits} / ${graduationCredits} 単位` : "—"}
            last
          />
        </Group>

        {/* 取り込み済みデータ */}
        <SectionLabel>取り込み済みデータ</SectionLabel>
        <Group>
          <div className="flex items-center gap-3 px-5 py-3">
            <FileText size={20} className="shrink-0 text-accent" aria-hidden="true" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[13px] font-semibold text-fg-primary">
                {profile?.demo
                  ? `デモの学生（${demoLabel(profile.demo.key)}）`
                  : profile
                    ? "取り込んだ成績表"
                    : "成績データが未登録です"}
              </span>
              <span className="text-[11px] text-fg-secondary">
                {isFreshmanDemo(profile)
                  ? "入学したばかりで、成績はまだありません"
                  : profile
                    ? `${courses.length}科目を認識・ブラウザ内で保持中`
                    : "成績表PDFを取り込んでください"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="shrink-0 rounded border-[1.5px] border-fg-primary bg-surface-primary px-4 py-2 text-xs font-semibold text-fg-primary active:bg-surface-gray"
            >
              {profile ? "再取り込み" : "取り込む"}
            </button>
          </div>
        </Group>

        {/* 修得済み科目 */}
        {passed.length > 0 && (
          <>
            <SectionLabel>修得済み科目（{passed.length}科目）</SectionLabel>
            <Group>
              {visiblePassed.map((c, i) => (
                <CourseRow
                  key={`${c.title}-${c.year}-${c.term}-${i}`}
                  course={c}
                  last={i === visiblePassed.length - 1 && passed.length <= PREVIEW_COUNT}
                />
              ))}
              {passed.length > PREVIEW_COUNT && (
                <button
                  type="button"
                  onClick={() => setShowAllPassed((v) => !v)}
                  className="flex h-10 items-center justify-center text-xs font-semibold text-accent"
                >
                  {showAllPassed ? "閉じる" : `すべて表示（${passed.length}科目）`}
                </button>
              )}
            </Group>
          </>
        )}

        {/* 未修得科目。再履修の提案に使うので取り込んだことを見せる */}
        {unearned.length > 0 && (
          <>
            <SectionLabel>未修得科目（再履修の対象）</SectionLabel>
            <Group>
              {unearned.map((c, i) => (
                <CourseRow key={`${c.title}-${c.year}-${c.term}-${i}`} course={c} last={i === unearned.length - 1} />
              ))}
            </Group>
          </>
        )}

        {/* 登録済みで成績未確定。提案の候補から外すので取り込んだことを見せる */}
        {registered.length > 0 && (
          <>
            <SectionLabel>登録済み科目（成績未確定）</SectionLabel>
            <Group>
              {registered.map((c, i) => (
                <CourseRow
                  key={`${c.title}-${c.year}-${c.term}-${i}`}
                  course={c}
                  last={i === registered.length - 1}
                />
              ))}
            </Group>
          </>
        )}

        {/* 学生情報の編集 */}
        <SectionLabel>学生情報の編集</SectionLabel>
        <Group>
          <NavRow
            icon={<GraduationCap size={16} className={iconCls} />}
            label="学年・課程"
            value={profile ? `${profile.grade ?? "-"}回生 / ${profile.program ?? "未設定"}` : "未登録"}
            onClick={() => setEditMode("grade-program")}
          />
          {/* 編集画面には未修得の科目も並ぶので、件数は取り込んだ全科目で出す */}
          <NavRow
            icon={<FileText size={16} className={iconCls} />}
            label="修得科目を編集"
            value={`${courses.length}科目`}
            onClick={() => setEditMode("courses")}
          />
          <NavRow
            icon={<FileUp size={16} className={iconCls} />}
            label="PDFを再インポート"
            onClick={() => router.push("/")}
            last
          />
        </Group>

        {/* デモモード（龍谷祭の展示用） */}
        <SectionLabel>デモモード</SectionLabel>
        <Group>
          <div className="flex items-center gap-3 border-b border-[#F3F4F6] px-5 py-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[13px] font-semibold text-fg-primary">展示用ダミーデータを使用</span>
              <span className="text-[11px] text-fg-secondary">展示用のダミー学生データに切り替えます</span>
            </div>
            <Toggle
              on={demoOn}
              label="展示用ダミーデータを使用"
              onToggle={() => setDemoOn((v) => !v)}
            />
          </div>
          {demoOn && (
            <div className="px-5 pb-3.5 pt-2.5">
              <DemoPicker
                key={profile?.demo ? `${profile.demo.key.programCode}-${profile.demo.key.grade}-${profile.demo.key.term}` : "none"}
                initial={profile?.demo?.key}
                onLoad={loadDemo}
                submitLabel="この学生に切り替える"
              />
            </div>
          )}
        </Group>

        {/* プライバシー・データ */}
        <SectionLabel>プライバシー・データ</SectionLabel>
        <Group>
          <NavRow
            icon={<Shield size={16} className={iconCls} />}
            label="プライバシーポリシー"
            onClick={() => router.push("/privacy")}
          />
          <NavRow
            icon={<Database size={16} className={iconCls} />}
            label="データの取り扱いについて"
            onClick={() => router.push("/privacy")}
            last
          />
        </Group>

        <div className="h-1 bg-[#F3F4F6]" />

        {/* リセット */}
        <Group>
          <NavRow
            icon={<Trash2 size={16} className="text-[#EF4444]" />}
            label="データをリセット"
            onClick={handleReset}
            danger
            last
          />
        </Group>

        {/* Version */}
        <div className="flex flex-col items-center gap-[3px] px-5 py-4">
          <span className="text-[11px] text-[#9CA3AF]">Syllabel</span>
          <span className="text-[10px] text-[#D1D5DB]">v0.1.0 · 龍谷大学プロジェクトリサーチ</span>
        </div>
      </div>
    </div>
  );
}
