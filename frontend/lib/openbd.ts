/**
 * openBD(https://openbd.jp/)から書影の URL を引く。design.md §6.4。
 *
 * api-clean の書誌(`textbooks`)は ISBN を持っているが書影を持たない(§6.2)。
 * 書影は openBD の `GET /v1/get?isbn=...` が返す `summary.cover` にあり、
 * 本プロジェクトが管理しない**唯一のブラウザ向け外部参照**である。
 *
 * 3つの前提を置く。
 *
 * - **書影は無いことのほうが多い。** openBD の書影は版元ドットコムに登録された
 *   ものに限られ、大学の指定図書(学術書・専門書)は多くが空文字で返る。
 *   **「引けなかった」と「無い」を区別せず**、どちらも書影なしとして扱う
 *   (呼び出し側は今までどおり背表紙アイコンを出す)
 * - **この口の失敗で講義詳細を落とさない。** 例外・非200・タイムアウトは
 *   すべて空の対応表に畳む。openBD は本サービスの可用性の外にある
 * - **1科目ぶんを1リクエストにまとめる。** `isbn` はカンマ区切りで複数取れ、
 *   応答は**要求した順の配列**で返る(該当が無い要素は `null`)。書誌は1科目で
 *   最大16件あり、1件ずつ引くと講義詳細の描画が16往復ぶん遅くなる
 */

const OPENBD_ENDPOINT = "https://api.openbd.jp/v1/get";

/** 書影の再検証間隔(秒)。刊行済みの本の書影はまず変わらないので1週間置く */
const COVER_REVALIDATE_SECONDS = 604800;

/**
 * openBD を待つ上限(ミリ秒)。
 *
 * **講義詳細はサーバ側描画であり、この待ちがそのままページの表示を止める。**
 * 書影は補助情報なので、待つくらいなら書影なしで描く。
 * Next は fetch のキャッシュキーから `signal` を外すため、中断つきでも
 * `next.revalidate` は効く。
 */
const COVER_TIMEOUT_MS = 3000;

type OpenBdResponse = ({ summary?: { cover?: string } } | null)[];

/**
 * ISBN を openBD に投げられる形に直す。引けない値は `null`。
 *
 * **全角で入っている値がある。** 大学のデータは表記が混在しており
 * (`lib/courseTitle.ts` と同じ事情)、ハイフン・空白の有無も揃っていない。
 * NFKC で寄せてから記号を落とし、ISBN-13(13桁)か ISBN-10(9桁＋数字かX)
 * だけを通す。openBD は ISBN-10 もハイフン付きも受け付けるが、
 * **重複を畳む鍵として正規化した値が要る**(同じ本がテキストと参考文献の
 * 両方に載ることがある)。
 */
function normalizeIsbn(raw: string): string | null {
  const normalized = raw.normalize("NFKC").replace(/[^0-9Xx]/g, "").toUpperCase();
  if (/^\d{13}$/.test(normalized)) return normalized;
  if (/^\d{9}[\dX]$/.test(normalized)) return normalized;
  return null;
}

/**
 * ISBN の一覧から「**元の文字列** → 書影URL」の対応表を作る。
 *
 * 鍵を正規化後ではなく元の文字列にするのは、呼び出し側(`BookList`)が持っている
 * のが api-clean の生の `isbn` だからである。呼び出し側に正規化を持ち出すと、
 * 正規化の規則がこのモジュールと2か所に分かれる。
 */
export async function fetchBookCovers(
  isbns: readonly (string | null)[],
): Promise<Record<string, string>> {
  // 正規化した ISBN ごとに、元の表記をまとめる(重複を1回の問い合わせに畳む)
  const rawsByIsbn = new Map<string, string[]>();
  for (const raw of isbns) {
    if (!raw) continue;
    const isbn = normalizeIsbn(raw);
    if (!isbn) continue;
    const raws = rawsByIsbn.get(isbn);
    if (raws) raws.push(raw);
    else rawsByIsbn.set(isbn, [raw]);
  }
  if (rawsByIsbn.size === 0) return {};

  const keys = [...rawsByIsbn.keys()];
  const covers: Record<string, string> = {};

  try {
    const res = await fetch(`${OPENBD_ENDPOINT}?isbn=${keys.join(",")}`, {
      next: { revalidate: COVER_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(COVER_TIMEOUT_MS),
    });
    if (!res.ok) return {};

    const books = (await res.json()) as OpenBdResponse;
    books.forEach((book, i) => {
      const cover = book?.summary?.cover?.trim();
      // 書影が無い本は空文字で返る。`https` 以外は混在コンテンツになるので捨てる
      if (!cover || !cover.startsWith("https://")) return;
      for (const raw of rawsByIsbn.get(keys[i]) ?? []) covers[raw] = cover;
    });
  } catch {
    // openBD が落ちていても講義詳細は出す。書影なしで描くだけ
    return {};
  }

  return covers;
}
