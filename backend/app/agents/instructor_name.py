"""教員名で引くときの検索語の展開。design.md §6.1 / §6.2。

**api-clean の `instructor` は漢字名の部分一致(`instructor.kanji_name ILIKE`)で、
正規化を持たない。** 姓と名の区切りは登録された表記のまま照合されるため、全角
スペースで「山田　太郎」と登録されている教員は、半角スペースの「山田 太郎」でも
区切りなしの「山田太郎」でも1件も引けない。科目名の突合(`curricula/requirements.py`
の `normalize_title()`)のように**こちら側で正規化して突き合わせることはできない**
— 照合するのは api-clean であり、教員名を持つのは `GET /syllabi/{code}`(詳細)
だけで、一覧は教員名を返さない(§6.2)。

そこで**入力の側を api-clean の表記に寄せて引き直す**。区切りの揺れは
「全角 / 半角 / 無し」の3通りしかない。

| 入力 | 引く語 |
|---|---|
| `山田　太郎`(全角) | 入力どおりで当たる |
| `山田 太郎`(半角) | `山田　太郎` / `山田太郎` を足す |
| `山田太郎`(区切りなし) | 区切りを入れる位置が分からないので、姓の長さを1〜4で試す |
| `山田`(姓のみ) | 部分一致なので入力どおりで当たる |

**入力どおりの語を必ず先頭に置く。** 姓のみ・全角区切りのフルネームはこれで
当たるため、呼び出し側はまず先頭だけを引き、空振りしたときにだけ残りを引けばよい
(`app/agents/tools.py` の `search_syllabi_by_instructor()`)。

**`frontend/lib/instructorName.ts` の `instructorQueries()` と同じ規則に保つこと。**
検索画面(frontend)とシラバスチャット(backend のエージェント)で同じ語の当たり方が
食い違うと、「検索では出るのにチャットでは知らないと言われる」というねじれが起きる。
"""

#: 姓と名の間に入り得る区切り(全角スペース / 半角スペース / 無し)
_SEPARATORS = ("　", " ", "")

#: 区切りなしで入力されたときに試す姓の長さの上限。
#: 日本語の姓はほぼ1〜3文字で、4文字(勅使河原など)が実質の上限である。
#: 上限を切らないと長い入力で試行が際限なく増える。
_MAX_SURNAME_LENGTH = 4


def instructor_queries(keyword: str) -> list[str]:
    """教員名の検索語を、表記の揺れを埋める順に並べて返す。

    先頭は入力そのもの(前後の空白だけ落とす)。以降は当たり得る書き換えで、
    重複は畳む。空文字や空白だけの入力には空のリストを返す。
    """
    word = keyword.strip()
    if not word:
        return []

    queries: list[str] = []

    def add(query: str) -> None:
        if query and query not in queries:
            queries.append(query)

    add(word)

    tokens = word.split()
    if len(tokens) > 1:
        # 区切りは入力が示している。詰め替えるだけでよい
        for separator in _SEPARATORS:
            add(separator.join(tokens))
        return queries

    # 区切りなし。姓と名の境目が分からないので、区切りを入れる位置を順に試す
    for surname in range(1, min(_MAX_SURNAME_LENGTH, len(word) - 1) + 1):
        for separator in _SEPARATORS:
            add(word[:surname] + separator + word[surname:])
    return queries
