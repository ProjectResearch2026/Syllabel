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
 * `own` が false の科目は他課程から導出した専門関連科目で、その `type: 必修` は
 * 当該課程の学生にとっての必修ではない。区別せずに表示すると誤ったタグになる
 * ため、必修としては扱わない（§6.1）。
 */
export function buildTagMap(
  curricula: CurriculaData,
  passedCodes: Set<string>,
  passedTitles: Set<string>,
): Map<string, TagType> {
  const map = new Map<string, TagType>();
  for (const course of curricula.courses) {
    const passedByTitle = passedTitles.has(course.title);
    for (const code of course.syllabusCodes) {
      if (passedByTitle || passedCodes.has(code)) {
        map.set(code, "既修得済み");
      } else if (course.type === "必修") {
        // 他課程から導出した科目の必修は当該課程の学生の必修ではないため付けない
        if (course.own) map.set(code, "必修");
      } else if (course.type === "選択必修" || course.type === "選択") {
        map.set(code, "選択");
      }
    }
  }
  return map;
}
