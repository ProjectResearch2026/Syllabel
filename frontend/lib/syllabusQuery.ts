/**
 * シラバス検索の絞り込みを、詳細画面をまたいで保つための橋渡し。design.md §8。
 *
 * 絞り込みは URL のクエリに持っている(`app/syllabus/page.tsx` が
 * `searchParams` から読む)。詳細画面へ移ると当然クエリは消えるため、
 * **カードのリンクに `back` として畳んで持たせ、「一覧に戻る」で開き直す**。
 * 詳細画面は静的に `/syllabus` へ戻るリンクしか持てず、`router.back()` は
 * 直リンクで開かれた場合に戻り先が無いため採らない。
 */

/** 一覧の絞り込みを表すクエリキー。`back` で往復させる対象でもある。 */
export const LIST_QUERY_KEYS = [
  "q",
  "program",
  "campus",
  "term",
  "day",
  "period",
  "offset",
  "filters",
] as const;

/** 既知のキーだけを通して畳み直す。URL 由来の値をそのまま信用しないため。 */
function pickListParams(source: URLSearchParams): URLSearchParams {
  const picked = new URLSearchParams();
  for (const key of LIST_QUERY_KEYS) {
    const value = source.get(key);
    if (value) picked.set(key, value);
  }
  return picked;
}

/** 検索結果のカードから詳細画面へのリンク。現在の絞り込みを `back` に畳む。 */
export function detailHref(code: string, current: URLSearchParams | string): string {
  const source = new URLSearchParams(typeof current === "string" ? current : current.toString());
  const back = pickListParams(source).toString();
  const path = `/syllabus/${encodeURIComponent(code)}`;
  return back ? `${path}?back=${encodeURIComponent(back)}` : path;
}

/** 詳細画面の「シラバス一覧に戻る」の宛先。`back` が無ければ素の一覧へ。 */
export function listHref(back: string | string[] | undefined): string {
  const raw = typeof back === "string" ? back : undefined;
  if (!raw) return "/syllabus";
  const restored = pickListParams(new URLSearchParams(raw)).toString();
  return restored ? `/syllabus?${restored}` : "/syllabus";
}
