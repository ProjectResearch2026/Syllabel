"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileUp, LayoutGrid, List } from "lucide-react";
import logoMark from "@/public/logo.svg";
import { useStudentStore } from "@/lib/student";
import { useProposalStore } from "@/lib/proposal";
import { useCreditSummary } from "@/lib/creditSummary";
import { coursesToSlotTable, type SlotEntry } from "@/lib/timetable";
import { proposalDetailHref } from "@/lib/syllabusQuery";
import { courseContext, slotContext, TIMETABLE_CONTEXT, useAiStore } from "@/lib/ai";
import { useProposalAssistant } from "@/lib/useProposalConversation";
import MobileAiAssistant from "@/components/ai/MobileAiAssistant";
import TimetableGrid, { entryKey, type SelectedCourse } from "@/app/_components/TimetableGrid";
import TimetableDayView from "@/app/_components/TimetableDayView";
import { todayWeekday, useTimetableView, type TimetableView } from "@/lib/timetableView";
import SlotPopover, { type SlotTarget } from "@/app/_components/SlotPopover";
import TargetTermLabel from "./TargetTermLabel";
import { MobileRequirementsStrip } from "./RequirementsPanel";

/**
 * アプリのヘッダー（モバイル）。PC のヘッダー（`components/Header.tsx`）と同じ
 * ロゴマークと「Syllabel」の組を置く。
 */
function MobileAppHeader() {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-border-primary bg-surface-primary px-5">
      <Link href="/proposal" className="flex items-center gap-2">
        {/*
          SVG は最適化の対象外なので `unoptimized`。`"/logo.svg"` と書くと basePath
          （/syllabel）が付かず 404 になるため、PC のヘッダーと同じく静的 import で渡す
        */}
        <Image src={logoMark} alt="" width={36} height={36} priority unoptimized className="shrink-0" />
        <span className="font-display text-xl font-bold leading-none text-fg-primary">Syllabel</span>
      </Link>
    </header>
  );
}

