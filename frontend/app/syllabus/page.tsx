import { Suspense } from "react";
import { searchSyllabi, getMasters } from "@/lib/syllabus-api";
import CourseCard from "./_components/CourseCard";
import CourseCardGrid from "./_components/CourseCardGrid";
import SyllabusSearchForm from "./_components/SyllabusSearchForm";
import SyllabusChatBox from "./_components/SyllabusChatBox";
import SyllabusPagination from "./_components/SyllabusPagination";
import ViewToggle from "./_components/ViewToggle";

const LIMIT = 30;

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function SyllabusPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;

  const now = new Date();
  const currentNendo = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  const q = typeof sp.q === "string" ? sp.q : undefined;
  const faculty = typeof sp.faculty === "string" ? sp.faculty : undefined;
  const campus = typeof sp.campus === "string" ? sp.campus : undefined;
  const term = typeof sp.term === "string" ? sp.term : undefined;
  const day = typeof sp.day === "string" ? sp.day : undefined;
  const year = typeof sp.year === "string" ? parseInt(sp.year, 10) : currentNendo;
  const offset = typeof sp.offset === "string" ? parseInt(sp.offset, 10) : 0;
  const view = typeof sp.view === "string" && sp.view === "grid" ? "grid" : "list";

  const [data, masters] = await Promise.all([
    searchSyllabi({ q, faculty, campus, term, day, year, limit: LIMIT, offset }),
    getMasters(),
  ]);

  return (
    <div className="max-w-screen-xl mx-auto px-4 md:px-8 py-6">
      <h1 className="text-[#1A2B4E] text-xl font-bold mb-4">シラバス検索</h1>

      <Suspense>
        <SyllabusSearchForm masters={masters} currentNendo={currentNendo} />
      </Suspense>

      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-[#6B7280]">
          {data.count.toLocaleString()} 件ヒット
        </p>
        <Suspense>
          <ViewToggle />
        </Suspense>
      </div>

      {view === "grid" ? (
        <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-4">
          {data.results.length === 0 ? (
            <p className="text-sm text-[#6B7280] text-center py-10 col-span-full">該当する科目がありません</p>
          ) : (
            data.results.map((c) => <CourseCardGrid key={`${c.syllabus_code}-${c.year}`} course={c} />)
          )}
        </div>
      ) : (
        <div className="space-y-2 mb-4">
          {data.results.length === 0 ? (
            <p className="text-sm text-[#6B7280] text-center py-10">該当する科目がありません</p>
          ) : (
            data.results.map((c) => <CourseCard key={`${c.syllabus_code}-${c.year}`} course={c} />)
          )}
        </div>
      )}

      <Suspense>
        <SyllabusPagination total={data.count} limit={LIMIT} offset={offset} />
      </Suspense>

      <div className="mt-8">
        <SyllabusChatBox
          title="AIに質問する（シラバス全体）"
          placeholder="シラバスについて質問..."
          initialMessage='シラバスについて質問してください。例：「プログラミングを扱う選択科目を一覧で」'
        />
      </div>
    </div>
  );
}
