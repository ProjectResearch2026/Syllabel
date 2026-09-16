import { apiBase } from "@/lib/api_base";
import { instructorQueries } from "@/lib/instructorName";

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

/** 検索結果。design.md §6.1 / §6.2。 */
export type CourseSearchResponse = {
  /**
   * **条件に当たる全件**。ページ送りは行わない(下記)。
   */
  results: SyllabusListItem[];
  /** 総ヒット数。`results.length` と同じで、必ず確定する */
  total: number;
  /** キーワード未指定のときは null */
  matchedBy: MatchedBy | null;
};

/**
 * 一括取得の1ページあたりの件数と、辿るページ数の上限。
 *
 * `500` は api-clean の `MAX_ROWS`(既定値)であり、1リクエストで返せる最大である。
 * 学部を固定した検索の母数は 2026年度で 1,219 件なので3リクエストで足りる。
 * 上限は年度あたりの件数(api-clean 全体で数千)を超えない範囲で切る。
 */
const PAGE_SIZE = 500;
const MAX_PAGES = 40;

/**
 * 条件に当たる**全件**を取得する。design.md §6.2。
 *
 * **ページ送りをせず全件引く。** 理由は3つある。
 *
 * 1. **タグでの絞り込みが全件に効かないと使えない。** タグは学生プロファイルとの
 *    突合で決まり(§6.1)、プロファイルはブラウザにしか無いため api-clean の検索
 *    条件にできない。取得済みのページしか振り分けられないと、`修得済み` のような
 *    該当の少ないタグでは**ほとんどのページが「該当なし」になる**(2026年度・
 *    2024年度入学の知能情報メディア課程では、修得済み 184 コードが 41 ページに
 *    散り、35 ページが空になっていた)
 * 2. **総件数がタダで確定する。** api-clean は総ヒット数を返さない(`count` は
 *    そのページの件数)。従来は `limit=1` の空振り判定で 500 件単位のブロックを
 *    特定してから最後のブロックを数えており、検索1回につき余分に3〜4リクエストを
 *    払っていた。全件引けば `results.length` がそのまま総件数である
 * 3. **安い。** 先端理工学部・2026年度の全 1,219 件で 3リクエスト / 転送 gzip 約
 *    22KB / 実測 0.23 秒。30 件ずつ刻む必要がない
 */
async function fetchAll(params: SearchParams): Promise<SyllabusListItem[]> {
  const results: SyllabusListItem[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const raw = await searchSyllabi({ ...params, limit: PAGE_SIZE, offset: page * PAGE_SIZE });
    results.push(...raw.results);
    if (raw.results.length < PAGE_SIZE) return results;
  }
  // 上限に達した。取れた分だけ返す(件数は「以上」ではなく取得済みの実数になる)
  return results;
}

/**
 * 表記の揺れを埋めるために引き直す教員名の、同時実行数。
 *
 * 経路にトークンゲートウェイが挟まるため同時リクエストは控えめにする
 * (`INSTRUCTOR_CONCURRENCY` と同じ理由)。引き直しは入力どおりの語が空振りした
 * ときだけなので、ここに来る回数自体が少ない。
 */
const INSTRUCTOR_QUERY_CONCURRENCY = 3;

