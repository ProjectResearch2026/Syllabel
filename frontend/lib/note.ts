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
 * - **履修要項の記号**: `Y4000` と `◎`(840件)のような科目区分コードと必修記号。
 *   学生には意味が読み取れないが、**こちらで解釈すると誤りうる**ので原文のまま出す
 */

export type ParsedNote = {
  /** `【抽選登録科目】` のように値を持たない見出し。登録方法がここに出る */
  flags: string[];
  /** `【対象】…` のようなラベルと値の組 */
  entries: { label: string; value: string }[];
  /** 角括弧を持たない行。履修要項の区分コードや記号が入る */
  lines: string[];
};

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
