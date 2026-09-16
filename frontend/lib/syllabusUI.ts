import { create } from "zustand";
import type { CurriculaData } from "@/lib/syllabus-api";
import { canRegister, type CourseTarget } from "@/lib/eligibility";

type SyllabusUIStore = {
  activeTag: string;
  setActiveTag: (tag: string) => void;
};

export const useSyllabusUIStore = create<SyllabusUIStore>((set) => ({
  activeTag: "すべて",
  setActiveTag: (tag) => set({ activeTag: tag }),
}));

/** 検索結果のカードに付すタグ。design.md §8。 */
export type TagType = "必修" | "選択" | "既修得済み" | null;

/**
 * 検索結果に付すタグの**候補**を、履修要項（`GET /api/curricula`）と学生プロファイルを
 * 突き合わせて作る。design.md §6.1 / §8。
 *
 * 突合はシラバスコードによる結合を第一とする。1科目に複数のクラスが対応し得る
 * ため `syllabusCodes` は配列であり、そのすべてを同じタグに対応づける。コードを
 * 持たない科目（当年度不開講・名寄せ未解決）はタグ付けの対象外となる（§5.1.4）。
 *
 * **ここで出るのは候補であって最終のタグではない。** 履修要項は「科目」の単位で
 * 書かれており、**その学生がその開講クラスを履修できるか**を持たない。可否の判定は
 * シラバス側の対象課程で行い、`resolveTag()` が最後に掛ける（`lib/eligibility.ts`）。
 *
 * **`own` が false の科目には候補を出さない。** 他課程ファイルから導出した専門関連
 * 科目であり（§4.4.1）、その `type` は**導出元の課程にとっての**区分であって、
 * 閲覧している学生にとっての区分ではない。実際「プログラミング及び実習Ⅱ」
 * (Y001009010) は数理・情報科学課程の専攻科目で、シラバス上の対象課程も同課程のみ
 * だが、知能情報メディア課程の履修要項には専門関連科目として `選択必修` で載る。
 *
 * ただし**既修得済みだけは `own` を問わず付ける**。修得済みかどうかは学生の
 * 成績の事実であり、科目がどの課程の設置かに左右されない。
 */
export function buildTagMap(
  curricula: CurriculaData,
  passedCodes: Set<string>,
  passedTitles: Set<string>,
): Map<string, TagType> {
  const map = new Map<string, TagType>();

  // 同じコードが複数の科目レコードから来ることがあるため、強いタグを優先する
  const rank = (tag: NonNullable<TagType>) =>
    tag === "既修得済み" ? 3 : tag === "必修" ? 2 : 1;
  const put = (code: string, tag: NonNullable<TagType>) => {
    const current = map.get(code);
    if (!current || rank(tag) > rank(current)) map.set(code, tag);
  };

  for (const course of curricula.courses) {
    const passedByTitle = passedTitles.has(course.title);
    for (const code of course.syllabusCodes) {
      if (passedByTitle || passedCodes.has(code)) {
        put(code, "既修得済み");
      } else if (!course.own) {
        // 他課程の設置科目。当該課程の学生にとっての区分ではない
        continue;
      } else if (course.type === "必修") {
        put(code, "必修");
      } else if (course.type === "選択必修" || course.type === "選択") {
        put(code, "選択");
      }
    }
  }
  return map;
}

/**
 * 候補のタグに履修可否を掛けて、実際に出すタグを決める。design.md §6.1。
 *
 * **履修できないクラスにはタグを出さない。** 2026年度開講・2024年度入学の
 * 知能情報メディア課程では、検索結果に現れる 430 コードのうち 126 コードが
 * 「履修要項では必修だが、その学生は履修登録できないクラス」であった
 * （クラス指定のある教養教育科目10科目。仏教の思想A/B・英語総合1(A)〜4・
 * スポーツ技術学A/B）。判定の根拠は `lib/eligibility.ts` に書いてある。
 *
 * 例外が2つある。
 *
 * - **既修得済みは可否を問わず出す。** 単位を修得した事実であり、そのクラスを
 *   これから履修できるかとは無関係である
 * - **対象課程が分からないときはタグを出さない。** 一覧は表示中のぶんだけ
 *   シラバス詳細を引いて対象課程を得ており（§6.2）、その取得が失敗したコードでは
 *   可否が判定できない。**履修可否の正本は対象課程である**という原則に従い、
 *   判定できないものについては何も主張しない（可否不明のまま「必修」と出すのは、
 *   まさに今回直した誤りと同じことになる）
 *
 * @param target 当該コードの対象課程・対象学部。取得できなければ `undefined`
 * @param programName 学生プロファイルの課程名（`StudentProfile.program`）
 */
export function resolveTag(
  candidate: TagType,
  target: CourseTarget | undefined,
  programName: string | null | undefined,
): TagType {
  if (candidate === null) return null;
  if (candidate === "既修得済み") return candidate;
  if (!target) return null;
  return canRegister(target, programName) ? candidate : null;
}
