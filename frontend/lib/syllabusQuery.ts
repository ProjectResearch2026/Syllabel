/**
 * シラバス検索の絞り込みを、詳細画面をまたいで保つための橋渡し。design.md §8。
 *
 * 絞り込みは URL のクエリに持っている(`app/syllabus/page.tsx` が
 * `searchParams` から読む)。詳細画面へ移ると当然クエリは消えるため、
 * **カードのリンクに `back` として畳んで持たせ、「一覧に戻る」で開き直す**。
 * 詳細画面は静的に `/syllabus` へ戻るリンクしか持てず、`router.back()` は
 * 直リンクで開かれた場合に戻り先が無いため採らない。
 *
 * 時間割など別の画面を経由したときは `back` を運べないため、一覧を開いている
 * あいだクエリをストアに書き写しておき(`SyllabusQueryMemory`)、ヘッダー・
 * タブバーの「シラバス」をそこへ向ける。
 */

/** 一覧の絞り込みを表すクエリキー。`back` で往復させる対象でもある。 */
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

/** 既知のキーだけを通して畳み直す。URL 由来の値をそのまま信用しないため。 */
export function pickListParams(source: URLSearchParams): URLSearchParams {
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

/**
 * 一覧へ戻るリンクの宛先。`back` が無ければ素の一覧へ。
 *
 * 詳細画面の「シラバス一覧に戻る」(`back` クエリ)のほか、ヘッダー・タブバーの
 * 「シラバス」(最後に開いていた一覧の条件。`useSyllabusUIStore` の `listQuery`)
 * もこれで組む。どちらもキーは `LIST_QUERY_KEYS` で濾し直す。
 */
export function listHref(back: string | string[] | undefined): string {
  const raw = typeof back === "string" ? back : undefined;
  if (!raw) return "/syllabus";
  const restored = pickListParams(new URLSearchParams(raw)).toString();
  return restored ? `/syllabus?${restored}` : "/syllabus";
}

/**
 * 履修提案の時間割(`/proposal`)から開いた詳細画面であることを示す値。
 * 詳細画面の戻り先を時間割にする(design.md §8.3.4)。
 */
const FROM_PROPOSAL = "proposal";

/**
 * 履修提案の時間割の科目から詳細画面へのリンク。`from=proposal` を付け、
 * 詳細画面の「戻る」を時間割へ向ける。
 *
 * **同じタブで開く(`next/link` のクライアント遷移)。** 学生プロファイルと提案は
 * ブラウザのメモリにしか無い(永続化しない)ため、別タブで開くと取り込み前の
 * 状態になり、戻っても提案が消えている。
 */
export function proposalDetailHref(code: string): string {
  return `/syllabus/${encodeURIComponent(code)}?from=${FROM_PROPOSAL}`;
}

/** 詳細画面の「戻る」の宛先と文言。時間割から開いたなら時間割へ、それ以外は一覧へ。 */
export function backLink(params: {
  from?: string | string[];
  back?: string | string[];
}): { href: string; label: string } {
  if (params.from === FROM_PROPOSAL) return { href: "/proposal", label: "時間割に戻る" };
  return { href: listHref(params.back), label: "シラバス一覧に戻る" };
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
