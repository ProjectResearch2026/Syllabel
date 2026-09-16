import { apiBase } from "@/lib/api_base";

/**
 * backend の読み取り専用エンドポイントのクライアント。design.md §6.1。
 *
 * `/syllabi`・`/syllabi/{code}`・`/masters` は backend が api-clean を素通しするため
 * (§6.2)、フィールド名は api-clean の snake_case のままである。`/curricula` は
 * backend 自身のレスポンスであり camelCase(§6.1)。両者で書式が違うのは意図である。
 *
 * このモジュールはサーバ側描画とブラウザの双方から import されるため、宛先は
 * モジュール読み込み時に固定せず `apiBase()` で呼び出しごとに解決する(§6.1)。
 */

export type SyllabusListItem = {
  syllabus_code: string;
  year: number;
  course_title: string;
  subtitle: string | null;
  campus: string;
  term: string;
  day_of_week: string;
  period: number;
  room: string | null;
  grade_min: number;
  grade_max: number;
  credits: number;
  detail_url: string;
};

export type SyllabusListResponse = {
  count: number;
  limit: number;
  offset: number;
  results: SyllabusListItem[];
};

export type Instructor = {
  kanji_name: string;
  kana_name: string;
  role: string;
  order_index: number;
};

/** 教科書・参考文献1件。design.md §6.2(api-clean の `syllabus_textbook` × `book`)。 */
export type Textbook = {
  id: number;
  title: string;
  author: string | null;
  author_raw: string | null;
  publisher: string | null;
  publisher_raw: string | null;
  isbn: string | null;
  price: number | null;
  /** `main` = テキスト、`reference` = 参考文献 */
  role: string;
  order_index: number;
};

export type CoursePlan = {
  session_number: number;
  content: string;
  instructor_name: string;
  method: string | null;
};

export type SyllabusDetail = Omit<SyllabusListItem, "campus" | "term" | "detail_url"> & {
  id: number;
  subject_id: number;
  campus_id: number;
  term_id: number;
  term_schedule_raw: string;
  grade_raw: string;
  note: string | null;
  goals: string | null;
  summary: string | null;
  methods: string | null;
  outside_study: string | null;
  grading: string | null;
  textbook_note: string | null;
  reference_note: string | null;
  advice: string | null;
  source: string | null;
  extraction_time: string | null;
  campus_name: string;
  term_name: string;
  faculties: string[];
  programs: string[];
  instructors: Instructor[];
  course_plan: CoursePlan[];
  textbooks: Textbook[];
  attributes: unknown[];
};

export type MasterItem = { id: number; name: string };

export type Masters = {
  faculty: MasterItem[];
  course_program: MasterItem[];
  campus: MasterItem[];
  term: MasterItem[];
};

/**
 * 検索対象とする開講年度。design.md §5.1.4 / §6.1。
 *
 * api-clean は2025年度の開講科目も保持しているが、履修要項側の名寄せ結果
 * (`offerings/<開講年度>/`)は2026年度分しか無く、教養教育科目が揃っていない。
 * 他年度を検索できるようにすると、タグ付け(§6.1)の対象外となる結果だけが
 * 並ぶことになるため、検索画面が扱う開講年度はこの1年度に固定する。
 */
export const OFFERING_YEAR = 2026;

/**
 * 検索対象とする学部。requirements.md §2.1。
 *
 * 本サービスの対象は**先端理工学部の学生**である(第1フェーズは知能情報メディア
 * 課程、第3フェーズでも先端理工学部の他課程まで)。api-clean は農学部・政策学部
 * などの科目も保持しているが、**履修要項を持たない学部の科目を並べても
 * タグ付け(§6.1)の対象外であり、履修の判断にも使えない**ため、検索画面が扱う
 * 学部はこの1つに固定する。
 */
export const FACULTY = "先端理工学部";

export type SearchParams = {
  q?: string;
  faculty?: string;
  program?: string;
  campus?: string;
  term?: string;
  day?: string;
  period?: number;
  year?: number;
  instructor?: string;
  grade?: number;
  limit?: number;
  offset?: number;
};

export type CourseType = "必修" | "選択必修" | "選択" | "随意";
export type CurriculaTerm = "前期" | "後期" | "通年" | "サ集";
export type Quarter = "1Q" | "2Q" | "3Q" | "4Q";
export type Category =
  | "教養教育科目"
  | "専門基礎科目"
  | "専門応用科目"
  | "専門関連科目";

/** マージ後の科目1件。design.md §6.1(`backend/app/api/curricula.py` の `CourseOut`)。 */
export type CurriculaCourse = {
  title: string;
  category: Category;
  subcategory: string | null;
  type: CourseType;
  credits: number;
  grade: number;
  term: CurriculaTerm;
  quarters: Quarter[] | null;
  kikan: boolean;
  /**
   * 当該課程の設置科目なら true、他課程から導出した専門関連科目なら false。
   * 他課程の `type: 必修` はその課程の学生にとっての必修であり、区別せずに
   * 表示すると誤ったタグになる(§6.1)。
   */
  own: boolean;
  /**
   * 開講年度ファイルの `resolved` から合成したシラバスコード。1科目に複数の
   * クラスが対応し得るため配列である。当年度不開講・名寄せ未解決の科目では
   * 空配列になり、タグ付けの対象外となる(§5.1.4)。
   */
  syllabusCodes: string[];
};

