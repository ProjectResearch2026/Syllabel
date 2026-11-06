/**
 * シラバス検索の絞り込みを、詳細画面をまたいで保つための橋渡し。design.md §8。
 *
 * 絞り込みは URL のクエリに持っている(`app/syllabus/page.tsx` が
 * `searchParams` から読む)。詳細画面へ移ると当然クエリは消えるため、
 * 一覧を開いているあいだクエリをストアに書き写しておき(`SyllabusQueryMemory`)、
 * 詳細画面の「シラバス一覧に戻る」とヘッダー・タブバーの「シラバス」をそこへ向ける。
 *
 * **詳細画面の URL には戻り先を載せない**(`/syllabus/{code}` だけにする)。戻り先を
 * クエリに載せると、同じ講義でも開いた元ごとに URL が変わり、詳細画面がクエリを
 * 読むために中身を前もって用意できない。`router.back()` は直リンクで開かれた場合に
 * 戻り先が無いため採らない。ストアはメモリにだけあり、再読み込みでは消える
 * (学生プロファイルと履修提案も同じく消えるので、戻り先だけ残しても意味が薄い)。
 */

import { DAYS } from "@/lib/timetable";

/** 一覧の1ページの件数。表示だけの都合であり、取得は全件行う(§6.2)。`offset` はこの倍数 */
export const LIST_PAGE_SIZE = 30;

/** 一覧の絞り込みを表すクエリキー。詳細画面から戻るときに開き直す対象でもある。並びは URL の並び */
export const LIST_QUERY_KEYS = [
  "q",
  "program",
  "campus",
  "term",
  "day",
  "period",
  "grade",
  "offset",
] as const;

/** 課程・キャンパス・開講期として受ける値(`GET /api/masters` の名前) */
export type ListChoices = { program: string[]; campus: string[]; term: string[] };

/** 開講期の表記を寄せる(`１Ｑ` と `1Q`)。URL の値をマスタの表記に直すのに使う */
function termKey(term: string): string {
  return term.normalize("NFKC").replace(/\s/g, "");
}

/** `min`〜`max` の整数の表記(`03` や `3.0` ではなく `3`)のときだけ返す */
function intText(value: string, min: number, max: number): string | null {
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  return n >= min && n <= max ? String(n) : null;
}

/**
 * 一覧のクエリを決まった形に直す。**一覧の URL はこの形だけにする**(design.md §8)。
 *
 * - 知らないキー・空の値・同じキーの2つ目以降を落とし、キーは `LIST_QUERY_KEYS` の順に並べる
 * - 値は画面で選べるものだけを通す。曜日は `DAYS`、時限は 1〜7・対象年次は 1〜4 の整数
 *   (api-clean の値域。外れると 422 で一覧が落ちる)、`offset` はページの先頭(`LIST_PAGE_SIZE`
 *   の倍数)に切り下げて 0 なら落とす。検索語は前後の空白を除く
 * - `choices` を渡したときは、課程・キャンパス・開講期をマスタにある名前に限る(開講期は
 *   全角・半角を寄せてマスタの表記にする)
 *
 * `page.tsx` はこの形の値で検索し、`SyllabusQueryMemory` はアドレスバーをこの形に書き換える。
 * 末尾の `&` のように、サーバに届く前に消える崩れはブラウザでしか直せない。
 */
export function canonicalListParams(source: URLSearchParams, choices?: ListChoices): URLSearchParams {
  const out = new URLSearchParams();
  for (const key of LIST_QUERY_KEYS) {
    const raw = source.get(key)?.trim();
    if (!raw) continue;
    let value: string | null = raw;
    switch (key) {
      case "program":
      case "campus":
        value = !choices || choices[key].includes(raw) ? raw : null;
        break;
      case "term":
        value = choices ? (choices.term.find((t) => termKey(t) === termKey(raw)) ?? null) : raw;
        break;
      case "day":
        value = (DAYS as readonly string[]).includes(raw) ? raw : null;
        break;
      case "period":
        value = intText(raw, 1, 7);
        break;
      case "grade":
        value = intText(raw, 1, 4);
        break;
      case "offset": {
        const n = Number(intText(raw, 0, Number.MAX_SAFE_INTEGER) ?? 0);
        value = n >= LIST_PAGE_SIZE ? String(n - (n % LIST_PAGE_SIZE)) : null;
        break;
      }
    }
    if (value) out.set(key, value);
  }
  return out;
}

/** 既知のキーと値だけを通して畳み直す。URL 由来の値をそのまま信用しないため。 */
export function pickListParams(source: URLSearchParams): URLSearchParams {
  return canonicalListParams(source);
}

/**
 * 講義詳細の URL。**どこから開いても同じ形**(戻り先はストアに持つ。ファイル先頭の説明)。
 */
export function detailHref(code: string): string {
  return `/syllabus/${encodeURIComponent(code)}`;
}

/**
 * 一覧へ戻るリンクの宛先。最後に開いていた一覧の条件(`useSyllabusUIStore` の
 * `listQuery`)を開き直す。空なら素の一覧へ。
 *
 * 詳細画面の「シラバス一覧に戻る」とヘッダー・タブバーの「シラバス」がこれで組む。
 * キーは `LIST_QUERY_KEYS` で濾し直す。
 */
export function listHref(listQuery: string): string {
  if (!listQuery) return "/syllabus";
  const restored = pickListParams(new URLSearchParams(listQuery)).toString();
  return restored ? `/syllabus?${restored}` : "/syllabus";
}

/**
 * 詳細画面の「戻る」の宛先と文言。design.md §8.1。
 *
 * 履修提案の時間割から開いた講義(`proposalOrigin` がその講義コード)なら時間割へ、
 * それ以外は最後に開いていた一覧へ。`proposalOrigin` は時間割から開くときに立て
 * (`lib/useTimetableEditing.ts`)、一覧を開くと下ろす(`SyllabusQueryMemory`)。
 */
export function backLink(
  code: string,
  state: { proposalOrigin: string; listQuery: string },
): { href: string; label: string } {
  if (state.proposalOrigin === code) return { href: "/proposal", label: "時間割に戻る" };
  return { href: listHref(state.listQuery), label: "シラバス一覧に戻る" };
}

/**
 * 時間割のマスからシラバス一覧を開くリンク。そのコマ(曜日・時限)と時間割の学期
 * (`useTargetTerm()` の前期・後期)で絞った一覧にする。開講期の「前期」は 1Q・2Q も
 * 含む(`searchCourses()`)ので、前期の時間割に入る科目だけが並ぶ。空きコマに科目を
 * 入れるときと、科目を別の科目に変更するときに使う。コマの無い科目(集中講義など)
 * からは学期だけで絞った一覧を開く
 */
export function slotSearchHref(
  day: string | null | undefined,
  period: number | null | undefined,
  term: string,
): string {
  const params = new URLSearchParams();
  if (day && period != null) {
    params.set("day", day);
    params.set("period", String(period));
  }
  params.set("term", term);
  return `/syllabus?${params.toString()}`;
}
