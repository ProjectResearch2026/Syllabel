/**
 * 備考(`note`)の読み解き。design.md §8.1。
 *
 * **`note` は履修登録の可否・区分に関する注記である。** 2026年度の1,512件すべてに
 * 値が入っており、中身は3種類に分かれる。
 *
 * - **登録方法**: `【抽選登録科目】`(392件)・`【オープン登録科目】`(221件)。
 *   抽選かオープンかは履修できるかどうかそのものなので、これだけは目立たせる
 * - **ラベル付きの注記**: `【対象】T:情報メディア学科、Y:知能情報メディア課程` の形。
 *   `【種目】`・`【配当年次】`・`【注意】` なども同じ形で入っている
 * - **履修要項の記号**: `Y4000` と `◎`(840件)や `2-1 英語必修 2019年度～` のような
 *   科目区分コードと必修記号。**画面には出さない**(`pruneNote()`)
 */

export type ParsedNote = {
  /** `【抽選登録科目】` のように値を持たない見出し。登録方法がここに出る */
  flags: string[];
  /** `【対象】…` のようなラベルと値の組 */
  entries: { label: string; value: string }[];
  /** 角括弧を持たない行。履修要項の区分コードや記号が入る */
  lines: string[];
};

import { extraTargets } from "@/lib/courseTarget";

const LABELLED = /^【(.+?)】(.*)$/;

export function parseNote(note: string | null | undefined): ParsedNote | null {
  const source = note?.trim();
  if (!source) return null;

  const parsed: ParsedNote = { flags: [], entries: [], lines: [] };
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const labelled = line.match(LABELLED);
    if (labelled) {
      const [, label, value] = labelled;
      if (value.trim()) parsed.entries.push({ label, value: value.trim() });
      else parsed.flags.push(label);
    } else if (line.endsWith("登録科目")) {
      // 角括弧が落ちている行が33件ある
      parsed.flags.push(line);
    } else {
      parsed.lines.push(line);
    }
  }

  const empty =
    parsed.flags.length === 0 && parsed.entries.length === 0 && parsed.lines.length === 0;
  return empty ? null : parsed;
}

/** 見出しのうち、履修できるかどうかに直結するもの(登録方法)だけを返す */
export function registrationFlags(parsed: ParsedNote): string[] {
  return parsed.flags.filter((flag) => flag.includes("登録"));
}

/** 備考カードに出す分。履修要項の記号(`lines`)は持たない */
export type NoteBody = Omit<ParsedNote, "lines">;

/**
 * 備考カードに残す分だけにする。**画面の他の場所に出したものと、学生が読めないものは引く。**
 *
 * - 登録方法は見出しのタグに出しているので落とす
 * - `【対象】` は基本情報の対象課程と重なる分を落とす(`lib/courseTarget.ts`)
 * - **履修要項の記号(`lines`)は落とす。** どの学部・入学年度の履修要項の区分かが
 *   書かれておらず(`2-1 英語必修 2019年度～` は閲覧している学生の課程の区分とは
 *   限らない)、学生には意味が読み取れない。その学生にとっての区分は履修要項と
 *   突き合わせた見出しのタグ(「あなたの課程では」)が示している。以前は
 *   「履修要項の記載」として原文のまま出しており、備考カードの中身の大半がこれだった
 *
 * @returns 残りが無ければ null(カードごと出さない)
 */
export function pruneNote(parsed: ParsedNote, shownTargets: string[]): NoteBody | null {
  const flags = parsed.flags.filter((flag) => !flag.includes("登録"));
  const entries = parsed.entries.flatMap((entry) => {
    if (entry.label !== "対象") return [entry];
    const extra = extraTargets(entry.value, shownTargets);
    return extra ? [{ label: entry.label, value: extra }] : [];
  });
  return flags.length === 0 && entries.length === 0 ? null : { flags, entries };
}
