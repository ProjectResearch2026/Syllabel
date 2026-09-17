/**
 * シラバスの自由記述(授業概要など)の改行を、表示する前に整える。
 *
 * api-clean が返す本文は元の教務システムの固定幅そのままで、`本講義では、情報科学
 * の基礎となる離散数` / `学の考え方を学ぶ。` のように**語の途中で改行が入っている**。
 * `RichText` は `whitespace-pre-wrap` で改行を保つため、そのまま出すと画面幅とは
 * 無関係な位置で行が切れて読めない。
 *
 * **畳んでよいのは、幅で折り返された改行だけである。** 書き手が段落・箇条書きの
 * 区切りとして入れた改行まで消すと、元の文書に無い文のつながりを作ってしまう。
 * 両者は本文からは見分けられないので、**折り返しの証拠がある改行だけを畳む**。
 */

// 全角は2桁、半角は1桁として数える。元データの折り返しは文字数ではなく桁で決まる
const WIDE_CHAR =
  /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/;

/** 折り返し幅とみなす最小の桁数。これより短い行で揃う本文は書き手の改行とみなす */
const MIN_WRAP_COLUMNS = 40;

/** 禁則処理で1〜2桁ぶん手前で折り返ることがあるため、最長行との差をこれだけ許す */
const WRAP_SLACK = 2;

/** 文の終わり。ここで切れている改行は書き手のものかもしれないので畳まない */
const SENTENCE_END = /[。．！？!?…」』）)】]$/;

/** 箇条書き・番号の頭。折り返しの続きではありえないので、この行の前では畳まない */
const LIST_HEAD =
  /^(?:[・･◦◎○●■□▲△▼◆◇＊*\-—―–+]|[(（[［【]|[0-9０-９]+[.．)）、:：]|[①-⑳]|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]|第[0-9０-９]+[回章節部])/;

function columnWidth(line: string): number {
  let width = 0;
  for (const char of line) width += WIDE_CHAR.test(char) ? 2 : 1;
  return width;
}

/**
 * 行をつなぐときに挟む文字。
 *
 * 日本語は詰めてつなぐが、英字どうしを詰めると `inter` + `national` のように
 * 単語が溶けるため空白を入れる。ただし URL の途中は詰めないと壊れる。
 */
function joiner(prev: string, next: string): string {
  if (!/[0-9A-Za-z]$/.test(prev) || !/^[0-9A-Za-z]/.test(next)) return "";
  const tail = prev.split(/[\s　]/).pop() ?? "";
  if (/^https?:\/\//.test(tail)) return "";
  return " ";
}

/**
 * 固定幅で折り返された改行だけを畳む。段落・箇条書きの改行はそのまま残す。
 *
 * 畳む条件は3つで、いずれも「幅で折り返された」ことの証拠である。
 *
 * 1. その行が**最長行と同じ幅まで埋まっている** — 幅が尽きた以外に切れる理由がない
 * 2. その行が**句点で終わっていない** — 文末の改行は書き手が入れたものかもしれない。
 *    ここで畳むのをやめても残るのは文と文のあいだの改行だけで、読めなくはならない。
 *    逆に畳んでしまうと、書き手が分けた文を1つにつないでしまう
 * 3. 次の行が**箇条書き・番号で始まっていない**
 *
 * 最長行が `MIN_WRAP_COLUMNS` に満たない本文は、そもそも固定幅の折り返しではない
 * (1行ずつ短く書いた本文)とみなして何もしない。
 */
export function unwrapWrappedLines(text: string): string {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t　]+$/, ""));
  if (lines.length < 2) return lines.join("\n");

  const widths = lines.map(columnWidth);
  const wrapColumns = Math.max(...widths);
  if (wrapColumns < MIN_WRAP_COLUMNS) return lines.join("\n");

  const out: string[] = [];
  let joined = lines[0];
  for (let i = 1; i < lines.length; i++) {
    const next = lines[i].replace(/^[ \t　]+/, "");
    const wrapped =
      joined !== "" &&
      next !== "" &&
      widths[i - 1] >= wrapColumns - WRAP_SLACK &&
      !SENTENCE_END.test(joined) &&
      !LIST_HEAD.test(next);
    if (wrapped) {
      joined += joiner(joined, next) + next;
    } else {
      out.push(joined);
      joined = lines[i];
    }
  }
  out.push(joined);
  return out.join("\n");
}
