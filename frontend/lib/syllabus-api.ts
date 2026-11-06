import { apiBase } from "@/lib/api_base";
import { spellInstructorName } from "@/lib/instructorName";
import { matchesTitle } from "@/lib/titleSearch";

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
  /** 1コマ目の曜日・時限。全コマは `slots` にある */
  day_of_week: string;
  period: number;
  /**
   * 開講コマのすべて(原文の順。api-clean 0.3.0 以降。design.md §6.2)。
   * 「後期 金4・金5」の金5 は `day_of_week` / `period` には無い。集中講義は空
   */
  slots?: { term: string | null; day: string; period: number }[];
  room: string | null;
  grade_min: number;
  grade_max: number;
  credits: number;
  /**
   * 担当者(api-clean 0.5.0 以降。design.md §6.2)。形と順は `GET /syllabi/{code}` の
   * `instructors` と同じで、表示名は `formatInstructors()` で作る。それより古い
   * api-clean は返さない
   */
  instructors?: Instructor[];
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
 * 本サービスの対象は**先端理工学部の学生**である(全6課程)。api-clean は農学部・政策学部
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
/**
 * 教養教育科目の分野。`backend/app/schemas/curriculum.py` の `Subcategory` と同じ9値。
 * design.md §5.1.5。
 */
export type Subcategory =
  | "「仏教の思想」科目"
  | "必修外国語科目"
  | "選択外国語科目"
  | "人文科学系科目"
  | "社会科学系科目"
  | "自然科学系科目"
  | "スポーツ科学系科目"
  | "教養教育科目特別講義"
  | "学部・センター等提供科目";

/** マージ後の科目1件。design.md §6.1(`backend/app/api/curricula.py` の `CourseOut`)。 */
export type CurriculaCourse = {
  title: string;
  category: Category;
  /** 分野。教養教育科目だけが持ち、専攻科目では null */
  subcategory: Subcategory | null;
  type: CourseType;
  credits: number;
  grade: number;
  term: CurriculaTerm;
  quarters: Quarter[] | null;
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
 * 教員名で条件に当たる全件を取得する。design.md §6.2。
 *
 * **api-clean の `instructor` は登録された表記のままの部分一致であり、姓名の
 * 区切りの揺れを吸収しない。** 入力どおりの語で空振りしたときは、登録表記を
 * 組み立て直して引き直す(`lib/instructorName.ts`)。組み立ての問い合わせは
 * 同じ条件で `limit=1` で引く。
 *
 * 引き直しは**空振りしたときだけ**行う。姓のみ(`山田`)や全角区切りの
 * フルネーム(`山田　太郎`)は入力どおりの1回で当たるため、そちらは従来どおり
 * リクエスト1回で済む。
 *
 * **問い合わせのどれかが失敗したら例外をそのまま投げる。** 失敗を「外れ」と
 * 扱うと、当たるはずだった語が落ちたときに「見つからない」という誤った答えになる。
 */
async function fetchAllByInstructor(
  rest: Omit<SearchParams, "q" | "instructor" | "limit" | "offset">,
  word: string,
): Promise<SyllabusListItem[]> {
  const hit = await fetchAll({ ...rest, instructor: word });
  if (hit.length > 0) return hit;

  const spelled = await spellInstructorName(word, async (query) => {
    const raw = await searchSyllabi({ ...rest, instructor: query, limit: 1 });
    return raw.results.length > 0;
  });
  if (spelled === null || spelled === word) return hit;
  return fetchAll({ ...rest, instructor: spelled });
}

/**
 * 開講期の「前期」「後期」が含むクォーター。design.md §6.2。
 *
 * api-clean の `term` は開講期マスタの8種(前期・1Q・2Q・通年・サ集・後期・3Q・4Q)の
 * **1つとの一致**で、`term=前期` では 1Q・2Q の科目が出ない。学生が「前期」で探すのは
 * 前期の時間割に入る科目なので、前期・後期だけは api-clean に渡さず、全件を引いてから
 * クォーターの科目も含めて手元で絞る。通年・サ集はどちらにも含めない(それぞれを選べば出る)
 */
const HALF_TERMS: Record<string, readonly string[]> = {
  前期: ["前期", "1Q", "2Q"],
  後期: ["後期", "3Q", "4Q"],
};

/** 開講期の表記を寄せる。api-clean は `１Ｑ` のような全角や空白入りの表記を返し得る */
function termKey(term: string | null | undefined): string {
  return (term ?? "").normalize("NFKC").replace(/\s/g, "");
}

/** 絞り込みの「開講期」の選択肢の表示名。前期・後期には含めるクォーターを添える */
export function termChoiceLabel(name: string): string {
  const half = HALF_TERMS[termKey(name)];
  return half ? `${name}（${half.slice(1).join("・")}を含む）` : name;
}

/**
 * 行が前期・後期(`HALF_TERMS`)に当たるか。api-clean の `term` と同じく**全コマで見る**
 * (「３Ｑ 金３、４Ｑ 金３」は 1コマ目の `term` だけでなく 4Q でも当たる)。曜日・時限と
 * 一緒のときは、そのコマの学期で比べる。コマの無い科目(集中講義)は科目の `term` で比べる
 */
function inHalfTerm(
  row: SyllabusListItem,
  half: readonly string[],
  day: string | undefined,
  period: number | undefined,
): boolean {
  const hit = (term: string | null | undefined) => half.includes(termKey(term));
  // `slots` を返さない古い api-clean では 1コマ目の学期で比べる
  if (!row.slots) return hit(row.term);
  if (day || period != null) {
    return row.slots.some(
      (slot) => (!day || slot.day === day) && (period == null || slot.period === period) && hit(slot.term),
    );
  }
  return hit(row.term) || row.slots.some((slot) => hit(slot.term));
}

/**
 * 検索ボックスの1語(科目名または教員名)でシラバスを検索する。design.md §6.1。
 *
 * **科目名は api-clean の `q` に投げず、条件に当たる全件を引いてから手元で照合する**
 * (`lib/titleSearch.ts`)。`q` は正規化の無い `ILIKE` で、「プログラミング基礎演習1」
 * (登録は `Ⅰ`)や「仏教の思想Ａ」(登録は半角 `A`)が0件になっていた。全件は
 * キーワードが無いときと同じ取得で、検索画面はもともと全件を引いている(§6.2)。
 *
 * 科目名で0件のときは同じ語を教員名として api-clean の `instructor` で引き直す。
 * 教員名は一覧に無いため手元では照合できない(`lib/instructorName.ts`)。
 */
export async function searchCourses(
  params: Omit<SearchParams, "q" | "instructor" | "limit" | "offset"> & { keyword?: string },
): Promise<CourseSearchResponse> {
  const { keyword, term, ...base } = params;
  const word = keyword?.trim();
  // 前期・後期はクォーターの科目も含めて手元で絞る(`HALF_TERMS`)
  const half = HALF_TERMS[termKey(term)];
  const rest = half ? base : { ...base, term };
  const inTerm = (rows: SyllabusListItem[]) =>
    half ? rows.filter((row) => inHalfTerm(row, half, base.day, base.period)) : rows;

  if (!word) {
    const results = inTerm(await fetchAll(rest));
    return { results, total: results.length, matchedBy: null };
  }

  const byTitle = inTerm(await fetchAll(rest)).filter((row) => matchesTitle(row.course_title, word));
  if (byTitle.length > 0) {
    return { results: byTitle, total: byTitle.length, matchedBy: "title" };
  }

  const byInstructor = inTerm(await fetchAllByInstructor(rest, word));
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
