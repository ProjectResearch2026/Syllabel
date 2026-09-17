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
} from "lucide-react";
import { useStudentStore } from "@/lib/student";
import { useChatStore } from "@/lib/chat";
import ManualInputForm from "@/app/import/_components/ManualInputForm";

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
  const [editMode, setEditMode] = useState<"grade-program" | "courses" | null>(null);

  const handleReset = () => {
    if (confirm("学生データ・成績情報・対話履歴をすべて消去しますか? この操作は取り消せません。")) {
      clearProfile();
      clearAll();
      router.push("/");
    }
  };

  // 取り込みは不合格・履修辞退も含む全科目。単位に数えるのは合格したものだけ(要件§4.2)
  const passedCourses = profile?.completedCourses.filter((c) => c.status === "passed") ?? [];
  const totalCredits = passedCourses.reduce((sum, c) => sum + c.credits, 0);
  const passedCount = passedCourses.length;
  const courseCount = profile?.completedCourses.length ?? 0;
  const iconCls = "text-[#1A2B4E]";

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
                {passedCount}科目
              </span>
            </div>
          </div>
          <button
            aria-label="プロフィールを編集"
            onClick={() => setEditMode("grade-program")}
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
              onClick={() => setEditMode("grade-program")}
            />
            {/* 編集画面には未修得の科目も並ぶので、件数は取り込んだ全科目で出す */}
            <Row
              icon={<FileText size={16} className={iconCls} />}
              label="取り込んだ科目を編集"
              value={`${courseCount}科目`}
              onClick={() => setEditMode("courses")}
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
    </div>
  );
}
