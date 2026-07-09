import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getSyllabus } from "@/lib/syllabus-api";
import SyllabusChatBox from "../_components/SyllabusChatBox";

type Params = Promise<{ code: string }>;
type SearchParams = Promise<{ year?: string }>;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-[#1A2B4E] border-b border-[#E5E7EB] pb-1 mb-2">{title}</h2>
      <div className="text-sm text-[#374151] leading-relaxed whitespace-pre-wrap">{children}</div>
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

  return (
    <div className="max-w-screen-md mx-auto px-4 md:px-8 py-6">
      <Link
        href="/syllabus"
        className="inline-flex items-center gap-1 text-xs text-[#6B7280] hover:text-[#1A2B4E] transition-colors mb-4"
      >
        <ChevronLeft size={14} />
        シラバス一覧に戻る
      </Link>

      <div className="bg-white border border-[#D1D5DB] rounded-xl overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-[#E5E7EB]">
          <p className="text-xs text-[#6B7280] mb-1">{syllabus.syllabus_code} · {syllabus.year}年度</p>
          <h1 className="text-lg font-bold text-[#1A2B4E]">
            {syllabus.course_title}
            {syllabus.subtitle && <span className="text-sm font-normal text-[#6B7280] ml-2">({syllabus.subtitle})</span>}
          </h1>
          {instructorNames && (
            <p className="text-sm text-[#374151] mt-1">{instructorNames}</p>
          )}
        </div>

        <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs border-b border-[#E5E7EB]">
          <div>
            <span className="text-[#9CA3AF]">キャンパス</span>
            <p className="font-medium text-[#1A2B4E]">{syllabus.campus}</p>
          </div>
          <div>
            <span className="text-[#9CA3AF]">開講期</span>
            <p className="font-medium text-[#1A2B4E]">{syllabus.term}</p>
          </div>
          <div>
            <span className="text-[#9CA3AF]">時限</span>
            <p className="font-medium text-[#1A2B4E]">{syllabus.day_of_week}曜 {syllabus.period}限</p>
          </div>
          <div>
            <span className="text-[#9CA3AF]">単位</span>
            <p className="font-medium text-[#1A2B4E]">{syllabus.credits}単位</p>
          </div>
          <div>
            <span className="text-[#9CA3AF]">配当学年</span>
            <p className="font-medium text-[#1A2B4E]">{syllabus.grade_raw}</p>
          </div>
          {syllabus.faculties.length > 0 && (
            <div className="col-span-2">
              <span className="text-[#9CA3AF]">学部</span>
              <p className="font-medium text-[#1A2B4E]">{syllabus.faculties.join("・")}</p>
            </div>
          )}
          {syllabus.room && (
            <div>
              <span className="text-[#9CA3AF]">教室</span>
              <p className="font-medium text-[#1A2B4E]">{syllabus.room}</p>
            </div>
          )}
        </div>

        {syllabus.note && (
          <div className="px-5 py-3 bg-[#FFFBEB] border-b border-[#E5E7EB]">
            <p className="text-xs text-[#92400E]">{syllabus.note}</p>
          </div>
        )}

        <div className="px-5 py-4 space-y-5">
          {syllabus.goals && <Section title="到達目標">{syllabus.goals}</Section>}
          {syllabus.summary && <Section title="授業概要">{syllabus.summary}</Section>}
          {syllabus.methods && <Section title="授業方法">{syllabus.methods}</Section>}
          {syllabus.outside_study && <Section title="授業外学習">{syllabus.outside_study}</Section>}
          {syllabus.grading && <Section title="成績評価">{syllabus.grading}</Section>}
          {syllabus.textbook_note && <Section title="テキスト">{syllabus.textbook_note}</Section>}
          {syllabus.reference_note && <Section title="参考書">{syllabus.reference_note}</Section>}
          {syllabus.advice && <Section title="受講に際しての注意">{syllabus.advice}</Section>}
        </div>
      </div>

      {syllabus.course_plan.length > 0 && (
        <div className="bg-white border border-[#D1D5DB] rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-[#E5E7EB] bg-[#F9FAFB]">
            <h2 className="text-sm font-semibold text-[#1A2B4E]">授業計画</h2>
          </div>
          <div className="divide-y divide-[#F3F4F6]">
            {syllabus.course_plan.map((plan) => (
              <div key={plan.session_number} className="flex gap-3 px-5 py-3">
                <span className="text-xs font-semibold text-[#9CA3AF] w-6 shrink-0 pt-0.5">
                  {plan.session_number}
                </span>
                <p className="text-sm text-[#374151]">{plan.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <SyllabusChatBox
        title="AIに質問する（この講義について）"
        placeholder="この講義について質問..."
        initialMessage={`「${syllabus.course_title}」についてご質問ください。例：「この講義の成績評価方法は？」`}
      />
    </div>
  );
}
