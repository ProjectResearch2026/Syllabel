import type { SyllabusDetail } from "@/lib/syllabus-api";

/**
 * 履修対象の扱い。design.md §8.1。
 *
 * **対象は2か所から来る。** 基本情報に出している対象課程(`programs`。無ければ
 * `faculties`)と、備考の `【対象】` である。2026年度で `【対象】` を持つ 238 件を
 * 突き合わせると、**147 件は対象課程と同じ内容**で、二度書く意味がない。
 * 残りは対象課程に無い課程を挙げているもの(69 件)と、`留学生` のように
 * 課程では表せない条件(18 件)であり、これらは落とせない。
 */

/** 基本情報に出す対象。課程が分かればそれを、無ければ学部を使う */
export function targetsOf(syllabus: Pick<SyllabusDetail, "programs" | "faculties">): string[] {
  return syllabus.programs.length > 0 ? syllabus.programs : syllabus.faculties;
}

/** 中黒と空白の揺れを吸収する(備考は `機械工学ロボティクス課程` のように中黒を落とす) */
const normalize = (name: string) => name.replace(/[・\s]/g, "");

/**
 * 備考の `【対象】` から、基本情報に出ている分を差し引く。
 *
 * - `T:` で始まる節は**旧学科(理工学部)向けの表記**なので落とす。本システムの
 *   利用者は先端理工学部の学生であり、`Y:` の側しか当たらない
 * - `Y:` の節は、挙がっている課程が対象課程にすべて含まれていれば落とす。
 *   1つでも含まれないものがあれば残す。**名前は組み立て直さず**、名前空間を
 *   示す `Y:` だけを外す(組み立て直すと表記の揺れで別の課程に化けうる)
 * - それ以外の節(`留学生` など)はそのまま残す
 *
 * @returns 残す文字列。すべて重複していれば null
 */
export function extraTargets(value: string, shown: string[]): string | null {
  const kept: string[] = [];

  for (const segment of value.split("、")) {
    const part = segment.trim();
    if (!part) continue;
    if (part.startsWith("T:")) continue;

    const programs = part.match(/^Y:(.+)$/);
    if (programs) {
      let rest = normalize(programs[1]);
      for (const name of shown) rest = rest.split(normalize(name)).join("");
      if (rest === "" || rest === "ALL") continue;
      kept.push(programs[1]);
      continue;
    }
    kept.push(part);
  }

  return kept.length > 0 ? kept.join("、") : null;
}
