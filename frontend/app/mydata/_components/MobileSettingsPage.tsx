"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  GraduationCap,
  FileText,
  FileUp,
  FileCheck,
  Bell,
  Moon,
  Languages,
  ShieldCheck,
  Database,
  Trash2,
  Pencil,
  ChevronRight,
  Info,
  X,
  Plus,
} from "lucide-react";
import { useStudentStore, type CourseTerm } from "@/lib/student";
import { useChatStore } from "@/lib/chat";

const PROGRAMS = [
  "知能情報メディア課程",
  "電子情報通信課程",
  "機械工学・ロボティクス課程",
  "環境・応用化学課程",
  "数理・情報科学課程",
  "物質化学課程",
];

const TERMS: CourseTerm[] = ["前期", "後期", "通年", "1Q", "2Q", "3Q", "4Q", "サ集"];

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="bg-white rounded-t-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 h-14 border-b border-[#D1D5DB] shrink-0">
          <span className="text-base font-bold text-[#1A2B4E]">{title}</span>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full active:bg-[#F3F4F6]">
            <X size={20} className="text-[#4B5563]" />
          </button>
        </div>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={`w-11 h-[26px] rounded-full p-0.5 flex items-center transition-colors shrink-0 ${
        on ? "bg-[#E60012] justify-end" : "bg-[#D1D5DB] justify-start"
      }`}
    >
      <span className="w-[22px] h-[22px] rounded-full bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.1)]" />
    </button>
  );
}

function Row({
  icon,
  label,
  value,
  right,
  onClick,
  danger,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  right?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={`w-full h-[52px] flex items-center gap-3 px-5 bg-white text-left ${
        last ? "" : "border-b border-[#F3F4F6]"
      } ${onClick ? "active:bg-[#F8F9FA] transition-colors" : ""}`}
    >
      <span
        className={`w-[30px] h-[30px] rounded-md flex items-center justify-center shrink-0 ${
          danger ? "bg-[#FFE8E9]" : "bg-[#F0F2F5]"
        }`}
      >
        {icon}
      </span>
      <span className={`flex-1 text-sm ${danger ? "text-[#BA1A1A]" : "text-[#1A2B4E]"}`}>
        {label}
      </span>
      {value && <span className="text-[13px] text-[#9CA3AF]">{value}</span>}
      {right ??
        (onClick ? (
          <ChevronRight size={16} className={danger ? "text-[#BA1A1A]" : "text-[#D1D5DB]"} />
        ) : null)}
    </Comp>
  );
}