/**
 * 卒業要件のうちクライアントが必要とする2値。design.md §6.1。
 * **設置科目の単位数の総和は卒業必要単位数ではない**ため、`courses` からは算出できない。
 */
export type Graduation = {
  totalCredits: number;
  /** 卒業要件単位数に算入しない科目種別(例: 随意) */
  excludedTypes: CourseType[];
};

/** `GET /api/curricula/{program_code}/{admission_year}` のレスポンス。design.md §6.1。 */
export type CurriculaData = {
  programCode: string;
  admissionYear: number;
  /** `syllabusCodes` の出所となった開講年度 */
  offeringYear: number;
  graduation: Graduation;
  courses: CurriculaCourse[];
};

export async function searchSyllabi(params: SearchParams): Promise<SyllabusListResponse> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== "") qs.set(k, String(v));
  });
  const query = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetch(`${apiBase()}/syllabi${query}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

/** `searchCourses()` がキーワードをどちらの条件として引いたか。 */
export type MatchedBy = "title" | "instructor";

/** 検索結果1ページ分。design.md §6.1 / §6.2。 */
export type CourseSearchResponse = {
  results: SyllabusListItem[];
  limit: number;
  offset: number;
  /** 次のページがあるか */
  hasNext: boolean;
  /**
   * 総ヒット数。api-clean は総件数を返さないため `countCourses()` で数える(§6.2)。
   * 数えられなかったときだけ null になり、「n件以上」の表示に落とす。
   */
  total: number | null;
  /** キーワード未指定のときは null */
  matchedBy: MatchedBy | null;
};

/** `limit` 省略時の1ページの件数 */
const DEFAULT_LIMIT = 30;

/**
 * 1ページ分を引き、次ページの有無を判定する。
 *
 * api-clean の `count` はそのページで返した件数であり、総ヒット数ではない
 * (§6.2)。総件数を返す口も無い。そこで **`limit + 1` 件を要求し、`limit` を
 * 超えて返ってきたら次ページがある**と判定する。余分な1件は呼び出し元へ
 * 渡さない。
 */
async function searchPage(
  params: SearchParams,
): Promise<{ results: SyllabusListItem[]; hasNext: boolean }> {
  const limit = params.limit ?? DEFAULT_LIMIT;
  const raw = await searchSyllabi({ ...params, limit: limit + 1 });
  const hasNext = raw.results.length > limit;
  return { results: hasNext ? raw.results.slice(0, limit) : raw.results, hasNext };
}

/**
 * 検索ボックスの1語(科目名または教員名)でシラバスを検索する。design.md §6.1。
 *
 * api-clean の `q` と `instructor` は別々のパラメータであり、`q` は教員名に
 * 当たらない。検索ボックスは科目名と教員名を1つの入力で受けるため、`q` が
 * 0件のときに `instructor` で引き直す。**両方を同時に送ってはならない**
 * (AND 条件となり必ず0件になる)。
 */
/**
 * 検索条件に当たる件数を数える。design.md §6.2。
 *
 * **api-clean は総ヒット数を返さない。** `count` はそのページの件数であり、
 * 総件数を返す口も無く、`POST /sql` はゲートウェイが拒否する(§3.4.4)。
 * そのため従来は最終ページに達するまで件数が確定せず、**1,200件規模の検索では
 * 40回ページを送るまで何件あるか分からなかった**。
 *
 * そこで **`limit=1` の空振り判定で 500 件単位のブロックを特定し、最後の
 * ブロックだけを取得して数える**。1,219 件なら「offset 500 / 1000 に在る、
 * 1500 に無い」を確かめた後、offset 1000 から 500 件要求して 219 件を得る。
 * 小さな問い合わせ3回と通常の取得1回で確定する。
 *
 * 数えられなかったときは null を返し、呼び出し側は「n件以上」の表示に落とす。
 */
const COUNT_BLOCK = 500; // api-clean の MAX_ROWS(既定値)

async function hasRowAt(params: SearchParams, offset: number): Promise<boolean> {
  const page = await searchSyllabi({ ...params, limit: 1, offset });
  return page.results.length > 0;
}

export async function countCourses(params: SearchParams): Promise<number | null> {
  try {
    let block = 0;
    // 上限は api-clean が保持する年度あたりの件数(数千)を超えない範囲で切る
    while (block < 40 && (await hasRowAt(params, (block + 1) * COUNT_BLOCK))) {
      block += 1;
    }
    const offset = block * COUNT_BLOCK;
    const last = await searchSyllabi({ ...params, limit: COUNT_BLOCK, offset });
    return offset + last.results.length;
  } catch {
    // 件数が数えられなくても一覧は出す
    return null;
  }
}

export async function searchCourses(
  params: Omit<SearchParams, "q" | "instructor"> & { keyword?: string },
): Promise<CourseSearchResponse> {
  const { keyword, ...rest } = params;
  const limit = rest.limit ?? DEFAULT_LIMIT;
  const offset = rest.offset ?? 0;
  const word = keyword?.trim();

  const build = async (
    page: { results: SyllabusListItem[]; hasNext: boolean },
    matchedBy: MatchedBy | null,
    counted: SearchParams,
  ): Promise<CourseSearchResponse> => ({
    results: page.results,
    limit,
    offset,
    hasNext: page.hasNext,
    // 次ページが無ければここが最後なので数えるまでもない
    total: page.hasNext ? await countCourses(counted) : offset + page.results.length,
    matchedBy,
  });

  if (!word) return build(await searchPage(rest), null, rest);

  const byTitle = await searchPage({ ...rest, q: word });
  if (byTitle.results.length > 0) return build(byTitle, "title", { ...rest, q: word });

  const byInstructor = await searchPage({ ...rest, instructor: word });
  if (byInstructor.results.length > 0) {
    return build(byInstructor, "instructor", { ...rest, instructor: word });
  }

  // どちらも 0 件。科目名で引いた結果をそのまま返す
  return build(byTitle, "title", { ...rest, q: word });
}

export async function getSyllabus(code: string): Promise<SyllabusDetail> {
  const res = await fetch(`${apiBase()}/syllabi/${encodeURIComponent(code)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getMasters(): Promise<Masters> {
  const res = await fetch(`${apiBase()}/masters`, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchCurricula(
  programCode: string,
  admissionYear: number,
): Promise<CurriculaData> {
  const res = await fetch(
    // `no-store` は付けない。backend が ETag と
    // `Cache-Control: public, max-age=3600, must-revalidate` を付すため、
    // ブラウザのHTTPキャッシュに再検証させる(§6.1.2)
    `${apiBase()}/curricula/${encodeURIComponent(programCode)}/${admissionYear}`,
  );
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

/**
 * 担当教員名を「、」で連ねる。design.md §6.2。
 *
 * api-clean は `role`(main/sub)→`order_index` の順で返すため、並びはそのまま
 * 使う。同一人物が main と sub の両方に載っている行があるので重複は畳む。
 */
export function formatInstructors(instructors: Instructor[] | undefined | null): string | null {
  if (!instructors || instructors.length === 0) return null;
  const names = instructors
    .map((i) => i.kanji_name?.trim())
    .filter((name): name is string => !!name);
  const unique = Array.from(new Set(names));
  return unique.length > 0 ? unique.join("、") : null;
}

/**
 * 一覧を教員名で補うときの同時実行数。
 *
 * 経路にトークンゲートウェイが挟まり、同一トークンの同時リクエストが
 * `503` で弾かれ得る(§3.4.3 は vllm 側での実測)。控えめに並べ、弾かれた分は
 * 1度だけ引き直す。
 */
const INSTRUCTOR_CONCURRENCY = 4;

/** `503`/`429` を1度だけ待って引き直すときの待ち時間(ミリ秒) */
const RETRY_DELAY_MS = 200;

/** 補完に使う詳細のキャッシュ期間(秒)。シラバスは年度内で変わらない */
const DETAIL_REVALIDATE_SECONDS = 86400;

async function fetchInstructorsOf(code: string, retry = true): Promise<string | null> {
  try {
    const res = await fetch(`${apiBase()}/syllabi/${encodeURIComponent(code)}`, {
      // 補完のための取得。`getSyllabus()` と違い再検証つきでキャッシュする
      next: { revalidate: DETAIL_REVALIDATE_SECONDS },
    });
    if (!res.ok) {
      if (retry && (res.status === 503 || res.status === 429)) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        return fetchInstructorsOf(code, false);
      }
      return null;
    }
    const detail = (await res.json()) as Pick<SyllabusDetail, "instructors">;
    return formatInstructors(detail.instructors);
  } catch {
    // 1件の失敗で一覧を落とさない。その科目だけ教員名なしになる
    return null;
  }
}

/**
 * 検索結果に担当教員名を補う。`syllabus_code` → 教員名の対応を返す。
 *
 * **api-clean の `GET /syllabi` は担当教員を返さない。** 1科目に複数の教員が
 * 対応するため一覧の `SELECT DISTINCT` から外されており、教員名は
 * `GET /syllabi/{code}` にしかない。api-clean は無変更で使う前提(§1.1.1、
 * §3.4.4)で一覧に足す口も無いため、**表示中のページ分だけ詳細を引いて補う**。
 *
 * サーバ側描画から呼ぶこと。ブラウザから30本投げるためのものではない。
 */
export async function fetchInstructorMap(codes: string[]): Promise<Record<string, string>> {
  const targets = Array.from(new Set(codes));
  const map: Record<string, string> = {};
  let cursor = 0;

  const worker = async () => {
    while (cursor < targets.length) {
      const code = targets[cursor++];
      const names = await fetchInstructorsOf(code);
      if (names) map[code] = names;
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(INSTRUCTOR_CONCURRENCY, targets.length) }, worker),
  );
  return map;
}
