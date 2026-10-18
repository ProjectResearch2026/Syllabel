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

/** 1ページに並べる件数。表示だけの都合であり、取得は全件行う(§6.2) */
const LIMIT = 30;

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/**
 * URL の数値クエリを読む。api-clean の値域(`period` 1〜7、`grade` 1〜4)を外れる値は
 * 条件にしない。そのまま送ると backend が 422 を返し、一覧ごと落ちるため
 */
function intParam(value: string | string[] | undefined, min: number, max: number): number | undefined {
  if (typeof value !== "string") return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
}

/**
 * URL の `offset` を読む。0 以上の整数だけを受け、ページの先頭(`limit` の倍数)に切り下げる。
 * それ以外(`abc`・負の数)は先頭ページにする。`parseInt` のままだと NaN や負の数が
 * そのまま `slice()` に渡り、件数は出ているのに一覧が空でページ送りも消えていた。
 * 件数を超える値は絞り込み後の件数が決まるクライアントで丸める(`useTaggedResults()`)
 */
function offsetParam(value: string | string[] | undefined, limit: number): number {
  if (typeof value !== "string") return 0;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n - (n % limit) : 0;
}

export default async function SyllabusPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;

  // 検索ボックスは科目名と教員名を1つの入力で受ける(§6.1)
  const keyword = typeof sp.q === "string" ? sp.q : undefined;
  const program = typeof sp.program === "string" ? sp.program : undefined;
  const campus = typeof sp.campus === "string" ? sp.campus : undefined;
  const term = typeof sp.term === "string" ? sp.term : undefined;
  const day = typeof sp.day === "string" ? sp.day : undefined;
  // 時限は絞り込みパネルのほか、時間割の空きコマ長押しメニューから
  // 「この時間に入る科目を探す」でも渡ってくる
  const period = intParam(sp.period, 1, 7);
  // 対象年次。`grade_min <= grade <= grade_max` の科目に絞る(§6.2)
  const grade = intParam(sp.grade, 1, 4);
  const offset = offsetParam(sp.offset, LIMIT);
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
  const [data, masters, courseTargets] = await Promise.all([
    searchCourses({ keyword, faculty, program, campus, term, day, period, grade, year }),
    getMasters(),
    fetchCourseTargets(year, faculty).catch(() => null),
  ]);

  return (
    <>
      {/* 検索条件を覚えておき、ヘッダーから戻ったときに開き直す(§8) */}
      <Suspense>
        <SyllabusQueryMemory />
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
