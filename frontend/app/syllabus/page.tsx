import { Suspense } from "react";
import { ArrowUpDown } from "lucide-react";
import { searchSyllabi, getMasters } from "@/lib/syllabus-api";
import SyllabusTagList from "./_components/SyllabusTagList";
import SyllabusTopBar from "./_components/SyllabusTopBar";
import SyllabusFilters from "./_components/SyllabusFilters";
import SyllabusChatBox from "./_components/SyllabusChatBox";
import SyllabusPagination from "./_components/SyllabusPagination";
import MobileSyllabusPage from "./_components/MobileSyllabusPage";

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
  // 時間割の空きコマ長押しメニューから「この時間に入る科目を探す」で渡ってくる
  const period = typeof sp.period === "string" ? parseInt(sp.period, 10) : undefined;
  const year = typeof sp.year === "string" ? parseInt(sp.year, 10) : currentNendo;
  const offset = typeof sp.offset === "string" ? parseInt(sp.offset, 10) : 0;

  const [data, masters] = await Promise.all([
    searchSyllabi({ q, faculty, campus, term, day, period, year, limit: LIMIT, offset }),
    getMasters(),
  ]);

  return (
    <div className="flex flex-col flex-1 min-w-0">
      {/* モバイル */}
      <div className="md:hidden flex-1">
        <Suspense>
          <MobileSyllabusPage
            results={data.results}
            count={data.count}
            offset={offset}
            masters={masters}
            currentNendo={currentNendo}
          />
        </Suspense>
      </div>

      {/* デスクトップ */}
      <div className="hidden md:flex md:flex-col md:flex-1 min-w-0">
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

          {/* Card grid (タグフィルタリングはクライアント側で処理) */}
          <SyllabusTagList results={data.results} />

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
    </div>
  );
}
