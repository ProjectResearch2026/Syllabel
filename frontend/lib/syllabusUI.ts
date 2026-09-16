import { create } from "zustand";
import type { Category, CourseType, CurriculaData } from "@/lib/syllabus-api";
import { canRegister, type CourseTarget } from "@/lib/eligibility";
import { normalizeTitle } from "@/lib/courseTitle";

/** 区分の絞り込みで「絞らない」を表す値。 */
export const ALL_CATEGORIES = "すべて";
/** 履修区分・状態の絞り込みで「絞らない」を表す値。 */
export const ALL_TAGS = "すべて";

/**
 * 絞り込みの選択肢。**PC・モバイルで同じものを使うため、ここに1つだけ置く。**
 *
 * 履修区分と状態はチップに、区分はセレクトに出す(§8)。チップに7値を並べると
 * 1行に収まらないため、軸で分けている。
 */
export const TAG_CHIPS = [ALL_TAGS, "必修", "選択必修", "選択", "随意", "修得済み"] as const;
export const CATEGORY_CHOICES = [
  ALL_CATEGORIES,
  "教養教育",
  "専門基礎",
  "専門応用",
  "専門関連",
] as const;

type SyllabusUIStore = {
  /** 履修区分または状態での絞り込み(`必修` / `選択必修` / `選択` / `随意` / `修得済み`) */
  activeTag: string;
  setActiveTag: (tag: string) => void;
  /** 区分での絞り込み(`教養教育` / `専門基礎` / `専門応用` / `専門関連`) */
  activeCategory: string;
  setActiveCategory: (category: string) => void;
};

/**
 * 検索画面の絞り込み状態。design.md §8。
 *
 * **URL のクエリに持たない。** 区分・履修区分は履修要項と学生プロファイルの突合から
 * 決まる値であり(§6.1)、api-clean に投げる検索条件ではないため、サーバ側描画の
 * 入力にはならない。PC・モバイルで同じ状態を共有し、画面遷移をまたいで保つ。
 */
export const useSyllabusUIStore = create<SyllabusUIStore>((set) => ({
  activeTag: ALL_TAGS,
  setActiveTag: (tag) => set({ activeTag: tag }),
  activeCategory: ALL_CATEGORIES,
  setActiveCategory: (category) => set({ activeCategory: category }),
}));

/**
 * 検索結果のカードに付すタグ。design.md §8。
 *
 * **3つの軸に分ける。** 卒業要件の枠は (区分 × 履修区分) で決まっており
 * (`basic.required` = 専門基礎科目 × 必修、`applied.elective` = 専門応用科目 × 選択、…)、
 * 1つの軸に潰すとその対応が消える。学生が「この科目がどの枠を埋めるのか」を
 * 読み取れるようにするため、履修要項の構造をそのまま出す。
 *
 * | 軸 | 値 |
 * |---|---|
 * | 状態 | `修得済み` |
 * | 区分 | `教養教育` / `専門基礎` / `専門応用` / `専門関連` |
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
  /**
   * 履修区分。**修得済みのときと専門関連科目のときは null になる**
   * (`resolveTags()` の規則を参照)
   */
  requirement: RequirementTag | null;
};

/** タグが1つも無い状態。 */
export const NO_TAGS: CourseTags = { completed: false, category: null, requirement: null };

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
  type: CourseType;
  own: boolean;
};

/**
 * 検索結果に付すタグの**候補**を、履修要項（`GET /api/curricula`）と学生プロファイルを
 * 突き合わせて作る。design.md §6.1 / §8。
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
 * 専門関連科目（課程コード順）」の順で返すため（§4.4.3）、先頭優先は
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
        // 区分・履修区分は先頭優先、修得済みだけは OR
        if (completed) current.completed = true;
        continue;
      }
      map.set(code, {
        completed,
        category: course.category,
        type: course.type,
        own: course.own,
      });
    }
  }
  return map;
}

/**
 * 候補に履修可否を掛けて、実際に出すタグを決める。design.md §6.1.3 / §8。
 *
 * **履修できないクラスにはタグを出さない。** 判定の根拠と規則は
 * `lib/eligibility.ts` に書いてある。
 *
 * | 状況 | 出すタグ |
 * |---|---|
 * | 履修不可 | なし |
 * | 履修可 × 修得済み | `修得済み` + 区分 |
 * | 履修可 × 未修得 × 自課程の設置科目 | 区分 + 履修区分 |
 * | 履修可 × 未修得 × 他課程の設置科目 | `専門関連` のみ |
 * | 履修要項に無い | なし |
 *
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
 * **対象課程が分からないときはタグを出さない。** 一覧は表示中のぶんだけシラバス詳細を
 * 引いて対象課程を得ており（§6.2）、その取得が失敗したコードでは可否が判定できない。
 * **履修可否の正本は対象課程である**という原則に従い、判定できないものについては
 * 何も主張しない。
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

  if (candidate.completed) return { completed: true, category, requirement: null };
  if (!target || !canRegister(target, programName)) return NO_TAGS;
  // 他課程の設置科目。この学生にとっての区分は専門関連科目であり、履修区分は持たない
  if (!candidate.own) return { completed: false, category: "専門関連", requirement: null };

  return { completed: false, category, requirement: candidate.type };
}

/** タグが1つでも付いているか。 */
export function hasTags(tags: CourseTags): boolean {
  return tags.completed || tags.category !== null || tags.requirement !== null;
}

/**
 * 絞り込みに一致するか。design.md §8。
 *
 * 2つの軸は AND で効く。`修得済み` は履修区分ではなく状態の軸だが、
 * 学生の探し方（「もう取った科目を除きたい」）に沿うため同じチップの並びに置く。
 */
export function matchesFilter(
  tags: CourseTags,
  activeTag: string,
  activeCategory: string,
): boolean {
  if (activeCategory !== ALL_CATEGORIES && tags.category !== activeCategory) return false;
  if (activeTag === ALL_TAGS) return true;
  if (activeTag === "修得済み") return tags.completed;
  return tags.requirement === activeTag;
}

/**
 * タグでの絞り込みが効いているか。design.md §8。
 *
 * 絞り込みが効いているあいだは、件数の表示を絞り込み後のものに切り替える
 * (`useTaggedResults()`)。かつては「いま表示している30件のうちn件」という
 * 但し書きも出していたが、**絞り込みが検索結果の全件に効くようになったため
 * 不要になった**(§6.2 で全件を引くようにした)。
 */
export function isFiltering(activeTag: string, activeCategory: string): boolean {
  return activeTag !== ALL_TAGS || activeCategory !== ALL_CATEGORIES;
}
