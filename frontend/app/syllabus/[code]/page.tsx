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
  Info,
  List,
  TriangleAlert,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import { getSyllabus } from "@/lib/syllabus-api";
import { fetchBookInfo } from "@/lib/openbd";
import { backLink } from "@/lib/syllabusQuery";
import { parseGrading } from "@/lib/grading";
import { courseQuestions } from "@/lib/courseQuestions";
import { parseNote, registrationFlags, pruneNote } from "@/lib/note";
import { targetsOf } from "@/lib/courseTarget";
import CourseMobileAssistant from "../_components/CourseMobileAssistant";
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
    // モバイルは節ごとに1枚のカード(ui-design_phone.pen TabBody_概要 Panel_*)。PC は1枚のカードの中の節
    <section className="flex flex-col gap-2 rounded-lg border border-border-primary bg-surface-primary p-3.5 md:gap-2.5 md:rounded-none md:border-0 md:bg-transparent md:p-0">
      <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg-primary md:gap-2 md:text-[13px]">
        <Icon size={15} className="shrink-0 text-accent" aria-hidden="true" />
        {title}
      </h3>
      <div className="text-[13px] leading-6 text-[#333333] md:text-[13.5px] md:text-fg-secondary">{children}</div>
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
  // 一覧の絞り込みは `back` に畳んで渡ってくる。履修提案の時間割から開いたときは
  // `from=proposal` で、戻り先は時間割になる(`lib/syllabusQuery.ts`、§8.3.4)
  const back = backLink(await searchParams);

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

  const hasBooks = !!(
    syllabus.textbooks.length > 0 ||
    syllabus.textbook_note ||
    syllabus.reference_note
  );
  // 履修条件カードを畳んだので、このタブは教材・注意・備考のどれかがあるときだけ出す。
  // 以前は対象課程があるだけで(＝ほぼ全科目で)開けてしまっていた
  const hasMaterialsTab = !!(hasBooks || syllabus.advice || noteBody);

  // 書影と書誌の詳細は ISBN から openBD に引く(§6.4)。引けた本だけ書影が付き、
  // 書名を押すと開くようになる。ISBN が要るので詳細の取得より後になるが、
  // 1科目ぶんを1リクエストにまとめている
  const bookInfo = await fetchBookInfo(syllabus.textbooks.map((book) => book.isbn));

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
        /*
          広い画面は2列に分ける。左は長い読み物(授業概要・授業方法)、右は短い
          箇条書き(到達目標・授業外学習)。1列に積むと、本文は読める幅(RichText の
          44em)で止まるのに到達目標はカードの端まで伸び、授業方法と授業外学習を
          横に並べると高さが揃わず、右端と下端がばらばらになっていた。
          狭い画面では列の包みを `contents` で外し、`order` で 概要 → 目標 → 方法 →
          授業外学習 の順に1列に積む
        */
        <div className="flex flex-col gap-3 md:gap-6 md:rounded-xl md:border md:border-border-primary md:bg-surface-primary md:p-7 xl:flex-row xl:gap-10">
          {(syllabus.summary || syllabus.methods) && (
            <div className="contents xl:flex xl:min-w-0 xl:flex-[3] xl:flex-col xl:gap-6">
              {syllabus.summary && (
                <div className="order-1 xl:order-none">
                  <OverviewSection icon={BookOpen} title="授業概要">
                    <RichText>{syllabus.summary}</RichText>
                  </OverviewSection>
                </div>
              )}
              {syllabus.methods && (
                <div className="order-3 xl:order-none">
                  <OverviewSection icon={Presentation} title="授業方法">
                    <RichText>{syllabus.methods}</RichText>
                  </OverviewSection>
                </div>
              )}
            </div>
          )}

          {(goals.length > 0 || syllabus.outside_study) && (
            <div className="contents xl:flex xl:min-w-0 xl:flex-[2] xl:flex-col xl:gap-6 xl:border-l xl:border-card-divider xl:pl-10">
              {goals.length > 0 && (
                <div className="order-2 xl:order-none">
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
                </div>
              )}
              {syllabus.outside_study && (
                <div className="order-4 xl:order-none">
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
            <span className="hidden items-center gap-1.5 text-[11.5px] text-fg-muted md:flex">
              <Info size={13} className="shrink-0 text-fg-icon" aria-hidden="true" />
              進度により内容が前後する場合があります
            </span>
          }
        >
          <CoursePlan plan={syllabus.course_plan} />
          {/* モバイルは見出しの右に置けないので表の下に置く(ui-design_phone.pen TabBody_授業計画) */}
          <p className="px-3.5 pb-3 pt-2 text-[10px] text-fg-secondary md:hidden">
            進度により内容が前後する場合があります
          </p>
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
          {/*
            ui-design_pc.pen 06_講義詳細_教材・履修上の注意 Row_A。
            **「履修条件」カードは置かない。** 対象課程・配当年次・単位は見出しカードの
            基本情報(`CourseFacts`)に、登録方法は見出しのタグに既に出ており、
            同じ値を1画面に二度並べていた
          */}
          {(hasBooks || noteBody) && (
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
                    bookInfo={bookInfo}
                  />
                </PanelCard>
              )}

              {/* 備考は右の列。教材が無い科目では1枚で全幅を使う */}
              {noteBody && (
                <PanelCard
                  icon={Info}
                  title="備考"
                  className={
                    hasBooks ? "w-full shrink-0 xl:w-[352px]" : "min-w-0 flex-1"
                  }
                >
                  <CourseNote note={noteBody} />
                </PanelCard>
              )}
            </div>
          )}

          {/* Row_B。受講に際しての注意は横に並べず全幅に置く */}
          {syllabus.advice && (
            <PanelCard icon={TriangleAlert} title="受講に際しての注意">
              <RichText>{syllabus.advice}</RichText>
            </PanelCard>
          )}
        </>
      ),
    });
  }

  // 時間割に入れるのに要る分だけを渡す(クライアントコンポーネントへ本体を丸ごと送らない)
  const addButton = (
    <AddToTimetableButton
      syllabus={{
        syllabus_code: syllabus.syllabus_code,
        course_title: syllabus.course_title,
        subtitle: syllabus.subtitle,
        slots: syllabus.slots,
        day_of_week: syllabus.day_of_week,
        period: syllabus.period,
        term_name: syllabus.term_name,
        credits: syllabus.credits,
      }}
      target={{ programs: syllabus.programs, faculties: syllabus.faculties }}
    />
  );

  const hero = (
    /* モバイルは画面幅いっぱいの白地(ui-design_phone.pen 06 Hero)、PC は浮いたカード */
    <header className="flex flex-col gap-2.5 border-b border-border-primary bg-surface-primary p-4 md:gap-4 md:rounded-xl md:border md:p-6">
      <div className="flex flex-col gap-2.5 md:gap-2">
        <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
          <span className="rounded bg-fg-primary px-1.5 py-0.5 tabular-nums text-[11px] font-bold tracking-[0.04em] text-fg-inverse md:rounded-md md:bg-surface-gray md:px-2 md:text-fg-secondary">
            {syllabus.syllabus_code}
          </span>
          <span className="text-[11px] text-fg-secondary md:font-semibold md:text-fg-muted">{syllabus.year}年度</span>
          {/* モバイルは自分の課程での区分を1行に分ける */}
          <span className="basis-full md:basis-auto">
            <CourseTag
              code={syllabus.syllabus_code}
              target={{ programs: syllabus.programs, faculties: syllabus.faculties }}
            />
          </span>
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
          <h1 className="min-w-0 flex-1 font-display text-[22px] font-bold leading-[29px] text-fg-primary md:text-[26px] md:leading-[33px]">
            {syllabus.course_title}
          </h1>
          <div className="hidden md:block">
            {addButton}
          </div>
        </div>

        {syllabus.subtitle && (
          <p className="-mt-1.5 text-[13px] leading-5 text-fg-secondary md:mt-0 md:text-[15px] md:leading-[23px]">
            {syllabus.subtitle}
          </p>
        )}

        {/* モバイルは見出しの下に全幅で置く(ui-design_phone.pen 06 Hero) */}
        <div className="flex flex-col md:hidden [&>*]:w-full [&>*]:justify-center">
          {addButton}
        </div>
      </div>

      <CourseFacts syllabus={syllabus} />
    </header>
  );

  const backBar = (
    <Link
      href={back.href}
      className="flex h-12 items-center gap-1.5 border-b border-border-primary bg-surface-primary px-4 text-[13px] font-semibold text-fg-primary md:-ml-1.5 md:inline-flex md:h-auto md:w-fit md:gap-1 md:rounded-lg md:border-0 md:bg-transparent md:px-1.5 md:py-1 md:font-medium md:text-fg-secondary md:transition-colors md:hover:bg-surface-primary md:hover:text-fg-primary"
    >
      <ChevronLeft size={18} className="md:size-4" aria-hidden="true" />
      {back.label}
    </Link>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 gap-4 md:pc-viewport">
      {/*
        ui-design_pc.pen 06_講義詳細 MainArea。
        見出しカードは固定、タブの中身だけが縦に伸びる。
      */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col md:gap-5 md:overflow-y-auto">
        {backBar}
        {hero}
        <CourseTabs tabs={tabs} />

        {/* モバイルの AI はボトムドックの Ask Bar から開くシート(デスクトップは右のパネル)。
            どちらも同じ会話を読み書きする */}
        <CourseMobileAssistant
          code={syllabus.syllabus_code}
          title={syllabus.course_title}
          questions={questions}
        />
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
