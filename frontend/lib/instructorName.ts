/**
 * 教員名で引くときの、登録表記の組み立て。design.md §6.2。
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
 * そこで**入力の空白を取り除き、先頭から1文字ずつ伸ばしながら api-clean に当たるかを
 * 確かめて、登録表記を組み立てる**。次の1文字をそのまま繋げて当たらなければ、
 * 区切り(全角 → 半角)を挟んで試す。
 *
 * | 入力 | 組み立て |
 * |---|---|
 * | `山田`(姓のみ) | 部分一致なので入力どおりで当たる。組み立てない |
 * | `山田　太郎`(全角) | 同上 |
 * | `山田 太郎` / `山田太郎` | `山田` → `山田太`(外れ)→ `山田　太` → `山田　太郎` |
 * | `オーガスティンジョナサン` | 姓が7文字でも同じ手順で `オーガスティン　ジョナサン` に至る |
 * | `ドラグナラルカマリア` | 区切りが2つあっても `ドラグナ　ラルカ　マリア` に至る |
 *
 * 以前は区切りを入れる位置を姓の長さ1〜4文字で決め打ちしていたため、姓が5文字以上の
 * 教員(オーガスティン・ヘルナンデス・ナットチー)と、区切りが2つある教員(ドラグナ
 * ラルカ マリア)を区切りなしで引けなかった。**確かめながら伸ばすので、姓の長さも
 * 区切りの数も仮定しない。** 組み立てた語は api-clean に実在する表記の一部であり、
 * 当て推量の語を束ねることもない。
 *
 * **入力どおりの語をまず引き、空振りしたときだけ組み立てる**(呼び出し側。
 * `syllabus-api.ts` の `searchCourses()`)。姓のみ・全角区切りのフルネームは
 * 入力どおりの1回で当たる。
 *
 * **backend の `app/agents/instructor_name.py` の `spell_instructor_name()` と同じ規則に
 * すること。** 検索画面はこちらが引き、シラバスチャットのエージェントは backend が
 * 引く。食い違うと「検索画面では出るのに、チャットでは “その教員の科目は見つからない”
 * と返る」というねじれが起きる(科目名の `normalizeTitle()` を双方に置いているのと
 * 同じ理由)。
 */

/** 1文字を繋げて外れたときに、その手前に挟んで試す区切り。登録表記は全角なので全角を先に */
const SEPARATORS = ["　", " "];

/**
 * 組み立て1回あたりの問い合わせの上限。
 *
 * 登録されている教員名は最長でも14文字(区切り込み。2026年度)で、当たる道を
 * まっすぐ伸ばせば1文字につき高々3回で済む。偶然当たる寄り道で後戻りが続いても
 * 問い合わせが際限なく増えないよう、ここで打ち切る。
 */
const MAX_PROBES = 64;

/**
 * 入力を、api-clean に当たる教員名の表記へ組み立てる。
 *
 * 入力の空白(全角・半角)を取り除き、先頭から1文字ずつ伸ばす。伸ばした語が
 * 当たるかは `exists` に問い合わせる(`instructor` の部分一致で1件以上あるか)。
 *
 * 最後の1文字まで当たった語を返す。組み立てられなかったとき(どこかで外れた・
 * 問い合わせの上限に達した・入力が空白だけ)は null。
 */
export async function spellInstructorName(
  keyword: string,
  exists: (query: string) => Promise<boolean>,
): Promise<string | null> {
  // サロゲートペア(𠮷 など)を1文字として扱うため、code point で分ける
  const chars = Array.from(keyword.replace(/\s+/g, ""));
  if (chars.length === 0) return null;

  let probes = 0;

  const grow = async (prefix: string, index: number): Promise<string | null> => {
    if (index === chars.length) return prefix;
    // 区切りを挟まない続きを先に試す。外れたら区切りを挟む
    const next = chars[index];
    for (const candidate of [prefix + next, ...SEPARATORS.map((s) => prefix + s + next)]) {
      if (probes >= MAX_PROBES) return null;
      probes += 1;
      if (await exists(candidate)) {
        const spelled = await grow(candidate, index + 1);
        if (spelled !== null) return spelled;
      }
    }
    return null;
  };

  return grow(chars[0], 1);
}