/** `items` を高々 `limit` 本の並列で処理する。結果は `items` の順に並べる */
async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await run(items[index]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * 教員名で条件に当たる全件を取得する。design.md §6.2。
 *
 * **api-clean の `instructor` は登録された表記のままの部分一致であり、姓名の
 * 区切りの揺れを吸収しない。** 入力どおりの語で空振りしたときは、区切りを
 * 書き換えた語で引き直して束ねる(`lib/instructorName.ts`)。全角スペースを
 * 入れないとフルネームで引けなかったのはこの引き直しが無かったためである。
 *
 * 引き直しは**空振りしたときだけ**行う。姓のみ(`山田`)や全角区切りの
 * フルネーム(`山田　太郎`)は入力どおりの1回で当たるため、そちらは従来どおり
 * リクエスト1回で済む。
 */
async function fetchAllByInstructor(
  rest: Omit<SearchParams, "q" | "instructor" | "limit" | "offset">,
  word: string,
): Promise<SyllabusListItem[]> {
  const [asTyped, ...fallbacks] = instructorQueries(word);
  const hit = await fetchAll({ ...rest, instructor: asTyped });
  if (hit.length > 0 || fallbacks.length === 0) return hit;

  // 書き換えた語は同じ教員に当たり得る(登録表記が科目ごとに違う場合)ため畳む
  const rounds = await mapWithLimit(fallbacks, INSTRUCTOR_QUERY_CONCURRENCY, (query) =>
    fetchAll({ ...rest, instructor: query }),
  );
  const seen = new Set<string>();
  return rounds.flat().filter((item) => {
    if (seen.has(item.syllabus_code)) return false;
    seen.add(item.syllabus_code);
    return true;
  });
}

/**
 * 検索ボックスの1語(科目名または教員名)でシラバスを検索する。design.md §6.1。
 *
 * api-clean の `q` と `instructor` は別々のパラメータであり、`q` は教員名に
 * 当たらない。検索ボックスは科目名と教員名を1つの入力で受けるため、`q` が
 * 0件のときに `instructor` で引き直す。**両方を同時に送ってはならない**
 * (AND 条件となり必ず0件になる)。
 */
export async function searchCourses(
  params: Omit<SearchParams, "q" | "instructor" | "limit" | "offset"> & { keyword?: string },
): Promise<CourseSearchResponse> {
  const { keyword, ...rest } = params;
  const word = keyword?.trim();

  if (!word) {
    const results = await fetchAll(rest);
    return { results, total: results.length, matchedBy: null };
  }

  const byTitle = await fetchAll({ ...rest, q: word });
  if (byTitle.length > 0) {
    return { results: byTitle, total: byTitle.length, matchedBy: "title" };
  }

  const byInstructor = await fetchAllByInstructor(rest, word);
  if (byInstructor.length > 0) {
    return { results: byInstructor, total: byInstructor.length, matchedBy: "instructor" };
  }

  // どちらも 0 件。科目名で引いた結果(空)をそのまま返す
  return { results: byTitle, total: 0, matchedBy: "title" };
}

/** `GET /api/course-targets` のレスポンス。design.md §6.1.3。 */
export type CourseTargetsResponse = {
  offeringYear: number;
  faculty: string;
  /** `syllabus_code` → 対象課程。空配列は「課程指定なし」 */
  targets: Record<string, string[]>;
};

/**
 * 開講年度と学部で、シラバスコード → 対象課程の対応を**まとめて**引く。
 * design.md §6.1.3。
 *
 * タグの絞り込みを全件に効かせるには、検索結果の全件について履修可否を判定できる
 * 必要がある。一覧API は対象課程を返さず(§6.2)、1件ずつ詳細を引くと 1,200
 * リクエストになるため、backend がまとめて組み立てた表を1回で受け取る。
 *
 * **学生データを含まないため ETag が効く**(§6.1.3)。`no-store` は付けない。
 */
export async function fetchCourseTargets(
  year: number,
  faculty: string,
): Promise<CourseTargetsResponse> {
  const qs = new URLSearchParams({ year: String(year), faculty });
  const res = await fetch(`${apiBase()}/course-targets?${qs.toString()}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
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
 * 検索結果に担当教員名を補う。`syllabus_code` → 教員名の対応を返す。design.md §6.2。
 *
 * **api-clean の `GET /syllabi` は担当教員を返さない。** 1科目に複数の教員が
 * 対応するため一覧の `SELECT DISTINCT` から外されており、教員名は
 * `GET /syllabi/{code}` にしかない。api-clean は無変更で使う前提(§1.1.1、§3.4.4)で
 * 一覧に足す口も無いため、**表示している行の分だけ詳細を引いて補う**。
 *
 * **ブラウザから呼ぶ。** 以前はサーバ側描画から呼んでいたが、タグでの絞り込みを
 * 全件に効かせたことで**どの行が表示されるかはクライアントで決まる**ようになった
 * (§8)。絞り込みはプロファイルとの突合で決まり、その結果(例えば修得済みの
 * コード一覧)は学生の成績そのものなのでサーバへ送れない(要件§5)。したがって
 * 表示する行を知っているのはブラウザだけである。
 *
 * 教員名は補助情報なので、揃う前でもカードは描ける(揃った時点で差し込まれる)。
 * 対象課程は**この口では引かない** — 絞り込みには全件ぶん要るため
 * `fetchCourseTargets()` でまとめて受け取る(§6.1.3)。
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
