"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, FileUp } from "lucide-react";
import { useStudentStore } from "@/lib/student";
import { useProposalStore } from "@/lib/proposal";
import { useGraduationCredits } from "@/lib/curricula";
import { coursesToTimetable } from "@/lib/timetable";
import {
  courseContext,
  slotContext,
  TIMETABLE_CONTEXT,
  useAiStore,
} from "@/lib/ai";
import AskBar from "@/components/ai/AskBar";
import TimetableGrid from "./TimetableGrid";
import CourseListSection from "./CourseListSection";
import SlotPopover, { type SlotTarget } from "./SlotPopover";

/**
 * 時間割画面（ui-design_phone.pen CalendarPage / STEP1〜3）。
 *
 * AIへの入口は下部の Ask Bar と空きコマ長押しメニューの2つだけで、
 * どちらも別ページへは遷移せず、同一画面上にシートが重なる。
 */
export default function MobileTimetablePage() {
  const router = useRouter();
  const profile = useStudentStore((s) => s.profile);
  const { status: proposalStatus, courses, totalCredits } = useProposalStore();
  const graduationCredits = useGraduationCredits(profile);

  const setSelection = useAiStore((s) => s.setSelection);
  const openHalf = useAiStore((s) => s.openHalf);

  const [selected, setSelected] = useState<{ day: string; period: number } | null>(null);
  const [slotTarget, setSlotTarget] = useState<SlotTarget | null>(null);

  // 他の画面へ移ったら Ask Bar の文脈を持ち越さない
  useEffect(() => () => setSelection(null), [setSelection]);

  if (!profile) {
    return (
      <div className="flex min-h-full flex-col bg-surface-primary">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border-primary bg-surface-primary px-5">
          <span className="font-display text-xl font-bold text-fg-primary">時間割</span>
          <Bell size={22} className="text-fg-primary" />
        </header>

        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 py-16">
          <div className="grid size-20 place-items-center rounded-full bg-[#eef0f5]">
            <FileUp size={36} className="text-fg-primary" />
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <h2 className="text-lg font-bold text-fg-primary">成績表をインポートしてください</h2>
            <p className="text-sm leading-relaxed text-fg-secondary">
              龍谷大学ポータルからダウンロードした
              <br />
              成績表PDFを取り込むと、時間割と単位情報が表示されます
            </p>
          </div>
          <Link
            href="/import"
            className="flex h-[52px] w-full items-center justify-center gap-2 rounded-lg bg-accent transition-colors active:opacity-80"
          >
            <FileUp size={20} className="text-fg-inverse" />
            <span className="text-[15px] font-bold text-fg-inverse">成績表を取り込む</span>
          </Link>
        </div>
      </div>
    );
  }

  const earnedCredits = profile.completedCourses
    .filter((c) => c.status === "passed")
    .reduce((sum, c) => sum + c.credits, 0);
  const currentCredits = proposalStatus === "done" ? totalCredits : 0;
  const remainingCredits = Math.max(0, graduationCredits - earnedCredits - currentCredits);

  const now = new Date();
  const nendo = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const semester = now.getMonth() < 9 ? "前期" : "後期";

  // 生成中に届く snapshot も描く（逐次描画。design.md §6.1.1 / §7.2）
  const timetable = coursesToTimetable(courses);

  const goSyllabus = (target: SlotTarget, openFilters: boolean) => {
    const params = new URLSearchParams({ day: target.day, period: String(target.period) });
    if (openFilters) params.set("filters", "open");
    setSlotTarget(null);
    router.push(`/syllabus?${params.toString()}`);
  };

  return (
    <div className="flex min-h-full flex-col bg-surface-primary pb-[84px]">
      {/* Header */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border-primary bg-surface-primary px-5">
        <span className="font-display text-xl font-bold text-fg-primary">時間割</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-accent">
            {nendo}年度 {semester}
          </span>
          <Bell size={22} className="text-fg-primary" />
        </div>
      </header>

      {/* 単位バー */}
      <div className="flex h-[52px] items-center justify-around border-b border-border-primary bg-surface-primary px-5">
        {[
          { val: earnedCredits, label: "取得済み単位" },
          { val: currentCredits, label: "今期登録単位" },
          { val: remainingCredits, label: "卒業残り単位" },
        ].map(({ val, label }) => (
          <div key={label} className="flex flex-col items-center gap-0.5">
            <span className="tabular-nums text-xl font-bold leading-none text-fg-primary">{val}</span>
            <span className="text-[10px] text-[#6b7280]">{label}</span>
          </div>
        ))}
      </div>

      <TimetableGrid
        timetable={timetable}
        loading={proposalStatus === "loading"}
        selected={selected}
        onSelectCourse={(day, period, name, code) => {
          const same = selected?.day === day && selected?.period === period;
          setSelected(same ? null : { day, period });
          setSelection(same ? null : courseContext(name, code));
        }}
        onLongPressEmpty={setSlotTarget}
      />

      <CourseListSection timetable={timetable} />

      <AskBar base={TIMETABLE_CONTEXT} />

      {slotTarget && (
        <SlotPopover
          target={slotTarget}
          onClose={() => setSlotTarget(null)}
          onSearch={() => goSyllabus(slotTarget, false)}
          onFilter={() => goSyllabus(slotTarget, true)}
          onAskAi={() => {
            const context = slotContext(slotTarget.day, slotTarget.period);
            setSelected({ day: slotTarget.day, period: slotTarget.period });
            setSelection(context);
            setSlotTarget(null);
            openHalf(context);
          }}
        />
      )}
    </div>
  );
}
