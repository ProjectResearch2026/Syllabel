/**
 * openBD(https://openbd.jp/)から書誌の補足情報を引く。design.md §6.4。
 *
 * api-clean の書誌(`textbooks`)は書名・著者・出版社・ISBN・価格しか持たない(§6.2)。
 * **その本がどんな本なのかを判断する材料が無い**ため、ISBN から openBD の
 * `GET /v1/get?isbn=...` を引き、書影・内容紹介・目次・ページ数を補う。
 * 本プロジェクトが管理しない**唯一のブラウザ向け外部参照**である。
 *
 * 3つの前提を置く。
 *
 * - **引けない本のほうが多い。** openBD の書誌は版元ドットコムに登録された
 *   ものが中心で、大学の指定図書(学術書・専門書)は書影も紹介文も欠けることが
 *   ある。**「引けなかった」と「無い」を区別せず**、どちらも補足なしとして扱う
 * - **この口の失敗で講義詳細を落とさない。** 例外・非200・タイムアウトは
 *   すべて空の対応表に畳む。openBD は本サービスの可用性の外にある
 * - **1科目ぶんを1リクエストにまとめる。** `isbn` はカンマ区切りで複数取れ、
 *   応答は**要求した順の配列**で返る(該当が無い要素は `null`)。書誌は1科目で
 *   最大16件あり、1件ずつ引くと講義詳細の描画が16往復ぶん遅くなる
 */

const OPENBD_ENDPOINT = "https://api.openbd.jp/v1/get";

/**
 * 書誌ページの URL の組み立て先(版元ドットコム)。
 *
 * **openBD にある本は版元ドットコムにページがある**(openBD の書誌はここが
 * 集めているため)。洋書を含め実地に確認しており、未登録の ISBN は 404 になる。
 * したがって**リンクを出すのは openBD が書誌を返した本だけ**に限る。
 * ISBN-13 でしか引けないので、こちらの持つ生値ではなく openBD が返す
 * `summary.isbn` を使う(ISBN-10 で問い合わせても13桁に直って返る)。
 */
const HANMOTO_BOOK_URL = "https://www.hanmoto.com/bd/isbn";

/** 再検証間隔(秒)。刊行済みの本の書誌はまず変わらないので1週間置く */
const REVALIDATE_SECONDS = 604800;

/**
 * openBD を待つ上限(ミリ秒)。
 *
 * **講義詳細はサーバ側描画であり、この待ちがそのままページの表示を止める。**
 * 補足情報なので、待つくらいなら補足なしで描く。Next は fetch のキャッシュキーから
 * `signal` を外すため、中断つきでも `next.revalidate` は効く。
 */
const TIMEOUT_MS = 3000;

/** 1冊ぶんの補足情報。値が取れなかった項目は `null` で、画面ではその行を出さない */
export type BookInfo = {
  /** 書影の URL。**無い本のほうが多い** */
  cover: string | null;
  /** 内容紹介。ONIX の TextType `03`(長い紹介)、無ければ `02`(短い紹介) */
  description: string | null;
  /** 目次。ONIX の TextType `04`。改行がそのまま入っている */
  toc: string | null;
  /** ページ数 */
  pages: number | null;
  /** 刊行年月。`201806` / `20180709` を「2018年6月」の形に直したもの */
  pubdate: string | null;
  /** シリーズ名(叢書・レーベル) */
  series: string | null;
  /** 版元ドットコムの書誌ページ */
  detailUrl: string;
};

type OpenBdBook = {
  summary?: {
    isbn?: string;
    series?: string;
    pubdate?: string;
    cover?: string;
  };
  onix?: {
    CollateralDetail?: {
      TextContent?: { TextType?: string; Text?: string }[];
    };
    DescriptiveDetail?: {
      Extent?: { ExtentValue?: string; ExtentUnit?: string }[];
    };
  };
};

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
 * 紹介文・目次を取り出す。
 *
 * **版元ドットコムの紹介文には HTML が混じることがある。** 画面には素のテキスト
 * として出す(`dangerouslySetInnerHTML` は使わない)ので、タグはここで落とす。
 */