/** 単位バー。PC のヘッダーと同じ集計（`lib/creditSummary.tsx`） */
function MobileCreditBar() {
  const { completedCredits, currentCredits, remainingCredits } = useCreditSummary();
  return (
    <div className="flex h-[52px] shrink-0 items-center justify-around border-b border-border-primary bg-surface-primary px-5">
      {[
        { val: completedCredits, label: "取得済み単位", color: "text-fg-primary" },
        { val: currentCredits, label: "今期登録単位", color: "text-required-tag" },
        { val: remainingCredits, label: "卒業残り単位", color: "text-fg-primary" },
      ].map(({ val, label, color }) => (
        <div key={label} className="flex flex-col items-center gap-0.5">
          <span className={`tabular-nums text-xl font-bold leading-none ${color}`}>{val ?? "—"}</span>
          <span className="text-[10px] text-fg-tertiary">{label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * 時間割の見出しと「週｜曜日」の切り替え（ui-design_phone.pen 04-3 ViewToggleRow）。
 * 選んだ見せ方は `useTimetableView` にメモリで持つ
 */
function TimetableViewToggle({ view, onChange }: { view: TimetableView; onChange: (view: TimetableView) => void }) {
  const options = [
    { value: "week", label: "週", icon: LayoutGrid },
    { value: "day", label: "曜日", icon: List },
  ] as const;
  return (
    <div className="flex items-center justify-between border-t border-border-primary bg-surface-primary px-3 py-2">
      <h2 className="text-sm font-bold text-fg-primary">時間割</h2>
      <div
        role="radiogroup"
        aria-label="時間割の見せ方"
        className="flex gap-0.5 rounded-lg border border-border-primary bg-surface-gray p-0.5"
      >
        {options.map(({ value, label, icon: Icon }) => {
          const active = view === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(value)}
              className={`flex items-center gap-1 rounded-md px-2.5 py-[5px] text-xs ${
                active ? "bg-surface-primary font-bold text-fg-primary shadow-sm" : "font-medium text-fg-muted"
              }`}
            >
              <Icon size={13} aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 時間割＝履修提案（モバイル。ui-design_phone.pen 04-1〜04-3、`/proposal`）。
 *
 * 時間割は「週｜曜日」で見せ方を切り替えられる。週表示は6列のグリッド
 * （`TimetableGrid`）、曜日表示は選んだ曜日の1〜5限の縦のリスト（`TimetableDayView`）で、
 * 中身・選択・長押しのメニューは同じ。
 *
 * **PC と同じ URL・同じ中身を持つ。** 単位バー・提案する学期・卒業要件の帯・時間割は
 * PC と同じ集計と同じ表の形（`coursesToSlotTable()`）で、AI は PC の右パネルと同じ
 * 会話（`useProposalAssistant()`）をボトムドックの Ask Bar から開くシートに出す。
 * 以前のモバイルは `/` に時間割、`/proposal` に別物の提案チャットを持っていた。
 *
 * **この画面に来ただけでは提案を撃たない**（design.md §8.3）。提案前に Ask Bar を
 * 押すと、全画面のシートで希望条件を聞く（AI_STEP0）。
 */
export default function MobileProposalPage() {
  const router = useRouter();
  const profile = useStudentStore((s) => s.profile);
  const { status, courses } = useProposalStore();
  const { requirements } = useCreditSummary();
  const conversation = useProposalAssistant();

  const setSelection = useAiStore((s) => s.setSelection);
  const openHalf = useAiStore((s) => s.openHalf);
  const expand = useAiStore((s) => s.expand);

  const [selected, setSelected] = useState<SelectedCourse | null>(null);
  const view = useTimetableView((s) => s.view);
  const setView = useTimetableView((s) => s.setView);
  // 曜日表示で開いている曜日。開くたびに今日の曜日から始める
  const [day, setDay] = useState(todayWeekday);
  const [slotTarget, setSlotTarget] = useState<SlotTarget | null>(null);

  // 生成中に届く snapshot も描く（逐次描画。design.md §6.1.1 / §7.2）
  const { table, unscheduled } = coursesToSlotTable(courses);
  const isIdle = status === "idle";
  const isLoading = status === "loading";

  const onTapCourse = useCallback(
    (entry: SlotEntry, day: string | null, period: number | null) => {
      const key = entryKey(entry);
      // 選択中の科目をもう一度押すと講義詳細を開く（§8.3.4。戻り先は時間割）
      if (selected?.key === key) {
        if (entry.code) router.push(proposalDetailHref(entry.code));
        return;
      }
      setSelected({ day: day ?? "", period: period ?? 0, key });
      setSelection(courseContext(entry.name, entry.code));
    },
    [selected, router, setSelection],
  );

  const clearSelection = useCallback(() => {
    setSelected(null);
    setSelection(null);
  }, [setSelection]);

  const goSyllabus = (target: SlotTarget, openFilters: boolean) => {
    const params = new URLSearchParams({ day: target.day, period: String(target.period) });
    if (openFilters) params.set("filters", "open");
    setSlotTarget(null);
    router.push(`/syllabus?${params.toString()}`);
  };

  if (!profile) {
    return (
      <div className="flex min-h-full flex-col bg-surface-primary">
        <MobileAppHeader />
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 py-16">
          <div className="grid size-20 place-items-center rounded-full bg-surface-soft">
            <FileUp size={36} className="text-fg-primary" />
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <h2 className="text-lg font-bold text-fg-primary">成績表を取り込んでください</h2>
            <p className="text-sm leading-relaxed text-fg-secondary">
              龍谷大学ポータルからダウンロードした
              <br />
              成績表PDFを取り込むと、時間割と単位情報が表示されます
            </p>
          </div>
          <Link
            href="/"
            className="flex h-[52px] w-full items-center justify-center gap-2 rounded-lg bg-accent transition-colors active:opacity-80"
          >
            <FileUp size={20} className="text-fg-inverse" />
            <span className="text-[15px] font-bold text-fg-inverse">成績表を取り込む</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col bg-surface-primary">
      <MobileAppHeader />
      <MobileCreditBar />
      {/* 提案する学期(lib/targetTerm.ts)。成績表の次の学期に固定で、表示だけする */}
      <TargetTermLabel variant="mobile" />
      <MobileRequirementsStrip view={requirements} />

      <TimetableViewToggle view={view} onChange={setView} />

      <div className="relative">
        {view === "week" ? (
          <TimetableGrid
            table={table}
            unscheduled={unscheduled}
            loading={isLoading}
            selected={selected}
            onTapCourse={onTapCourse}
            onTapEmpty={clearSelection}
            onLongPressEmpty={setSlotTarget}
          />
        ) : (
          <TimetableDayView
            table={table}
            unscheduled={unscheduled}
            loading={isLoading}
            day={day}
            onChangeDay={setDay}
            selected={selected}
            onTapCourse={onTapCourse}
            onTapEmpty={clearSelection}
            onLongPressEmpty={setSlotTarget}
          />
        )}

        {/* まだ投げていないこと（§5.2.3 の `idle`）を示す。空の表だけでは、提案が
            終わって何も無いのか、これからなのかが区別できない（§8.3.2） */}
        {isIdle && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-surface-primary/80">
            <p className="max-w-[240px] text-center text-xs leading-5 text-fg-tertiary">
              下のAI履修アシスタントに希望条件を送ると、ここに時間割が出ます。
            </p>
          </div>
        )}
        {isLoading && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="flex items-center gap-2 rounded-full border border-border-primary bg-surface-primary px-3.5 py-2 shadow-askbar">
              <span className="flex gap-[3px]" aria-hidden="true">
                <span className="size-1.5 animate-bounce rounded-full bg-accent" />
                <span className="size-1.5 animate-bounce rounded-full bg-accent [animation-delay:150ms]" />
                <span className="size-1.5 animate-bounce rounded-full bg-accent/40 [animation-delay:300ms]" />
              </span>
              <span className="text-[11px] text-fg-secondary">提案を作っています（4〜5分）</span>
            </span>
          </div>
        )}
      </div>

      {courses.length > 0 && (
        <p className="px-3 py-2 text-[9px] text-fg-tertiary">
          科目をタップするとAIの文脈に入り、もう一度タップするとシラバスを開きます
        </p>
      )}

      <MobileAiAssistant conversation={conversation} base={TIMETABLE_CONTEXT} />

      {slotTarget && (
        <SlotPopover
          target={slotTarget}
          onClose={() => setSlotTarget(null)}
          onSearch={() => goSyllabus(slotTarget, false)}
          onFilter={() => goSyllabus(slotTarget, true)}
          onAskAi={() => {
            const context = slotContext(slotTarget.day, slotTarget.period);
            setSelected(null);
            setSelection(context);
            setSlotTarget(null);
            // 提案前はサジェストが無いので、希望条件を聞く全画面で開く（AI_STEP0）
            if (conversation.suggestionsFor) openHalf(context);
            else expand(context);
          }}
        />
      )}
    </div>
  );
}
