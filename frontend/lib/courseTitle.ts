/**
 * 科目名の突合用の正規化。design.md §5.1.5。
 *
 * **`curricula/` の科目名は履修要項の表記のまま転記する規約であり、正規化は
 * 突き合わせる側の責務である。** 成績表由来の科目名には全角英数字や空白が混じる。
 *
 * 大学のデータ自体が表記を混在させている。「仏教の思想A」の例:
 *
 * | 出どころ | 表記 |
 * |---|---|
 * | 履修要項(`curricula/`) | `仏教の思想A`(半角 A / U+0041) |
 * | Web シラバス検索ページ | `仏教の思想Ａ`(**全角 Ａ / U+FF21**) |
 * | api-clean の `course_title` | `仏教の思想A`(半角) |
 *
 * 完全一致で突き合わせると、成績表が全角側だったときに修得済みと判定できない。
 * 実際、修得しているのに「修得済み」タグが出ない不具合が出ていた。
 *
 * **backend の `app/curricula/requirements.py` の `normalize_title()` と同じ規則に
 * すること。** 卒業要件の充足判定(backend)と検索のタグ(frontend)で結果が食い違うと、
 * 「残り単位では修得済みなのにタグが出ない」というねじれが起きる。実際それが
 * 起きていた(backend には正規化があり、frontend には無かった)。
 */
export function normalizeTitle(title: string): string {
  return title.normalize("NFKC").replace(/\s+/g, "");
}
