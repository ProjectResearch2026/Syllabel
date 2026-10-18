import { create } from "zustand";
import type { Category, CourseType, CurriculaData, Subcategory } from "@/lib/syllabus-api";
import { canRegister, type CourseTarget } from "@/lib/eligibility";
import { normalizeTitle } from "@/lib/courseTitle";
import { PERIODS } from "@/lib/timetable";

/** 区分の絞り込みで「絞らない」を表す値。 */
export const ALL_CATEGORIES = "すべて";
/** 履修区分・状態の絞り込みで「絞らない」を表す値。 */
export const ALL_TAGS = "すべて";
/** 分野の絞り込みで「絞らない」を表す値。 */
export const ALL_SUBCATEGORIES = "すべて";

/**
 * 絞り込みの選択肢。**PC・モバイルで同じものを使うため、ここに1つだけ置く。**
 *
 * 履修区分と状態はチップに、区分と分野はセレクトに出す(§8.2.2)。分野のセレクトは
 * 区分が `教養教育` のときだけ出す。
 */
export const TAG_CHIPS = [ALL_TAGS, "必修", "選択必修", "選択", "随意", "修得済み"] as const;
export const CATEGORY_CHOICES = [
  ALL_CATEGORIES,
  "教養教育",
  "専門基礎",
  "専門応用",
  "専門関連",
] as const;

/**
 * 分野(教養教育科目の `subcategory`)の表示名。design.md §8.2.1。
 *
 * 履修要項の区分名から括弧と末尾の「科目」を除いた形にする。並びは
 * `backend/app/schemas/curriculum.py` の `Subcategory` の定義順に合わせる。
 */
const SUBCATEGORY_LABEL = {
  "「仏教の思想」科目": "仏教の思想",
  必修外国語科目: "必修外国語",
  選択外国語科目: "選択外国語",
  人文科学系科目: "人文科学系",
  社会科学系科目: "社会科学系",
  自然科学系科目: "自然科学系",
  スポーツ科学系科目: "スポーツ科学系",
  教養教育科目特別講義: "教養教育科目特別講義",
  "学部・センター等提供科目": "学部・センター等提供",
} as const satisfies Record<Subcategory, string>;

export type SubcategoryTag = (typeof SUBCATEGORY_LABEL)[Subcategory];

/**
 * 分野の絞り込みの選択肢。区分が `教養教育` のときだけ出す(§8.2.2)。
 * コホートによっては該当する科目の無い値もある(`学部・センター等提供` は
 * 2026年度入学版のみ)。
 */
export const SUBCATEGORY_CHOICES = [
  ALL_SUBCATEGORIES,
  ...Object.values(SUBCATEGORY_LABEL),
] as const;

/**
 * 対象年次の絞り込みの選択肢(URL のクエリ `grade`)。api-clean の `grade` の値域
 * (1〜4)と同じで、`grade_min <= grade <= grade_max` の科目に絞る(§6.2)。
 */
export const GRADE_CHOICES = [1, 2, 3, 4] as const;

/**
 * 時限の絞り込みの選択肢(URL のクエリ `period`。`day` と対で使う)。
 *
 * **時間割の空きコマから「この時間に入る科目を探す」で渡ってくる `period` を、
 * 検索画面でも見えて・外せる形にするための選択肢である。** 以前は曜日だけが
 * セレクトにあり、時限は URL に付いているのに画面のどこにも出ていなかったため、
 * 空きコマから来た学生には絞り込みが効いていること自体が分からず、続きの検索で
 * 時限を選び直すことも外すこともできなかった。
 *
 * 並べるのは時間割表と同じ `PERIODS`(1〜5)。api-clean は 1〜7 を受けるが
 * (§6.2)、時間割に置けるのはこの5コマであり、空きコマ起点の導線もこの範囲に
 * しかならない。**範囲外の値が URL に付いていたときはそれを足す** — 選択肢に
 * 無い値を `<select>` に渡すと選択が空に見え、効いている絞り込みを外せなくなる。
 */
export function periodChoices(current: string): number[] {
  const known = [...PERIODS] as number[];
  const value = Number(current);
  return current && Number.isInteger(value) && !known.includes(value)
    ? [...known, value].sort((a, b) => a - b)
    : known;
}

