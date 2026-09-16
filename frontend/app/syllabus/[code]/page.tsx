import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  BookOpen,
  Target,
  Presentation,
  BookMarked,
  ClipboardCheck,
  Library,
  Info,
  ListOrdered,
  StickyNote,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import { getSyllabus } from "@/lib/syllabus-api";
import { listHref } from "@/lib/syllabusQuery";
import { parseGrading } from "@/lib/grading";
import { courseQuestions } from "@/lib/courseQuestions";
import { parseNote, registrationFlags, pruneNote } from "@/lib/note";
import { targetsOf } from "@/lib/courseTarget";
import SyllabusChatBox from "../_components/SyllabusChatBox";
import CourseChatPanel from "../_components/CourseChatPanel";
import GradingContent from "../_components/GradingContent";
import CourseFacts from "./_components/CourseFacts";
import CourseNote from "./_components/CourseNote";
import CoursePlan from "./_components/CoursePlan";
import BookList from "./_components/BookList";
import RichText from "./_components/RichText";
import CourseTag from "./_components/CourseTag";

type Params = Promise<{ code: string }>;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border-primary bg-surface-primary p-5">
      <div className="flex items-center gap-2">
        <Icon size={15} className="text-accent" aria-hidden="true" />
        <h2 className="text-[13px] font-bold text-fg-primary">{title}</h2>
      </div>
      <div className="text-[13px] text-fg-secondary">{children}</div>
    </section>
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
  // 見出しと基本情報に出した分を引いた残り。無ければカードごと出さない
  const noteBody = note ? pruneNote(note, targetsOf(syllabus)) : null;
  const prose: { icon: LucideIcon; title: string; body: string | null }[] = [
    { icon: BookOpen, title: "授業概要", body: syllabus.summary },
    { icon: Target, title: "到達目標", body: syllabus.goals },
    { icon: Presentation, title: "授業方法", body: syllabus.methods },
    { icon: BookMarked, title: "授業外学習", body: syllabus.outside_study },
  ];
  // チャットのサジェストは、その科目のシラバスで答えられるものだけにする(§7.5)
  const questions = courseQuestions(syllabus);
  const hasBooks =
    syllabus.textbooks.length > 0 || syllabus.textbook_note || syllabus.reference_note;

  return (
    <div className="flex min-w-0 flex-1 items-start">
      <main className="min-w-0 flex-1 bg-surface-gray px-4 py-5 md:px-8 md:py-6">
        <Link
          href={backTo}
          className="-ml-1.5 inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[13px] font-medium text-fg-secondary transition-colors hover:bg-surface-primary hover:text-fg-primary"
        >
          <ChevronLeft size={16} aria-hidden="true" />
          シラバス一覧に戻る
        </Link>

        {/* 見出し + 基本情報。開講期はここに一度だけ出す(以前はバッジと
            メタ行で「後期」が二重になっていた) */}
        <header className="mt-3 flex flex-col gap-4 rounded-xl border border-border-primary bg-surface-primary p-5 md:p-6">
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
                  className="inline-flex items-center gap-1 rounded-md border border-[#FCD34D] bg-[#FFFBEB] px-2 py-0.5 text-[11px] font-bold text-[#B45309]"
                >
                  <Ticket size={12} aria-hidden="true" />
                  {flag}
                </span>
              ))}
            </div>
            <h1 className="font-display text-[26px] font-bold leading-tight text-fg-primary">
              {syllabus.course_title}
            </h1>
            {syllabus.subtitle && (
              <p className="text-[15px] text-fg-secondary">{syllabus.subtitle}</p>
            )}
          </div>

          <div className="border-t border-border-subtle pt-4">
            <CourseFacts syllabus={syllabus} />
          </div>
        </header>

        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start">
          {/* 左は読み物、右は参照物。縦に積むと本文がいたずらに長くなる */}
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {prose
              .filter((section) => section.body)
              .map((section) => (
                <SectionCard key={section.title} icon={section.icon} title={section.title}>
                  <RichText>{section.body as string}</RichText>
                </SectionCard>
              ))}

            {syllabus.course_plan.length > 0 && (
              <SectionCard icon={ListOrdered} title="授業計画">
                <CoursePlan plan={syllabus.course_plan} />
              </SectionCard>
            )}
          </div>

          <div className="flex w-full shrink-0 flex-col gap-4 lg:w-[320px]">
            {grading && (
              <SectionCard icon={ClipboardCheck} title="成績評価">
                <GradingContent grading={grading} />
              </SectionCard>
            )}

            {syllabus.advice && (
              <SectionCard icon={Info} title="受講に際しての注意">
                <RichText>{syllabus.advice}</RichText>
              </SectionCard>
            )}

            {noteBody && (
              <SectionCard icon={StickyNote} title="備考">
                <CourseNote note={noteBody} />
              </SectionCard>
            )}

            {/* 書誌は件数が多く縦に長いので最後に置く */}
            {hasBooks && (
              <SectionCard icon={Library} title="テキスト・参考文献">
                <BookList
                  books={syllabus.textbooks}
                  textbookNote={syllabus.textbook_note}
                  referenceNote={syllabus.reference_note}
                />
              </SectionCard>
            )}

          </div>
        </div>

        {/* モバイルはこの位置にチャット(デスクトップは右のパネル) */}
        <div className="mt-4 md:hidden">
          <SyllabusChatBox
            code={syllabus.syllabus_code}
            title="この講義について質問"
            placeholder="この講義について質問..."
            initialMessage={`「${syllabus.course_title}」についてご質問ください。`}
            questions={questions}
          />
        </div>
      </main>

      <CourseChatPanel
        code={syllabus.syllabus_code}
        title={syllabus.course_title}
        questions={questions}
      />
    </div>
  );
}
