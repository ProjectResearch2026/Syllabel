import { Suspense } from "react";
import { ArrowUpDown } from "lucide-react";
import { searchSyllabi, getMasters } from "@/lib/syllabus-api";
import CourseCard from "./_components/CourseCard";
import SyllabusTopBar from "./_components/SyllabusTopBar";
import SyllabusFilters from "./_components/SyllabusFilters";
import SyllabusChatBox from "./_components/SyllabusChatBox";
import SyllabusPagination from "./_components/SyllabusPagination";

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

  const [data, masters] = await Promise.all([
    searchSyllabi({ q, faculty, campus, term, day, year, limit: LIMIT, offset }),
    getMasters(),
  ]);

  return (
    <div className="flex flex-col flex-1 min-w-0">
      <Suspense>
        <SyllabusTopBar />
      </Suspense>

      <div className="flex flex-1 min-w-0">
        <Suspense>
          <SyllabusFilters masters={masters} currentNendo={currentNendo} />
        </Suspense>

        <main className="flex-1 min-w-0 bg-[#F8F9FA] px-4 md:px-6 py-5">
          {/* Result header */}
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-[#1A2B4E] text-sm font-bold">
              検索結果 {data.count.toLocaleString()}件
            </h1>
            <div className="flex items-center gap-1.5 text-[#4B5563] text-xs">
              <ArrowUpDown size={14} />
              <span>配当年次順</span>
            </div>
          </div>

          {/* Card grid */}
          {data.results.length === 0 ? (
            <p className="text-sm text-[#6B7280] text-center py-16">該当する科目がありません</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.results.map((c) => (
                <CourseCard key={`${c.syllabus_code}-${c.year}`} course={c} />
              ))}
            </div>
          )}

          <Suspense>
            <SyllabusPagination total={data.count} limit={LIMIT} offset={offset} />
          </Suspense>

          <div id="ai-chat" className="mt-8 scroll-mt-32">
            <SyllabusChatBox
              title="AIに質問する（シラバス全体）"
              placeholder="シラバスについて質問..."
              initialMessage='シラバスについて質問してください。例：「プログラミングを扱う選択科目を一覧で」'
            />
          </div>
        </main>
      </div>
    </div>
  );
}