type SyllabusUIStore = {
  /** 履修区分または状態での絞り込み(`必修` / `選択必修` / `選択` / `随意` / `修得済み`) */
  activeTag: string;
  setActiveTag: (tag: string) => void;
  /** 区分での絞り込み(`教養教育` / `専門基礎` / `専門応用` / `専門関連`) */
  activeCategory: string;
  /** 区分を変える。**分野は `すべて` に戻す**(分野は教養教育科目の内訳であるため) */
  setActiveCategory: (category: string) => void;
  /** 分野での絞り込み(`人文科学系` など)。区分が `教養教育` のときだけ選べる */
  activeSubcategory: string;
  setActiveSubcategory: (subcategory: string) => void;
  /**
   * 最後に開いていた一覧のクエリ(`q=…&term=…`)。`LIST_QUERY_KEYS` で濾したもの。
   * ヘッダー・タブバーの「シラバス」をここへ向け、他の画面から戻っても
   * 検索条件を開き直す(`lib/syllabusQuery.ts` の `listHref()`)
   */
  listQuery: string;
  setListQuery: (query: string) => void;
  /** 絞り込みと検索条件を初期状態に戻す。リセット(全消去)で呼ぶ */
  reset: () => void;
};

/**
 * 検索画面の絞り込み状態。design.md §8.2。
 *
 * **URL のクエリに持たない。** 区分・分野・履修区分は履修要項と学生プロファイルの突合から
 * 決まる値であり(§6.1)、api-clean に投げる検索条件ではないため、サーバ側描画の
 * 入力にはならない。PC・モバイルで同じ状態を共有し、画面遷移をまたいで保つ。
 *
 * 検索条件そのもの(キーワード・開講期など)は URL のクエリが正本であり、
 * `listQuery` はその**写し**にすぎない。一覧を開いているあいだ
 * `SyllabusQueryMemory` が書き写し、ヘッダーから一覧へ戻るリンクがそれを読む。
 * 他の状態と同じくメモリにだけ持ち、再読み込みで消える。
 */
export const useSyllabusUIStore = create<SyllabusUIStore>((set) => ({
  activeTag: ALL_TAGS,
  setActiveTag: (tag) => set({ activeTag: tag }),
  activeCategory: ALL_CATEGORIES,
  setActiveCategory: (category) =>
    set({ activeCategory: category, activeSubcategory: ALL_SUBCATEGORIES }),
  activeSubcategory: ALL_SUBCATEGORIES,
  setActiveSubcategory: (subcategory) => set({ activeSubcategory: subcategory }),
  listQuery: "",
  setListQuery: (query) => set({ listQuery: query }),
  reset: () =>
    set({
      activeTag: ALL_TAGS,
      activeCategory: ALL_CATEGORIES,
      activeSubcategory: ALL_SUBCATEGORIES,
      listQuery: "",
    }),
}));

/**
 * 検索結果のカードに付すタグ。design.md §8.2.1。
 *
 * **軸を分ける。** 卒業要件の枠は (区分 × 履修区分) で決まり
 * (`basic.required` = 専門基礎科目 × 必修、`applied.elective` = 専門応用科目 × 選択、…)、
 * 教養教育科目の枠はさらに分野で分かれる(`liberal.general.humanities` = 人文科学系科目
 * × 基幹、…)。1つの軸に潰すとその対応が消えるため、履修要項の構造をそのまま出す。
 *
 * | 軸 | 値 |
 * |---|---|
 * | 状態 | `修得済み` |
 * | 区分 | `教養教育` / `専門基礎` / `専門応用` / `専門関連` |
 * | 分野 | 教養教育科目のみ。`SUBCATEGORY_LABEL` の表示名 |
 * | 履修区分 | `必修` / `選択必修` / `選択` / `随意` |
 */
export type CourseCategoryTag = "教養教育" | "専門基礎" | "専門応用" | "専門関連";
export type RequirementTag = "必修" | "選択必修" | "選択" | "随意";

/** 履修区分または状態。絞り込みのチップが取る値でもある。 */
export type TagType = RequirementTag | "修得済み" | null;

