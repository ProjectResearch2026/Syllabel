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
import SyllabusChatPanel from "./_components/SyllabusChatPanel";
import SyllabusProfileNotice from "./_components/SyllabusProfileNotice";
import MobileSyllabusPage from "./_components/MobileSyllabusPage";
import SyllabusQueryMemory from "./_components/SyllabusQueryMemory";
import { canonicalListParams, LIST_PAGE_SIZE } from "@/lib/syllabusQuery";

const LIMIT = LIST_PAGE_SIZE;

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function SyllabusPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  // マスタは課程・キャンパス・開講期の値を確かめるのに先に要る(1時間持つので速い)
  const masters = await getMasters();

  // **URL の値は決まった形に直したものだけを使う**(`canonicalListParams()`)。崩れた
  // URL も直した形と同じ一覧になり、アドレスバーは `SyllabusQueryMemory` が書き換える
  const raw = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) raw.append(key, v);
  }
  const params = canonicalListParams(raw, {
    program: masters.course_program.map((m) => m.name),
    campus: masters.campus.map((m) => m.name),
    term: masters.term.map((m) => m.name),
  });
  const text = (key: string) => params.get(key) ?? undefined;
  const int = (key: string) => (params.has(key) ? Number(params.get(key)) : undefined);

  // 検索ボックスは科目名と教員名を1つの入力で受ける(§6.1)
  const keyword = text("q");
  const program = text("program");
  const campus = text("campus");
  // 開講期。「前期」「後期」はクォーターの科目も含める(`searchCourses()`)。時間割から
  // 開くときは時間割の学期が付いてくる(`slotSearchHref()`)
  const term = text("term");
  const day = text("day");
  // 時限は絞り込みパネルのほか、時間割の空きコマのメニューから
  // 「この時間に入る科目を探す」でも渡ってくる
  const period = int("period");
  // 対象年次。`grade_min <= grade <= grade_max` の科目に絞る(§6.2)
  const grade = int("grade");
  // ページの先頭に切り下げてある。件数を超えた分は絞り込み後の件数が決まる
  // クライアントで丸める(`useTaggedResults()`)
  const offset = int("offset") ?? 0;
  // 開講年度と学部は固定する。URL に `year` / `faculty` が付いていても見ない
  const year = OFFERING_YEAR;
  const faculty = FACULTY;

  // **検索は条件に当たる全件を引く**(§6.2)。タグでの絞り込みはクライアントで
  // 行う必要があり(§6.1.3)、取得済みのページしか振り分けられないと使えない。
  // 対象課程も全件ぶんまとめて受け取る
  //
  // **対象課程が引けなくても一覧は出す。** タグは検索の付加価値であって前提では
  // ないため、`fetchCourseTargets()` の失敗で画面ごと落としてはならない(§6.1.3)。
  // backend だけが古い(このエンドポイントを持たない)ときに 404 で一覧が
  // 真っ白になる事故が実際に起きた。引けなければタグを出さずに続ける
  const [data, courseTargets] = await Promise.all([
    searchCourses({ keyword, faculty, program, campus, term, day, period, grade, year }),
    fetchCourseTargets(year, faculty).catch(() => null),
  ]);

  return (
    <>
      {/* アドレスバーを決まった形に直し、検索条件を覚えておく(ヘッダーから戻ったときに開き直す。§8) */}
      <Suspense>
        <SyllabusQueryMemory query={params.toString()} />
      </Suspense>

      {/* モバイル */}
      <div className="flex-1 md:hidden">
        <Suspense>
          <MobileSyllabusPage
            results={data.results}
            targets={courseTargets?.targets ?? null}
            faculty={faculty}
            offset={offset}
            limit={LIMIT}
            masters={masters}
            matchedBy={data.matchedBy}
          />
        </Suspense>
      </div>

      {/*
        デスクトップ（ui-design_pc.pen 05_シラバス一覧）。
        検索バーはヘッダーカードの続き、その下を 絞り込み / 結果 / AI の3列が分ける。
        縦に伸びるのは結果の列だけで、両脇のカードは画面の高さに収まる。
      */}
      <div className="hidden min-h-0 min-w-0 flex-1 flex-col gap-2 md:flex md:pc-viewport">
        <Suspense>
          <SyllabusTopBar />
        </Suspense>

        <div className="flex min-h-0 min-w-0 flex-1 gap-4">
          <Suspense>
            <SyllabusFilters masters={masters} />
          </Suspense>

          <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
            {/* タグが付く条件は、絞り込みを試す前に見えるところへ出す(§8) */}
            <SyllabusProfileNotice />
            <Suspense>
              <SyllabusResults
                results={data.results}
                targets={courseTargets?.targets ?? null}
                faculty={faculty}
                matchedBy={data.matchedBy}
                keyword={keyword}
                offset={offset}
                limit={LIMIT}
              />
            </Suspense>
          </main>

          <SyllabusChatPanel />
        </div>
      </div>
    </>
  );
}
