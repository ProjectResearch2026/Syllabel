import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  User,
  Award,
  Clock,
  Calendar,
  MapPin,
  GraduationCap,
  BookOpen,
  Target,
  Presentation,
  BookMarked,
  ClipboardCheck,
  Book,
  Library,
  Info,
  ListOrdered,
  type LucideIcon,
} from "lucide-react";
import { getSyllabus } from "@/lib/syllabus-api";
import SyllabusChatBox from "../_components/SyllabusChatBox";
import CourseChatPanel from "../_components/CourseChatPanel";

type Params = Promise<{ code: string }>;
type SearchParams = Promise<{ year?: string }>;

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
    <div className="bg-white rounded-lg border border-[#D1D5DB] p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-[#E60012]" />
        <h2 className="text-sm font-bold text-[#1A2B4E]">{title}</h2>
      </div>
      <div className="text-[13px] text-[#4B5563] leading-[1.8] whitespace-pre-wrap">{children}</div>
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
  const { year } = await searchParams;

  let syllabus;
  try {
    syllabus = await getSyllabus(code, year ? parseInt(year, 10) : undefined);
  } catch {
    notFound();
  }

  const instructorNames = syllabus.instructors.map((i) => i.kanji_name).join("、");

  const meta: { icon: LucideIcon; text: string }[] = [
    ...(instructorNames ? [{ icon: User, text: instructorNames }] : []),
    { icon: Award, text: `${syllabus.credits}単位` },
    { icon: Clock, text: `${syllabus.day_of_week}曜 ${syllabus.period}限` },
    { icon: Calendar, text: `${syllabus.year}年度 ${syllabus.term}` },
    ...(syllabus.campus ? [{ icon: MapPin, text: syllabus.campus }] : []),
    ...(syllabus.grade_raw ? [{ icon: GraduationCap, text: syllabus.grade_raw }] : []),
  ];

  return (
    <div className="flex flex-1 min-w-0">
      {/* Main area */}
      <main className="flex-1 min-w-0 bg-[#F8F9FA] px-4 md:px-8 py-6 flex flex-col gap-5">
        <Link
          href="/syllabus"
          className="inline-flex items-center gap-1 text-[13px] text-[#4B5563] hover:text-[#1A2B4E] transition-colors"
        >
          <ChevronLeft size={16} />
          シラバス一覧に戻る
        </Link>

        {/* Header card */}
        <div className="bg-white rounded-lg border border-[#D1D5DB] p-6 flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <span className="bg-[#1A2B4E] text-white text-[11px] font-bold rounded-xl px-2.5 py-0.5">
              {syllabus.term}
            </span>
            <span className="text-[#4B5563] text-[13px] font-semibold font-mono">
              {syllabus.syllabus_code}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-[#1A2B4E]">
            {syllabus.course_title}
            {syllabus.subtitle && (
              <span className="text-base font-normal text-[#6B7280] ml-2">({syllabus.subtitle})</span>
            )}
          </h1>
          <div className="flex items-center gap-5 flex-wrap">
            {meta.map((m, i) => (
              <span key={i} className="flex items-center gap-1.5 text-[13px] text-[#4B5563]">
                <m.icon size={15} className="text-[#4B5563]" />
                {m.text}
              </span>
            ))}
          </div>
        </div>

        {syllabus.note && (
          <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-lg px-4 py-3">
            <p className="text-xs text-[#92400E]">{syllabus.note}</p>
          </div>
        )}

        {/* Section columns */}
        <div className="flex flex-col lg:flex-row gap-5">
          <div className="flex-1 min-w-0 flex flex-col gap-5">
            {syllabus.summary && (
              <SectionCard icon={BookOpen} title="授業概要">{syllabus.summary}</SectionCard>
            )}
            {syllabus.goals && (
              <SectionCard icon={Target} title="到達目標">{syllabus.goals}</SectionCard>
            )}
            {syllabus.methods && (
              <SectionCard icon={Presentation} title="授業方法">{syllabus.methods}</SectionCard>
            )}
            {syllabus.outside_study && (
              <SectionCard icon={BookMarked} title="授業外学習">{syllabus.outside_study}</SectionCard>
            )}
            {syllabus.course_plan.length > 0 && (
              <div className="bg-white rounded-lg border border-[#D1D5DB] p-5 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <ListOrdered size={16} className="text-[#E60012]" />
                  <h2 className="text-sm font-bold text-[#1A2B4E]">授業計画</h2>
                </div>
                <div className="flex flex-col divide-y divide-[#F3F4F6]">
                  {syllabus.course_plan.map((plan) => (
                    <div key={plan.session_number} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span className="text-xs font-bold text-[#9CA3AF] w-6 shrink-0 pt-0.5 font-mono">
                        {plan.session_number}
                      </span>
                      <p className="text-[13px] text-[#4B5563] leading-relaxed">{plan.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="w-full lg:w-[360px] shrink-0 flex flex-col gap-5">
            {syllabus.grading && (
              <SectionCard icon={ClipboardCheck} title="成績評価">{syllabus.grading}</SectionCard>
            )}
            {syllabus.textbook_note && (
              <SectionCard icon={Book} title="テキスト">{syllabus.textbook_note}</SectionCard>
            )}
            {syllabus.reference_note && (
              <SectionCard icon={Library} title="参考書">{syllabus.reference_note}</SectionCard>
            )}
            {syllabus.advice && (
              <SectionCard icon={Info} title="受講に際しての注意">{syllabus.advice}</SectionCard>
            )}
          </div>
        </div>

        {/* Mobile chat (desktop uses the side panel) */}
        <div className="md:hidden">
          <SyllabusChatBox
            title="この講義について質問"
            placeholder="この講義について質問..."
            initialMessage={`「${syllabus.course_title}」についてご質問ください。例：「この講義の成績評価方法は？」`}
          />
        </div>
      </main>

      {/* Desktop chat panel */}
      <CourseChatPanel code={syllabus.syllabus_code} title={syllabus.course_title} />
    </div>
  );
}
