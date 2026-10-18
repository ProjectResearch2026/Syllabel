"""科目名の検索語での照合。design.md §6.1。

**api-clean の `q` は科目名の `ILIKE` 部分一致で、正規化を持たない**(§6.2)。科目名は
大学のデータの表記のまま混在しており(`Ⅰ` はローマ数字の1文字、括弧は全角、`A` は半角)、
2026年度の実データで「プログラミング基礎演習1」「仏教の思想Ａ」「英語総合1(A)」
「線形代数 演習」「でーたべーす」はいずれも0件だった。そこで科目名の照合は `q` に任せず、
条件に当たる全件を引いてから手元で行う(`tools.search_syllabi_by_title()`)。

**frontend の `lib/titleSearch.ts` と同じ規則に保つこと。** 検索画面は frontend が照合し、
シラバスチャットの検索ツールは backend が照合する。食い違うと「検索画面では出るのに
チャットでは見つからない」というねじれが起きる(教員名の `instructor_name.py` と同じ理由)。

**`curricula/requirements.py` の `normalize_title()` とは別物である。** あちらは履修要項・
成績表との突合用で、別の科目を同じ科目とみなさないよう狭い規則に保つ。こちらは
「探している科目が候補に出るか」だけの用途なので、揺れを広めに畳む。
"""

import re
import unicodedata

# 区切りとして無視する文字。空白と中黒(NFKC で半角の `･` も `・` になる)
_IGNORED = re.compile(r"[\s・]")

# ローマ数字(NFKC で `Ⅰ` → `I`、`Ⅱ` → `II` になったもの)。直前が英字以外の非 ASCII 文字
# (漢字・かななど)で、直後が英字でないときだけ算用数字にする。「AI」「VR」「X線」の
# ような英字の語を数字にしないため
_ROMAN = re.compile(r"(?<=[^\x00-\x7F])(IX|IV|V?I{1,3}|V|X)(?![A-Za-z])")
_ROMAN_VALUE = {
    "I": "1", "II": "2", "III": "3", "IV": "4", "V": "5",
    "VI": "6", "VII": "7", "VIII": "8", "IX": "9", "X": "10",
}


def _to_katakana(text: str) -> str:
    """ひらがなをカタカナにする(`でーたべーす` → `データベース`)。"""
    return "".join(chr(ord(c) + 0x60) if "ぁ" <= c <= "ゖ" else c for c in text)


def title_search_key(text: str) -> str:
    """照合用の形にする。全角・半角、ローマ数字、ひらがな・カタカナ、空白・中黒の違いを畳む。"""
    folded = _ROMAN.sub(
        lambda m: _ROMAN_VALUE.get(m.group(0), m.group(0)),
        unicodedata.normalize("NFKC", text),
    )
    return _IGNORED.sub("", _to_katakana(folded).lower())


def matches_title(title: str, keyword: str) -> bool:
    """科目名が検索語に当たるか。空白で区切った語はすべて含む(AND)ものを当たりとする。"""
    terms = [key for word in keyword.split() if (key := title_search_key(word))]
    if not terms:
        return True
    key = title_search_key(title)
    return all(term in key for term in terms)