export default function MobileSettingsPage() {
  const router = useRouter();
  const profile = useStudentStore((s) => s.profile);
  const setProfile = useStudentStore((s) => s.setProfile);
  const clearProfile = useStudentStore((s) => s.clearProfile);
  const clearAll = useChatStore((s) => s.clearAll);
  const [notify, setNotify] = useState(true);
  const [dark, setDark] = useState(false);

  // ドロワー管理
  const [showGradeDrawer, setShowGradeDrawer] = useState(false);
  const [showCoursesDrawer, setShowCoursesDrawer] = useState(false);

  // 学年・課程編集ドラフト
  const [draftGrade, setDraftGrade] = useState<"1" | "2" | "3" | "4">(
    String(profile?.grade ?? "1") as "1" | "2" | "3" | "4"
  );
  const [draftProgram, setDraftProgram] = useState(profile?.program ?? PROGRAMS[0]);

  const openGradeDrawer = () => {
    setDraftGrade(String(profile?.grade ?? "1") as "1" | "2" | "3" | "4");
    setDraftProgram(profile?.program ?? PROGRAMS[0]);
    setShowGradeDrawer(true);
  };

  const saveGrade = () => {
    if (profile) {
      setProfile({ ...profile, grade: parseInt(draftGrade, 10) as 1 | 2 | 3 | 4, program: draftProgram });
    }
    setShowGradeDrawer(false);
  };

  // 修得科目編集ドラフト
  type DraftCourse = { title: string; year: string; term: CourseTerm; credits: string; status: "passed" | "failed" };
  const [draftCourses, setDraftCourses] = useState<DraftCourse[]>([]);

  const openCoursesDrawer = () => {
    setDraftCourses(
      (profile?.completedCourses ?? []).map((c) => ({
        title: c.title,
        year: String(c.year),
        term: c.term,
        credits: String(c.credits),
        status: c.status === "withdrawn" ? "failed" : c.status,
      }))
    );
    setShowCoursesDrawer(true);
  };

  const saveCourses = () => {
    if (profile) {
      setProfile({
        ...profile,
        completedCourses: draftCourses.filter((c) => c.title.trim()).map((c) => ({
          title: c.title.trim(),
          year: parseInt(c.year, 10) || new Date().getFullYear(),
          term: c.term,
          credits: parseFloat(c.credits) || 2,
          status: c.status,
        })),
      });
    }
    setShowCoursesDrawer(false);
  };

  const updateDraftCourse = (i: number, patch: Partial<DraftCourse>) =>
    setDraftCourses((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const removeDraftCourse = (i: number) =>
    setDraftCourses((rows) => rows.filter((_, idx) => idx !== i));

  const addDraftCourse = () =>
    setDraftCourses((rows) => [...rows, { title: "", year: String(new Date().getFullYear()), term: "前期", credits: "2", status: "passed" }]);

  const handleReset = () => {
    if (confirm("学生データ・成績情報・対話履歴をすべて消去しますか? この操作は取り消せません。")) {
      clearProfile();
      clearAll();
      router.push("/");
    }
  };

  const totalCredits = profile?.completedCourses.reduce((sum, c) => sum + c.credits, 0) ?? 0;
  const courseCount = profile?.completedCourses.length ?? 0;
  const iconCls = "text-[#1A2B4E]";

  return (
    <div className="flex flex-col bg-[#F8F9FA] min-h-full">
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center px-5 h-14 bg-white border-b border-[#D1D5DB]">
        <span className="text-[#1A2B4E] text-lg font-bold">マイデータ・設定</span>
      </header>

      {/* Profile card */}
      <div className="bg-white border-b border-[#D1D5DB]">
        <div className="flex items-center gap-3.5 px-5 py-[18px]">
          <div className="w-[52px] h-[52px] rounded-lg bg-[#E60012] flex items-center justify-center shrink-0">
            <span className="text-white text-[22px] font-bold">龍</span>
          </div>
          <div className="flex-1 flex flex-col gap-1 min-w-0">
            <span className="text-sm font-bold text-[#1A2B4E] truncate">
              {profile ? `${profile.program} · ${profile.grade}回生` : "学生データ未登録"}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="px-2 py-[3px] rounded-md bg-[#EEF0F5] text-[10px] font-bold text-[#1A2B4E]">
                {totalCredits}単位取得済
              </span>
              <span className="px-2 py-[3px] rounded-md bg-[#EEF0F5] text-[10px] font-bold text-[#1A2B4E]">
                {courseCount}科目
              </span>
            </div>
          </div>
          <button
            aria-label="プロフィールを編集"
            className="w-9 h-9 rounded-lg bg-[#F3F4F6] flex items-center justify-center shrink-0 active:bg-[#EEF0F5] transition-colors"
          >
            <Pencil size={16} className="text-[#1A2B4E]" />
          </button>
        </div>
        <div className="flex items-center gap-2 px-5 h-9 bg-[#F8F9FA]">
          <FileCheck size={14} className="text-[#1A2B4E] shrink-0" />
          <span className="flex-1 text-[11px] text-[#6B7280] truncate">
            {profile ? "成績表_2024.pdf からインポート済み" : "成績データが未登録です"}
          </span>
          <button onClick={() => router.push("/import")} className="text-[11px] text-[#E60012]">
            {profile ? "再取込" : "取り込む"}
          </button>
        </div>
      </div>

      {/* Sections */}
      <div className="flex flex-col gap-3 py-3">
        {/* 学生情報 */}
        <section className="flex flex-col gap-2">
          <h2 className="px-5 text-[11px] font-bold text-[#1A2B4E]">学生情報</h2>
          <div className="border-y border-[#D1D5DB]">
            <Row
              icon={<GraduationCap size={16} className={iconCls} />}
              label="学年・課程"
              value={profile ? `${profile.grade}回生 / ${profile.program}` : "未登録"}
              onClick={openGradeDrawer}
            />
            <Row
              icon={<FileText size={16} className={iconCls} />}
              label="修得科目を編集"
              value={`${courseCount}科目`}
              onClick={profile ? openCoursesDrawer : undefined}
            />
            <Row
              icon={<FileUp size={16} className={iconCls} />}
              label="PDFを再インポート"
              value="成績表_2024.pdf"
              onClick={() => router.push("/import")}
              last
            />
          </div>
        </section>

        {/* 表示・通知 */}
        <section className="flex flex-col gap-2">
          <h2 className="px-5 text-[11px] font-bold text-[#1A2B4E]">表示・通知</h2>
          <div className="border-y border-[#D1D5DB]">
            <Row
              icon={<Bell size={16} className={iconCls} />}
              label="履修提案の通知"
              right={<Toggle on={notify} onToggle={() => setNotify((v) => !v)} />}
            />
            <Row
              icon={<Moon size={16} className={iconCls} />}
              label="ダークモード"
              right={<Toggle on={dark} onToggle={() => setDark((v) => !v)} />}
            />
            <Row
              icon={<Languages size={16} className={iconCls} />}
              label="言語"
              value="日本語"
              last
            />
          </div>
        </section>

        {/* プライバシー・データ */}
        <section className="flex flex-col gap-2">
          <h2 className="px-5 text-[11px] font-bold text-[#1A2B4E]">プライバシー・データ</h2>
          <div className="border-y border-[#D1D5DB]">
            <Row
              icon={<ShieldCheck size={16} className={iconCls} />}
              label="プライバシーポリシー"
              onClick={() => router.push("/privacy")}
            />
            <Row
              icon={<Database size={16} className={iconCls} />}
              label="データの取り扱いについて"
              onClick={() => router.push("/privacy")}
              last
            />
          </div>
        </section>

        {/* リセット */}
        <section className="flex flex-col">
          <div className="border-y border-[#D1D5DB]">
            <Row
              icon={<Trash2 size={16} className="text-[#EF4444]" />}
              label="データをリセット"
              onClick={handleReset}
              danger
              last
            />
          </div>
          <div className="flex items-start gap-2 px-5 py-2.5 bg-[#F3F4F6]">
            <Info size={14} className="text-[#9CA3AF] shrink-0 mt-px" />
            <p className="flex-1 text-[11px] text-[#6B7280] leading-relaxed">
              リセットすると学生データ・成績情報・対話履歴がすべて消去されます。この操作は取り消せません。
            </p>
          </div>
        </section>

        {/* Version */}
        <div className="flex flex-col items-center gap-[3px] px-5 py-4">
          <span className="text-[11px] text-[#9CA3AF]">履修登録支援AIチャットボット</span>
          <span className="text-[11px] text-[#9CA3AF]">龍谷大学 知能情報メディア課程</span>
        </div>
      </div>

      {/* 学年・課程 ドロワー */}
      {showGradeDrawer && (
        <Drawer title="学年・課程を編集" onClose={() => setShowGradeDrawer(false)}>
          <div className="flex flex-col gap-5 px-5 py-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[#1A2B4E]">学年</label>
              <div className="flex gap-2">
                {(["1", "2", "3", "4"] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setDraftGrade(g)}
                    className={`flex-1 h-10 rounded-lg border text-sm font-semibold transition-colors ${
                      draftGrade === g
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
                value={draftProgram}
                onChange={(e) => setDraftProgram(e.target.value)}
                className="w-full h-10 rounded-lg border border-[#D1D5DB] px-3 text-sm text-[#1A2B4E] bg-white focus:outline-none focus:border-[#1A2B4E]"
              >
                {PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <button
              onClick={saveGrade}
              className="w-full h-12 rounded-lg bg-[#E60012] flex items-center justify-center active:bg-[#b7000c] transition-colors"
            >
              <span className="text-sm font-bold text-white">保存する</span>
            </button>
          </div>
        </Drawer>
      )}

      {/* 修得科目 ドロワー */}
      {showCoursesDrawer && (
        <Drawer title="修得科目を編集" onClose={() => setShowCoursesDrawer(false)}>
          <div className="flex flex-col gap-3 px-4 py-4">
            {draftCourses.map((row, i) => (
              <div key={i} className="rounded-lg border border-[#D1D5DB] overflow-hidden">
                <div className="flex items-center gap-2 px-3 h-11 border-b border-[#E5E7EB]">
                  <input
                    type="text"
                    value={row.title}
                    onChange={(e) => updateDraftCourse(i, { title: e.target.value })}
                    placeholder="科目名"
                    className="flex-1 text-sm text-[#1A2B4E] placeholder-[#9CA3AF] focus:outline-none bg-transparent"
                  />
                  <button
                    onClick={() => removeDraftCourse(i)}
                    className="w-7 h-7 flex items-center justify-center text-[#9CA3AF] active:text-[#EF4444] transition-colors"
                    aria-label="削除"
                  >
                    <X size={15} />
                  </button>
                </div>
                <div className="flex items-center gap-1 px-3 h-10 bg-[#F8F9FA]">
                  <input
                    type="number"
                    value={row.year}
                    onChange={(e) => updateDraftCourse(i, { year: e.target.value })}
                    className="w-16 h-7 rounded border border-[#D1D5DB] px-2 text-xs text-[#1A2B4E] bg-white focus:outline-none text-center"
                  />
                  <span className="text-xs text-[#6B7280]">年度</span>
                  <select
                    value={row.term}
                    onChange={(e) => updateDraftCourse(i, { term: e.target.value as CourseTerm })}
                    className="h-7 rounded border border-[#D1D5DB] px-1 text-xs text-[#1A2B4E] bg-white focus:outline-none"
                  >
                    {TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input
                    type="number"
                    value={row.credits}
                    onChange={(e) => updateDraftCourse(i, { credits: e.target.value })}
                    className="w-12 h-7 rounded border border-[#D1D5DB] px-2 text-xs text-[#1A2B4E] bg-white focus:outline-none text-center"
                    step="0.5"
                  />
                  <span className="text-xs text-[#6B7280]">単位</span>
                  <div className="flex-1" />
                  <div className="flex gap-1">
                    {(["passed", "failed"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => updateDraftCourse(i, { status: s })}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                          row.status === s
                            ? s === "passed" ? "bg-[#D1FAE5] text-[#065F46]" : "bg-[#FEE2E2] text-[#991B1B]"
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
            <button
              onClick={addDraftCourse}
              className="w-full h-10 rounded-lg border-2 border-dashed border-[#D1D5DB] flex items-center justify-center gap-2 active:border-[#1A2B4E] transition-colors"
            >
              <Plus size={16} className="text-[#4B5563]" />
              <span className="text-sm text-[#4B5563]">科目を追加</span>
            </button>
            <button
              onClick={saveCourses}
              className="w-full h-12 rounded-lg bg-[#E60012] flex items-center justify-center active:bg-[#b7000c] transition-colors"
            >
              <span className="text-sm font-bold text-white">保存する</span>
            </button>
          </div>
        </Drawer>
      )}
    </div>
  );
}