/** 1つのシラバスコードに付すタグ一式。すべて null / false ならタグなし。 */
export type CourseTags = {
  /** 単位を修得済みか */
  completed: boolean;
  /** 区分 */
  category: CourseCategoryTag | null;
  /** 分野。教養教育科目だけが持つ */
  subcategory: SubcategoryTag | null;
  /**
   * 履修区分。**修得済みのときと専門関連科目のときは null になる**
   * (`resolveTags()` の規則を参照)
   */
  requirement: RequirementTag | null;
};

/** タグが1つも無い状態。 */
export const NO_TAGS: CourseTags = {
  completed: false,
  category: null,
  subcategory: null,
  requirement: null,
};

/** 履修要項の区分名(`専門基礎科目`)をタグの表記(`専門基礎`)にする。 */
const CATEGORY_LABEL: Record<Category, CourseCategoryTag> = {
  教養教育科目: "教養教育",
  専門基礎科目: "専門基礎",
  専門応用科目: "専門応用",
  専門関連科目: "専門関連",
};

/** タグの候補。`resolveTags()` が履修可否を掛けて最終の `CourseTags` にする。 */
type TagCandidate = {
  completed: boolean;
  category: Category;
  subcategory: Subcategory | null;
  type: CourseType;
  own: boolean;
};

/**
 * 検索結果に付すタグの**候補**を、履修要項（`GET /api/curricula`）と学生プロファイルを
 * 突き合わせて作る。design.md §8.2.1。
 *
 * 突合はシラバスコードによる結合を第一とする。1科目に複数のクラスが対応し得る
 * ため `syllabusCodes` は配列であり、そのすべてを同じ候補に対応づける。コードを
 * 持たない科目（当年度不開講・名寄せ未解決）はタグ付けの対象外となる（§5.1.4）。
 *
 * **ここで出るのは候補であって最終のタグではない。** 履修要項は「科目」の単位で
 * 書かれており、**その学生がその開講クラスを履修できるか**を持たない。可否の判定は
 * シラバス側の対象課程で行い、`resolveTags()` が最後に掛ける（`lib/eligibility.ts`）。
 *
 * **同じコードが複数の科目レコードから来たときは先に現れたものを採る。** backend は
 * マージ後の `courses` を「当該課程の設置科目 → 教養教育科目 → 他課程から導出した
 * 専門関連科目（課程コード順）」の順で返すため（§6.1）、先頭優先は
 * 「自課程の設置科目を優先し、次いで課程コードの小さい出典を採る」になり、
 * backend 側の科目索引（`requirements.py` の `_course_index()`）と同じ順序になる。
 * ただし**修得済みか否かはレコードをまたいで OR で採る**。修得は学生の成績の事実で
 * あり、どのレコードから見ているかに左右されない。
 */
export function buildTagMap(
  curricula: CurriculaData,
  passedCodes: Set<string>,
  /** **正規化済み**の科目名の集合(`normalizeTitle()` を通したもの) */
  passedTitles: Set<string>,
): Map<string, TagCandidate> {
  const map = new Map<string, TagCandidate>();

  for (const course of curricula.courses) {
    // 科目名は正規化して突き合わせる。成績表由来の表記は全角英数字や空白が
    // 混じり、完全一致では外れる(`lib/courseTitle.ts`)
    const passedByTitle = passedTitles.has(normalizeTitle(course.title));
    for (const code of course.syllabusCodes) {
      const completed = passedByTitle || passedCodes.has(code);
      const current = map.get(code);
      if (current) {
        // 区分・分野・履修区分は先頭優先、修得済みだけは OR
        if (completed) current.completed = true;
        continue;
      }
      map.set(code, {
        completed,
        category: course.category,
        subcategory: course.subcategory,
        type: course.type,
        own: course.own,
      });
    }
  }
  return map;
}

