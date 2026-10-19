import type { Category, Subcategory } from "@/lib/syllabus-api";

/**
 * 区分・分野の表示名。シラバス一覧のタグ(§8.2.1)と時間割の科目(§8.3.4)で共用する。
 *
 * `syllabusUI.ts` と `timetable.ts` の双方が使うため、どちらにも依存しないここに置く
 * (`syllabusUI.ts` は `timetable.ts` を import しており、逆に引くと循環する)。
 */

export type CourseCategoryTag = "教養教育" | "専門基礎" | "専門応用" | "専門関連";

/** 履修要項の区分名(`専門基礎科目`)をタグの表記(`専門基礎`)にする。 */
export const CATEGORY_LABEL: Record<Category, CourseCategoryTag> = {
  教養教育科目: "教養教育",
  専門基礎科目: "専門基礎",
  専門応用科目: "専門応用",
  専門関連科目: "専門関連",
};

/**
 * 分野(教養教育科目の `subcategory`)の表示名。design.md §8.2.1。
 *
 * 履修要項の区分名から括弧と末尾の「科目」を除いた形にする。並びは
 * `backend/app/schemas/curriculum.py` の `Subcategory` の定義順に合わせる。
 */
export const SUBCATEGORY_LABEL = {
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

/** 表示名から履修要項の区分名に戻す。知らない値は null */
export function categoryOf(tag: string | null | undefined): Category | null {
  const hit = Object.entries(CATEGORY_LABEL).find(([, label]) => label === tag);
  return hit ? (hit[0] as Category) : null;
}

/** 表示名から履修要項の分野名に戻す。知らない値は null */
export function subcategoryOf(tag: string | null | undefined): Subcategory | null {
  const hit = Object.entries(SUBCATEGORY_LABEL).find(([, label]) => label === tag);
  return hit ? (hit[0] as Subcategory) : null;
}
