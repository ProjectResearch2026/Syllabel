/**
 * 検索ボックスの語で科目名を引くときの照合。design.md §6.1。
 *
 * **api-clean の `q` は科目名の `ILIKE` 部分一致で、正規化を持たない**(§6.2)。
 * 一方、科目名の表記は大学のデータのまま混在しており、学生が打つ語とは字面が合わない。
 * 2026年度の実データで、次の語はどれも0件だった(括弧内が登録表記)。
 *
 * | 入力 | 登録表記 |
 * |---|---|
 * | `プログラミング基礎演習1` / `…演習I` / `…演習１` | `プログラミング基礎演習Ⅰ`(ローマ数字の1文字) |
 * | `仏教の思想Ａ`(IME の全角) | `仏教の思想A` |
 * | `英語総合1(A)` | `英語総合1（A）`(全角括弧) |
 * | `線形代数 演習` / `線形代数演習` | `線形代数・演習` |
 * | `でーたべーす` | `データベース` |
 *
 * そこで**科目名の照合は api-clean に任せず、条件に当たる全件を引いてから手元で行う**
 * (`syllabus-api.ts` の `searchCourses()`)。検索画面はもともと全件を引いている
 * (§6.2)ため、追加の取得は要らない。
 *
 * **`courseTitle.ts` の `normalizeTitle()` とは別物である。** あちらは履修要項・成績表との
 * 突合用で backend と同じ規則に保つ必要があり、表記の揺れを広く畳むと別の科目を
 * 同じ科目とみなしてしまう。こちらは「探している科目が候補に出るか」だけの用途なので、
 * 揺れを広めに畳む。
 */

/** 区切りとして無視する文字。空白と中黒(NFKC で半角の `･` も `・` になる) */
const IGNORED = /[\s・]/g;

/**
 * ローマ数字(NFKC で `Ⅰ` → `I`、`Ⅱ` → `II` になったもの)を算用数字にする。
 *
 * **直前が英字以外の非 ASCII 文字(漢字・かななど)で、直後が英字でないときだけ**変える。
 * 「AI」「VR」「X線」のような英字の語を数字にしないためである(2026年度の科目名で、
 * この規則に当たるのは `Ⅰ`〜`Ⅳ` 由来のものだけだった)。
 */
const ROMAN = /(?<=[^\x00-\x7F])(IX|IV|V?I{1,3}|V|X)(?![A-Za-z])/g;
const ROMAN_VALUE: Record<string, string> = {
  I: "1", II: "2", III: "3", IV: "4", V: "5",
  VI: "6", VII: "7", VIII: "8", IX: "9", X: "10",
};

/** ひらがなをカタカナにする(`でーたべーす` → `データベース`) */
function toKatakana(text: string): string {
  return text.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

/** 照合用の形にする。全角・半角、ローマ数字、ひらがな・カタカナ、空白・中黒の違いを畳む。 */
export function titleSearchKey(text: string): string {
  const folded = text.normalize("NFKC").replace(ROMAN, (r) => ROMAN_VALUE[r] ?? r);
  return toKatakana(folded).toLowerCase().replace(IGNORED, "");
}

/**
 * 科目名が検索語に当たるか。
 *
 * **空白で区切った語はすべて含む(AND)ものを当たりとする。** 「線形 演習」で
 * 「線形代数・演習」に当たる。空白を含まない語はそのまま部分一致になる。
 */
export function matchesTitle(title: string, keyword: string): boolean {
  const terms = keyword.split(/\s+/).map(titleSearchKey).filter(Boolean);
  if (terms.length === 0) return true;
  const key = titleSearchKey(title);
  return terms.every((term) => key.includes(term));
}