/**
 * 候補に履修可否を掛けて、実際に出すタグを決める。design.md §6.1.3 / §8.2.1。
 *
 * **履修できないクラスにはタグを出さない。** 判定の根拠と規則は
 * `lib/eligibility.ts` に書いてある。
 *
 * | 状況 | 出すタグ |
 * |---|---|
 * | 修得済み | `修得済み` + 区分(+ 分野) |
 * | 履修可 × 未修得 × 自課程の設置科目 | 区分(+ 分野)+ 履修区分 |
 * | 履修可 × 未修得 × 他課程の設置科目 | `専門関連` のみ |
 * | 履修不可 / 可否を判定できない | なし |
 * | 履修要項に無い | なし |
 *
 * 分野は教養教育科目だけが持つ。
 * 履修区分を出さない場合が2つある。
 *
 * - **修得済みのとき。** 履修区分は「これから履修する必要があるか」を示す情報で
 *   あり、単位を修得した科目では意味を持たない。バッジも2つに収まる
 * - **他課程の設置科目（`own` が false）のとき。** その `type` は**導出元の課程に
 *   とっての**区分であって、閲覧している学生にとっての区分ではない。
 *   例えば「アルゴリズム及び演習Ⅰ」(Y001019010) は数理・情報科学課程の専攻科目だが
 *   全6課程に開かれており、知能情報メディア課程の学生も履修できる。この学生に
 *   とっての区分は**専門関連科目**であり、`related` → `free.faculty` の要件枠に
 *   計上される（§4.4.3）。導出元での `選択必修` をそのまま出してはならない
 *
 * **修得済みは履修可否を問わず出す。** 単位を修得した事実であり、そのクラスを
 * これから履修できるかとは無関係である。
 *
 * **対象課程が分からないときはタグを出さない。** 一覧は `GET /api/course-targets`、
 * 講義詳細はシラバス詳細から対象課程を得る（§6.1.3）。取得できなかったコードでは
 * 可否が判定できず、**履修可否の正本は対象課程である**という原則に従い、判定できない
 * ものについては何も主張しない。
 *
 * @param target 当該コードの対象課程・対象学部。取得できなければ `undefined`
 * @param programName 学生プロファイルの課程名（`StudentProfile.program`）
 */
export function resolveTags(
  candidate: TagCandidate | undefined,
  target: CourseTarget | undefined,
  programName: string | null | undefined,
): CourseTags {
  if (!candidate) return NO_TAGS;

  const category = CATEGORY_LABEL[candidate.category] ?? null;
  const subcategory = candidate.subcategory ? SUBCATEGORY_LABEL[candidate.subcategory] : null;

  if (candidate.completed) return { completed: true, category, subcategory, requirement: null };
  if (!target || !canRegister(target, programName)) return NO_TAGS;
  // 他課程の設置科目。この学生にとっての区分は専門関連科目であり、履修区分は持たない
  if (!candidate.own) {
    return { completed: false, category: "専門関連", subcategory: null, requirement: null };
  }

  return { completed: false, category, subcategory, requirement: candidate.type };
}

/** タグが1つでも付いているか。 */
export function hasTags(tags: CourseTags): boolean {
  return (
    tags.completed ||
    tags.category !== null ||
    tags.subcategory !== null ||
    tags.requirement !== null
  );
}

/**
 * 絞り込みに一致するか。design.md §8.2.2。
 *
 * 軸どうしは AND で効く。`修得済み` は履修区分ではなく状態の軸だが、
 * 学生の探し方に沿うため同じチップの並びに置く。
 */
export function matchesFilter(
  tags: CourseTags,
  activeTag: string,
  activeCategory: string,
  activeSubcategory: string,
): boolean {
  if (activeCategory !== ALL_CATEGORIES && tags.category !== activeCategory) return false;
  if (activeSubcategory !== ALL_SUBCATEGORIES && tags.subcategory !== activeSubcategory) {
    return false;
  }
  if (activeTag === ALL_TAGS) return true;
  if (activeTag === "修得済み") return tags.completed;
  return tags.requirement === activeTag;
}

/**
 * タグでの絞り込みが効いているか。design.md §8.2.2。
 *
 * 絞り込みが効いているあいだは、件数の表示を絞り込み後のものに切り替え、
 * 絞る前の母数を併記する(`useTaggedResults()`。§6.1.4)。
 */
export function isFiltering(
  activeTag: string,
  activeCategory: string,
  activeSubcategory: string,
): boolean {
  return (
    activeTag !== ALL_TAGS ||
    activeCategory !== ALL_CATEGORIES ||
    activeSubcategory !== ALL_SUBCATEGORIES
  );
}
