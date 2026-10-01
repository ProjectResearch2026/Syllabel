"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileUp } from "lucide-react";
import logoMark from "@/public/logo.svg";
import { useStudentStore } from "@/lib/student";
import { useProposalStore } from "@/lib/proposal";
import { useCreditSummary } from "@/lib/creditSummary";
import { coursesToSlotTable } from "@/lib/timetable";
import { useTimetableEditing } from "@/lib/useTimetableEditing";
import { courseContext, slotContext, TIMETABLE_CONTEXT, useAiStore } from "@/lib/ai";
import { useProposalAssistant } from "@/lib/useProposalConversation";
import MobileAiAssistant from "@/components/ai/MobileAiAssistant";
import TimetableGrid, {
  DEFAULT_ROW_HEIGHT,
  MIN_ROW_HEIGHT,
  entryKey,
  type SelectedCourse,
} from "@/app/_components/TimetableGrid";
import SlotPopover, { type SlotTarget } from "@/app/_components/SlotPopover";
import CourseMenu, { type CourseTarget } from "@/app/_components/CourseMenu";
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
 * 時間割＝履修提案（モバイル。ui-design_phone.pen 04-1〜04-3、`/proposal`）。
 *
 * **PC と同じ URL・同じ中身を持つ。** 単位バー・提案する学期・卒業要件の帯・時間割は
 * PC と同じ集計と同じ表の形（`coursesToSlotTable()`）で、AI は PC の右パネルと同じ
 * 会話（`useProposalAssistant()`）をボトムドックの Ask Bar から開くシートに出す。
 * 以前のモバイルは `/` に時間割、`/proposal` に別物の提案チャットを持っていた。
 *
 * **この画面に来ただけでは提案を撃たない**（design.md §8.3）。提案前に Ask Bar を
 * 押すと、全画面のシートで希望条件を聞く（AI_STEP0）。
 */
/** 曜日の見出しの高さ(px)。`TimetableGrid` の `h-8` */
const GRID_HEADER_HEIGHT = 32;

/**
 * 時間割の5限までが、ボトムドックに隠れずに1画面に収まる1コマの高さを返す。
 *
 * 時間割より上(単位バー・提案する学期・卒業要件の帯)の高さは学生と端末で変わり、
 * 72px 固定では背の低い端末で5限がドックの下に隠れていた。表の上端から画面の下端までの
 * 余りを5コマで割り、`MIN_ROW_HEIGHT`〜`DEFAULT_ROW_HEIGHT` に収める(下回る端末ではスクロールする)。
 * 表の上端はコマの高さに依らないので、高さを変えても計算は揺れない
 */
function useFittedRowHeight(gridRef: RefObject<HTMLDivElement | null>, pageRef: RefObject<HTMLDivElement | null>) {
  const [height, setHeight] = useState(DEFAULT_ROW_HEIGHT);
  useEffect(() => {
    const grid = gridRef.current;
    const page = pageRef.current;
    if (!grid || !page) return;
    const update = () => {
      const top = grid.getBoundingClientRect().top + window.scrollY;
      const dock = document.querySelector("[data-bottom-dock]")?.getBoundingClientRect().height ?? 0;
      const room = window.innerHeight - top - dock - GRID_HEADER_HEIGHT;
      // 1コマごとに下罫線 1px がある
      const fitted = Math.floor(room / PERIOD_COUNT) - 1;
      setHeight(Math.min(DEFAULT_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, fitted)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(page);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [gridRef, pageRef]);
  return height;
}

const PERIOD_COUNT = 5;

export default function MobileProposalPage() {
  const router = useRouter();
  const profile = useStudentStore((s) => s.profile);
  const { status, courses } = useProposalStore();
  const { requirements } = useCreditSummary();
  const conversation = useProposalAssistant();
  const pageRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const rowHeight = useFittedRowHeight(gridRef, pageRef);

  const setSelection = useAiStore((s) => s.setSelection);
  const openHalf = useAiStore((s) => s.openHalf);
  const expand = useAiStore((s) => s.expand);

  const [selected, setSelected] = useState<SelectedCourse | null>(null);
  const [slotTarget, setSlotTarget] = useState<SlotTarget | null>(null);
  const editing = useTimetableEditing();

  // 生成中に届く snapshot も描く（逐次描画。design.md §6.1.1 / §7.2）
  const { table, unscheduled } = coursesToSlotTable(courses);
  const isIdle = status === "idle";
  const isLoading = status === "loading";

  // 科目を押すと選択し（Ask Bar の文脈になる）、その場のメニューを開く。
  // シラバスを開く・別の科目に変更・時間割から外す はメニューから選ぶ
  const { editable, open: openMenu } = editing;
  const onTapCourse = useCallback(
    (target: CourseTarget) => {
      const { entry, day, period } = target;
      setSelected({ day: day ?? "", period: period ?? 0, key: entryKey(entry) });
      setSelection(courseContext(entry.name, entry.code));
      if (editable) openMenu(target);
    },
    [setSelection, editable, openMenu],
  );

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
    <div ref={pageRef} className="flex min-h-full flex-col bg-surface-primary">
      <MobileAppHeader />
      <MobileCreditBar />
      {/* 提案する学期(lib/targetTerm.ts)。成績表の次の学期に固定で、表示だけする */}
      <TargetTermLabel variant="mobile" />
      <MobileRequirementsStrip view={requirements} />

      <div ref={gridRef} className="relative">
        <TimetableGrid
          rowHeight={rowHeight}
          table={table}
          unscheduled={unscheduled}
          loading={isLoading}
          selected={selected}
          onTapCourse={onTapCourse}
          onTapEmpty={() => {
            setSelected(null);
            setSelection(null);
          }}
          onLongPressEmpty={setSlotTarget}
        />

        {/* まだ投げていないこと（§5.2.3 の `idle`）を示す。空の表だけでは、提案が
            終わって何も無いのか、これからなのかが区別できない（§8.3.2） */}
        {isIdle && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-surface-primary/80">
            <p className="max-w-[240px] text-center text-xs leading-5 text-fg-tertiary">
              下のAI履修アシスタントに希望条件を送ると、ここに時間割が出ます。
              空きコマを長押しして、シラバスから自分で登録することもできます。
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
          科目をタップすると、シラバスを開く・別の科目に変更・時間割から外すを選べます。空きコマを長押しすると科目を探せます
        </p>
      )}

      <MobileAiAssistant conversation={conversation} base={TIMETABLE_CONTEXT} />

      {editing.menu && (
        <CourseMenu
          target={editing.menu}
          onClose={editing.close}
          onOpenSyllabus={() => editing.openSyllabus(editing.menu!)}
          onReplace={() => editing.replace(editing.menu!)}
          onRemove={() => {
            editing.remove(editing.menu!);
            setSelected(null);
            setSelection(null);
          }}
          onAskAi={() => {
            const context = courseContext(editing.menu!.entry.name, editing.menu!.entry.code);
            editing.close();
            if (conversation.suggestionsFor) openHalf(context);
            else expand(context);
          }}
        />
      )}

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
