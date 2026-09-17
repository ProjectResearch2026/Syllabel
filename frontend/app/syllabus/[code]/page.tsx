import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  BookOpen,
  Target,
  Presentation,
  BookMarked,
  Clock3,
  ClipboardCheck,
  CheckCheck,
  Info,
  List,
  TriangleAlert,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import { getSyllabus } from "@/lib/syllabus-api";
import { listHref } from "@/lib/syllabusQuery";
import { parseGrading } from "@/lib/grading";
import { courseQuestions } from "@/lib/courseQuestions";
import { parseNote, registrationFlags, pruneNote } from "@/lib/note";
import { targetsOf } from "@/lib/courseTarget";
import { formatGrade } from "@/lib/schedule";
import SyllabusChatBox from "../_components/SyllabusChatBox";
import CourseChatPanel from "../_components/CourseChatPanel";
import GradingContent from "../_components/GradingContent";
import CourseFacts from "./_components/CourseFacts";
import CourseNote from "./_components/CourseNote";
import CoursePlan from "./_components/CoursePlan";
import BookList from "./_components/BookList";
import RichText from "./_components/RichText";
import CourseTag from "./_components/CourseTag";
import CourseTabs, { type CourseTab } from "./_components/CourseTabs";
import PanelCard from "./_components/PanelCard";
import AddToTimetableButton from "./_components/AddToTimetableButton";

type Params = Promise<{ code: string }>;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/** 概要タブの中の1節。見出し（赤アイコン＋太字）と本文。 */
function OverviewSection({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="flex items-center gap-2 text-[13px] font-bold text-fg-primary">
        <Icon size={15} className="shrink-0 text-accent" aria-hidden="true" />
        {title}
      </h3>
      <div className="text-[13.5px] leading-6 text-fg-secondary">{children}</div>
    </section>
  );
}

/** 履修条件・備考の「ラベル / 値」1組。 */
function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
      <p className="text-[10.5px] font-bold leading-[15px] tracking-[0.4px] text-fg-muted">
        {label}
      </p>
      <p className="text-[13px] font-medium leading-5 text-fg-primary">{value}</p>
    </div>
  );
}

