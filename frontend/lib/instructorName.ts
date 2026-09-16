/**
 * 教員名で引くときの検索語の展開。design.md §6.2。
 *
 * **api-clean の `instructor` は漢字名の部分一致(`instructor.kanji_name ILIKE`)
 * で、正規化を持たない。** 姓と名の区切りは登録された表記のまま照合されるため、
 * 全角スペースで「山田　太郎」と登録されている教員は、半角スペースの
 * 「山田 太郎」でも区切りなしの「山田太郎」でも1件も引けなかった。科目名の突合
 * (`courseTitle.ts` の `normalizeTitle()`)のように**こちら側で正規化して
 * 突き合わせることはできない** — 照合するのは api-clean であり、教員名を持つのは
 * `GET /syllabi/{code}`(詳細)だけで、一覧は教員名を返さない(§6.2)。
 * 全件の詳細を引いて手元で突き合わせれば 1,200 リクエストになる。
 *
 * そこで**入力の側を api-clean の表記に寄せて引き直す**。区切りの揺れは
 * 「全角 / 半角 / 無し」の3通りしかないので、
 *
 * | 入力 | 引く語 |
 * |---|---|
 * | `山田　太郎`(全角) | 入力どおりで当たる |
 * | `山田 太郎`(半角) | `山田　太郎` / `山田太郎` を足す |
 * | `山田太郎`(区切りなし) | 区切りを入れる位置が分からないので、姓の長さを1〜4で試す |
 * | `山田`(姓のみ) | 部分一致なので入力どおりで当たる |
 *
 * **入力どおりの語を必ず先頭に置く**。姓のみ・全角区切りのフルネームはこれで
 * 当たるため、呼び出し側はまず先頭だけを引き、空振りしたときにだけ残りを
 * 引けばよい(`syllabus-api.ts` の `searchCourses()`)。
 */

/** 姓と名の間に入り得る区切り(全角スペース / 半角スペース / 無し) */
const SEPARATORS = ["　", " ", ""];

/**
 * 区切りなしで入力されたときに試す姓の長さの上限。
 *
 * 日本語の姓はほぼ1〜3文字で、4文字(勅使河原など)が実質の上限である。
 * 上限を切らないと長い入力で試行が際限なく増える。
 */
const MAX_SURNAME_LENGTH = 4;

/** 空白(全角・半角)での分割 */
const SPACES = /[\s　]+/;

/**
 * 教員名の検索語を、表記の揺れを埋める順に並べて返す。
 *
 * 先頭は入力そのもの(前後の空白だけ落とす)。以降は当たり得る書き換えで、
 * 重複は畳む。空文字を渡したときは空配列を返す。
 */
export function instructorQueries(keyword: string): string[] {
  const word = keyword.trim();
  if (!word) return [];

  const queries: string[] = [];
  const add = (query: string) => {
    if (query && !queries.includes(query)) queries.push(query);
  };

  add(word);

  const tokens = word.split(SPACES).filter(Boolean);
  if (tokens.length > 1) {
    // 区切りは入力が示している。詰め替えるだけでよい
    for (const separator of SEPARATORS) add(tokens.join(separator));
    return queries;
  }

  // 区切りなし。姓と名の境目が分からないので、区切りを入れる位置を順に試す
  const limit = Math.min(MAX_SURNAME_LENGTH, word.length - 1);
  for (let surname = 1; surname <= limit; surname += 1) {
    for (const separator of SEPARATORS) {
      add(word.slice(0, surname) + separator + word.slice(surname));
    }
  }
  return queries;
}