function textOf(book: OpenBdBook, type: string): string | null {
  const contents = book.onix?.CollateralDetail?.TextContent ?? [];
  const hit = contents.find((c) => c.TextType === type)?.Text?.trim();
  if (!hit) return null;
  const stripped = hit.replace(/<\/?[a-zA-Z][^>]*>/g, "").trim();
  return stripped || null;
}

/** ページ数。ONIX の `Extent` のうち単位がページ(`ExtentUnit` = `03`)のもの */
function pagesOf(book: OpenBdBook): number | null {
  const extent = book.onix?.DescriptiveDetail?.Extent ?? [];
  const value = extent.find((e) => e.ExtentUnit === "03")?.ExtentValue;
  const pages = Number(value);
  return Number.isFinite(pages) && pages > 0 ? pages : null;
}

/** `201806` / `20180709` を「2018年6月」に直す。年だけの `2018` は「2018年」 */
function formatPubdate(raw: string | undefined): string | null {
  const digits = raw?.replace(/\D/g, "") ?? "";
  if (digits.length < 4) return null;
  const year = digits.slice(0, 4);
  const month = digits.slice(4, 6);
  return month ? `${year}年${Number(month)}月` : `${year}年`;
}

/**
 * シリーズ名。**装丁の種別が入っていることがある**ため落とす。
 *
 * 版元ドットコムの「シリーズ」欄を判型・装丁の記入に使っている版元があり
 * (有斐閣の単行本が `単行本` で返る)、そのまま出すと「シリーズ: 単行本」に
 * なって読む側に何も伝わらない。
 */
const NOT_A_SERIES = ["単行本", "単行本(ソフトカバー)", "ソフトカバー", "その他", "なし"];

function seriesOf(raw: string | undefined): string | null {
  const series = raw?.trim();
  if (!series || NOT_A_SERIES.includes(series.normalize("NFKC"))) return null;
  return series;
}

function toBookInfo(book: OpenBdBook): BookInfo | null {
  const isbn13 = book.summary?.isbn?.trim();
  // ISBN-13 が取れない書誌はリンク先を組み立てられないので補足なしとして扱う
  if (!isbn13) return null;

  const cover = book.summary?.cover?.trim();
  return {
    // 書影が無い本は空文字で返る。`https` 以外は混在コンテンツになるので捨てる
    cover: cover && cover.startsWith("https://") ? cover : null,
    description: textOf(book, "03") ?? textOf(book, "02"),
    toc: textOf(book, "04"),
    pages: pagesOf(book),
    pubdate: formatPubdate(book.summary?.pubdate),
    series: seriesOf(book.summary?.series),
    detailUrl: `${HANMOTO_BOOK_URL}/${isbn13}`,
  };
}

/**
 * ISBN の一覧から「**元の文字列** → 補足情報」の対応表を作る。
 *
 * 鍵を正規化後ではなく元の文字列にするのは、呼び出し側(`BookList`)が持っている
 * のが api-clean の生の `isbn` だからである。呼び出し側に正規化を持ち出すと、
 * 正規化の規則がこのモジュールと2か所に分かれる。
 */
export async function fetchBookInfo(
  isbns: readonly (string | null)[],
): Promise<Record<string, BookInfo>> {
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
  const infos: Record<string, BookInfo> = {};

  try {
    const res = await fetch(`${OPENBD_ENDPOINT}?isbn=${keys.join(",")}`, {
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return {};

    const books = (await res.json()) as (OpenBdBook | null)[];
    books.forEach((book, i) => {
      const info = book ? toBookInfo(book) : null;
      if (!info) return;
      for (const raw of rawsByIsbn.get(keys[i]) ?? []) infos[raw] = info;
    });
  } catch {
    // openBD が落ちていても講義詳細は出す。補足なしで描くだけ
    return {};
  }

  return infos;
}
