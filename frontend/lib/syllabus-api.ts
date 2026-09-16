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
  textbooks: unknown[];
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

export type KeywordSearchResponse = SyllabusListResponse & {
  /** キーワード未指定のときは null */
  matchedBy: MatchedBy | null;
};

/**
 * 検索ボックスの1語(科目名または教員名)でシラバスを検索する。design.md §6.1。
 *
 * api-clean の `q` と `instructor` は別々のパラメータであり、`q` は教員名に
 * 当たらない。検索ボックスは科目名と教員名を1つの入力で受けるため、`q` が
 * 0件のときに `instructor` で引き直す。**両方を同時に送ってはならない**
 * (AND 条件となり必ず0件になる)。
 */
export async function searchCourses(
  params: Omit<SearchParams, "q" | "instructor"> & { keyword?: string },
): Promise<KeywordSearchResponse> {
  const { keyword, ...rest } = params;
  const word = keyword?.trim();
  if (!word) return { ...(await searchSyllabi(rest)), matchedBy: null };

  const byTitle = await searchSyllabi({ ...rest, q: word });
  // 上流の `count` が総ヒット数か返却件数かは確定していないため、判定は
  // 実際に返った件数で行う(`limit` を超えるページでは 0 件になり得る)
  if (byTitle.results.length > 0) return { ...byTitle, matchedBy: "title" };

  const byInstructor = await searchSyllabi({ ...rest, instructor: word });
  if (byInstructor.results.length > 0) return { ...byInstructor, matchedBy: "instructor" };

  // どちらも 0 件。科目名で引いた結果(件数・offset)をそのまま返す
  return { ...byTitle, matchedBy: "title" };
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
