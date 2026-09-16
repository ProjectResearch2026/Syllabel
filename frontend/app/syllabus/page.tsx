import { Suspense } from "react";
import {
  searchCourses,
  getMasters,
  fetchCourseTargets,
  OFFERING_YEAR,
  FACULTY,
} from "@/lib/syllabus-api";
import SyllabusResults from "./_components/SyllabusResults";
import SyllabusTopBar from "./_components/SyllabusTopBar";
import SyllabusFilters from "./_components/SyllabusFilters";
import SyllabusChatBox from "./_components/SyllabusChatBox";
import MobileSyllabusPage from "./_components/MobileSyllabusPage";

/** 1ページに並べる件数。表示だけの都合であり、取得は全件行う(§6.2) */
const LIMIT = 30;

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function SyllabusPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;

  // 検索ボックスは科目名と教員名を1つの入力で受ける(§6.1)
  const keyword = typeof sp.q === "string" ? sp.q : undefined;
  const program = typeof sp.program === "string" ? sp.program : undefined;
  const campus = typeof sp.campus === "string" ? sp.campus : undefined;
  const term = typeof sp.term === "string" ? sp.term : undefined;
  const day = typeof sp.day === "string" ? sp.day : undefined;
  // 時間割の空きコマ長押しメニューから「この時間に入る科目を探す」で渡ってくる
  const period = typeof sp.period === "string" ? parseInt(sp.period, 10) : undefined;
  const offset = typeof sp.offset === "string" ? parseInt(sp.offset, 10) : 0;
  // 開講年度と学部は固定する。URL に `year` / `faculty` が付いていても見ない
  const year = OFFERING_YEAR;
  const faculty = FACULTY;

  // **検索は条件に当たる全件を引く**(§6.2)。タグでの絞り込みはクライアントで
  // 行う必要があり(§6.1.3)、取得済みのページしか振り分けられないと使えない。
  // 対象課程も全件ぶんまとめて受け取る
  const [data, masters, courseTargets] = await Promise.all([
    searchCourses({ keyword, faculty, program, campus, term, day, period, year }),
    getMasters(),
    fetchCourseTargets(year, faculty),
  ]);

  return (
    <div className="flex flex-col flex-1 min-w-0">
      {/* モバイル */}
      <div className="md:hidden flex-1">
        <Suspense>
          <MobileSyllabusPage
            results={data.results}
            targets={courseTargets.targets}
            faculty={faculty}
            offset={offset}
            limit={LIMIT}
            masters={masters}
            matchedBy={data.matchedBy}
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
            <SyllabusFilters masters={masters} />
          </Suspense>

          <main className="flex-1 min-w-0 bg-[#F8F9FA] px-4 md:px-6 py-5">
            <Suspense>
              <SyllabusResults
                results={data.results}
                targets={courseTargets.targets}
                faculty={faculty}
                matchedBy={data.matchedBy}
                keyword={keyword}
                offset={offset}
                limit={LIMIT}
              />
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
