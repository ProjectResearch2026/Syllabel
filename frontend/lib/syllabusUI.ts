import { create } from "zustand";
import type { CurriculaData } from "@/lib/syllabus-api";

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
 * 検索結果に付すタグを、履修要項（`GET /api/curricula`）と学生プロファイルを
 * 突き合わせて作る。design.md §6.1 / §8。
 *
 * 突合はシラバスコードによる結合を第一とする。1科目に複数のクラスが対応し得る
 * ため `syllabusCodes` は配列であり、そのすべてを同じタグに対応づける。コードを
 * 持たない科目（当年度不開講・名寄せ未解決）はタグ付けの対象外となる（§5.1.4）。
 *
 * **`own` が false の科目にはタグを付けない。** これは他課程ファイルから導出した
 * 専門関連科目であり（§4.4.1）、**当該課程の学生が履修できる科目とは限らない**。
 * 実際「プログラミング及び実習Ⅱ」(Y001009010) は数理・情報科学課程の専攻科目で、
 * シラバス上の対象課程も同課程のみだが、知能情報メディア課程の履修要項には
 * 専門関連科目として `選択必修` で載る。この `type` は**導出元の課程にとっての**
 * 区分であり、閲覧している学生にとっての区分ではない。導出した科目は要件枠
 * （専門関連 / 学部フリー）の充足判定にのみ用いる（§4.4.3）。
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
