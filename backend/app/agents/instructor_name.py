"""教員名で引くときの、登録表記の組み立て。design.md §6.1 / §6.2。

**api-clean の `instructor` は漢字名の部分一致(`instructor.kanji_name ILIKE`)で、
正規化を持たない。** 姓と名の区切りは登録された表記のまま照合されるため、全角
スペースで「山田　太郎」と登録されている教員は、半角スペースの「山田 太郎」でも
区切りなしの「山田太郎」でも1件も引けない。科目名の突合(`curricula/requirements.py`
の `normalize_title()`)のように**こちら側で正規化して突き合わせることはできない**
— 照合するのは api-clean であり、教員名を持つのは `GET /syllabi/{code}`(詳細)
だけで、一覧は教員名を返さない(§6.2)。

そこで**入力の空白を取り除き、先頭から1文字ずつ伸ばしながら api-clean に当たるかを
確かめて、登録表記を組み立てる**。次の1文字をそのまま繋げて当たらなければ、
区切り(全角 → 半角)を挟んで試す。

| 入力 | 組み立て |
|---|---|
| `山田`(姓のみ) | 部分一致なので入力どおりで当たる。組み立てない |
| `山田　太郎`(全角) | 同上 |
| `山田 太郎` / `山田太郎` | `山田` → `山田太`(外れ)→ `山田　太` → `山田　太郎` |
| `オーガスティンジョナサン` | 姓が7文字でも同じ手順で `オーガスティン　ジョナサン` に至る |
| `ドラグナラルカマリア` | 区切りが2つあっても `ドラグナ　ラルカ　マリア` に至る |

以前は区切りを入れる位置を姓の長さ1〜4文字で決め打ちしていたため、姓が5文字以上の
教員(オーガスティン・ヘルナンデス・ナットチー)と、区切りが2つある教員(ドラグナ
ラルカ マリア)を区切りなしで引けなかった。**確かめながら伸ばすので、姓の長さも
区切りの数も仮定しない。** 組み立てた語は api-clean に実在する表記の一部であり、
当て推量の語を束ねることもない。

**入力どおりの語をまず引き、空振りしたときだけ組み立てる**(呼び出し側。
`app/agents/tools.py` の `search_syllabi_by_instructor()`)。姓のみ・全角区切りの
フルネームは入力どおりの1回で当たる。

**`frontend/lib/instructorName.ts` の `spellInstructorName()` と同じ規則に保つこと。**
検索画面(frontend)とシラバスチャット(backend のエージェント)で同じ語の当たり方が
食い違うと、「検索では出るのにチャットでは知らないと言われる」というねじれが起きる。
"""

from collections.abc import Awaitable, Callable

#: 1文字を繋げて外れたときに、その手前に挟んで試す区切り。登録表記は全角スペース
#: 区切りなので全角を先に試す
_SEPARATORS = ("　", " ")

#: 組み立て1回あたりの問い合わせの上限。
#: 登録されている教員名は最長でも14文字(区切り込み。2026年度)で、当たる道を
#: まっすぐ伸ばせば1文字につき高々3回で済む。偶然当たる寄り道で後戻りが続いても
#: 問い合わせが際限なく増えないよう、ここで打ち切る。
_MAX_PROBES = 64


async def spell_instructor_name(
    keyword: str,
    exists: Callable[[str], Awaitable[bool]],
) -> str | None:
    """入力を、api-clean に当たる教員名の表記へ組み立てる。

    入力の空白(全角・半角)を取り除き、先頭から1文字ずつ伸ばす。伸ばした語が
    当たるかは `exists` に問い合わせる。

    Args:
        keyword: 学生(またはエージェント)が入力した教員名
        exists: その語で1件以上当たるかを返す関数。`instructor` の部分一致で引く

    Returns:
        最後の1文字まで当たった語。組み立てられなかったとき(どこかで外れた・
        問い合わせの上限に達した・入力が空白だけ)は None。
    """
    chars = "".join(keyword.split())
    if not chars:
        return None

    probes = 0

    async def grow(prefix: str, index: int) -> str | None:
        nonlocal probes
        if index == len(chars):
            return prefix
        # 区切りを挟まない続きを先に試す。外れたら区切りを挟む
        for candidate in [prefix + chars[index], *(prefix + s + chars[index] for s in _SEPARATORS)]:
            if probes >= _MAX_PROBES:
                return None
            probes += 1
            if await exists(candidate):
                spelled = await grow(candidate, index + 1)
                if spelled is not None:
                    return spelled
        return None

    return await grow(chars[0], 1)