export default async function SyllabusDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { code } = await params;
  // 一覧の絞り込みは `back` に畳んで渡ってくる(`lib/syllabusQuery.ts`)
  const backTo = listHref((await searchParams).back);

  let syllabus;
  try {
    syllabus = await getSyllabus(code);
  } catch {
    notFound();
  }

  // `grading` は JSON 文字列なので構造に戻してから描く(`lib/grading.ts`)
  const grading = parseGrading(syllabus.grading);
  // `note` は履修登録の注記。登録方法だけ見出しに出し、残りは備考カードへ(`lib/note.ts`)
  const note = parseNote(syllabus.note);
  const registration = note ? registrationFlags(note) : [];
  const targets = targetsOf(syllabus);
  // 見出しと基本情報に出した分を引いた残り。無ければカードごと出さない
  const noteBody = note ? pruneNote(note, targets) : null;
  // チャットのサジェストは、その科目のシラバスで答えられるものだけにする(§7.5)
  const questions = courseQuestions(syllabus);

  const hasBooks =
    syllabus.textbooks.length > 0 || syllabus.textbook_note || syllabus.reference_note;
  const hasMaterialsTab = hasBooks || syllabus.advice || noteBody || targets.length > 0;

  // ---- 概要タブ ----
  const hasOverview = !!(
    syllabus.summary ||
    syllabus.goals ||
    syllabus.methods ||
    syllabus.outside_study
  );

  // 到達目標は行ごとの箇条書き。1行しか無いときは箇条書きにしない
  const goals =
    syllabus.goals
      ?.split("\n")
      .map((line) => line.replace(/^[・･\-—\s]+/, "").trim())
      .filter(Boolean) ?? [];

  const tabs: CourseTab[] = [];

  if (hasOverview) {
    tabs.push({
      id: "overview",
      label: "概要",
      panel: (
        <div className="flex flex-col gap-6 rounded-xl border border-border-primary bg-surface-primary p-7">
          {syllabus.summary && (
            <OverviewSection icon={BookOpen} title="授業概要">
              <RichText>{syllabus.summary}</RichText>
            </OverviewSection>
          )}

          {goals.length > 0 && (
            <OverviewSection icon={Target} title="到達目標">
              {goals.length === 1 ? (
                <RichText>{goals[0]}</RichText>
              ) : (
                <ul className="flex flex-col gap-2">
                  {goals.map((goal) => (
                    <li key={goal} className="flex items-start gap-2.5">
                      <span
                        className="mt-[9px] size-[5px] shrink-0 rounded-full bg-fg-icon"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">{goal}</span>
                    </li>
                  ))}
                </ul>
              )}
            </OverviewSection>
          )}

          {/* 授業方法と授業外学習は短い。横に並べて縦の伸びを抑える */}
          {(syllabus.methods || syllabus.outside_study) && (
            <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
              {syllabus.methods && (
                <div className="min-w-0 flex-1">
                  <OverviewSection icon={Presentation} title="授業方法">
                    <RichText>{syllabus.methods}</RichText>
                  </OverviewSection>
                </div>
              )}
              {syllabus.outside_study && (
                <div className="min-w-0 flex-1">
                  <OverviewSection icon={Clock3} title="授業外学習">
                    <RichText>{syllabus.outside_study}</RichText>
                  </OverviewSection>
                </div>
              )}
            </div>
          )}
        </div>
      ),
    });
  }

  if (syllabus.course_plan.length > 0) {
    tabs.push({
      id: "plan",
      label: "授業計画",
      panel: (
        <PanelCard
          icon={List}
          title="授業計画"
          count={`全${syllabus.course_plan.length}回`}
          bodyClassName="p-0"
          note={
            <span className="flex items-center gap-1.5 text-[11.5px] text-fg-muted">
              <Info size={13} className="shrink-0 text-fg-icon" aria-hidden="true" />
              進度により内容が前後する場合があります
            </span>
          }
        >
          <CoursePlan plan={syllabus.course_plan} />
        </PanelCard>
      ),
    });
  }

  if (grading) {
    tabs.push({
      id: "grading",
      label: "成績評価",
      panel: (
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
          <PanelCard icon={ClipboardCheck} title="評価の内訳" className="min-w-0 flex-1">
            <GradingContent grading={grading} showFreeText={false} />
          </PanelCard>

          {/*
            評価の補足は `grading` の自由記述から採る。`advice`（受講に際しての注意）は
            評価の話とは限らないため、ここには出さず教材タブに一度だけ置く
          */}
          {grading.kind === "structured" && grading.freeText && (
            <PanelCard
              icon={TriangleAlert}
              title="評価にあたっての注意"
              className="w-full shrink-0 xl:w-[352px]"
            >
              <RichText>{grading.freeText}</RichText>
            </PanelCard>
          )}
        </div>
      ),
    });
  }

  if (hasMaterialsTab) {
    tabs.push({
      id: "materials",
      label: "教材・履修上の注意",
      panel: (
        <>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
            {hasBooks && (
              <PanelCard
                icon={BookMarked}
                title="テキスト・参考文献"
                className="min-w-0 flex-1"
              >
                <BookList
                  books={syllabus.textbooks}
                  textbookNote={syllabus.textbook_note}
                  referenceNote={syllabus.reference_note}
                />
              </PanelCard>
            )}

            <PanelCard
              icon={CheckCheck}
              title="履修条件"
              className="w-full shrink-0 xl:w-[352px]"
            >
              {registration.length > 0 && (
                <FieldRow label="登録方法" value={registration.join("・")} />
              )}
              {targets.length > 0 && (
                <FieldRow
                  label={syllabus.programs.length > 0 ? "対象課程" : "対象学部"}
                  value={targets.join("・")}
                />
              )}
              <FieldRow label="配当年次" value={formatGrade(syllabus)} />
              <FieldRow label="単位" value={`${syllabus.credits}単位`} />
            </PanelCard>
          </div>

          {(syllabus.advice || noteBody) && (
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
              {syllabus.advice && (
                <PanelCard
                  icon={TriangleAlert}
                  title="受講に際しての注意"
                  className="min-w-0 flex-1"
                >
                  <RichText>{syllabus.advice}</RichText>
                </PanelCard>
              )}

              {noteBody && (
                <PanelCard icon={Info} title="備考" className="min-w-0 flex-1">
                  <CourseNote note={noteBody} />
                </PanelCard>
              )}
            </div>
          )}
        </>
      ),
    });
  }

  const hero = (
    <header className="flex flex-col gap-4 rounded-xl border border-border-primary bg-surface-primary p-5 md:p-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-surface-gray px-2 py-0.5 font-mono text-[11px] font-bold tracking-[0.04em] text-fg-secondary">
            {syllabus.syllabus_code}
          </span>
          <span className="text-[11px] font-semibold text-fg-muted">{syllabus.year}年度</span>
          <CourseTag
            code={syllabus.syllabus_code}
            target={{ programs: syllabus.programs, faculties: syllabus.faculties }}
          />
          {/* 抽選かオープンかは履修できるかどうかそのもの(§8.1) */}
          {registration.map((flag) => (
            <span
              key={flag}
              className="inline-flex items-center gap-1 rounded-md border border-tag-selective-border bg-tag-selective-bg px-2 py-0.5 text-[11px] font-bold text-tag-selective-fg"
            >
              <Ticket size={12} aria-hidden="true" />
              {flag}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between gap-6">
          <h1 className="min-w-0 flex-1 font-display text-[26px] font-bold leading-[33px] text-fg-primary">
            {syllabus.course_title}
          </h1>
          <div className="hidden md:block">
            <AddToTimetableButton title={syllabus.course_title} />
          </div>
        </div>

        {syllabus.subtitle && (
          <p className="text-[15px] leading-[23px] text-fg-secondary">{syllabus.subtitle}</p>
        )}
      </div>

      <CourseFacts syllabus={syllabus} />
    </header>
  );

  const backBar = (
    <Link
      href={backTo}
      className="-ml-1.5 inline-flex w-fit items-center gap-1 rounded-lg px-1.5 py-1 text-[13px] font-medium text-fg-secondary transition-colors hover:bg-surface-primary hover:text-fg-primary"
    >
      <ChevronLeft size={16} aria-hidden="true" />
      シラバス一覧に戻る
    </Link>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 gap-4">
      {/*
        ui-design_pc.pen 06_講義詳細 MainArea。
        見出しカードは固定、タブの中身だけが縦に伸びる。
      */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 px-4 py-5 md:overflow-y-auto md:px-0 md:py-0">
        {backBar}
        {hero}
        <CourseTabs tabs={tabs} />

        {/* モバイルはこの位置にチャット(デスクトップは右のパネル) */}
        <div className="md:hidden">
          <SyllabusChatBox
            code={syllabus.syllabus_code}
            title="この講義について質問"
            placeholder="この講義について質問..."
            initialMessage={`「${syllabus.course_title}」についてご質問ください。`}
            questions={questions}
          />
        </div>
      </main>

      {/* 行の高さいっぱいに伸ばすため、包みも flex にしておく（block だと潰れる） */}
      <div className="hidden min-h-0 shrink-0 md:flex">
        <CourseChatPanel
          code={syllabus.syllabus_code}
          title={syllabus.course_title}
          questions={questions}
        />
      </div>
    </div>
  );
}
