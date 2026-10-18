"""app/agents/title_search.py のテスト。frontend の lib/titleSearch.ts と同じ規則(design.md §6.1)。"""
import pytest

from app.agents.title_search import matches_title, title_search_key


@pytest.mark.parametrize(
    ("title", "keyword"),
    [
        # 2026年度の実データで api-clean の q(ILIKE)では0件だった語
        ("プログラミング基礎演習Ⅰ", "プログラミング基礎演習1"),
        ("プログラミング基礎演習Ⅰ", "プログラミング基礎演習I"),
        ("プログラミング基礎演習Ⅰ", "プログラミング基礎演習１"),
        ("仏教の思想A", "仏教の思想Ａ"),
        ("英語総合1（A）", "英語総合1(A)"),
        ("線形代数・演習", "線形代数 演習"),
        ("線形代数・演習", "線形代数演習"),
        ("データベース", "でーたべーす"),
        # 空白で区切った語は AND
        ("線形代数学Ⅰ・演習", "線形　演習"),
        ("データサイエンス・AI入門", "ai"),
    ],
)
def test_matches(title, keyword):
    assert matches_title(title, keyword)


@pytest.mark.parametrize(
    ("title", "keyword"),
    [
        ("プログラミング基礎演習Ⅱ", "プログラミング基礎演習1"),
        ("線形代数・演習", "線形 統計"),
        ("データベース", "情報"),
    ],
)
def test_does_not_match(title, keyword):
    assert not matches_title(title, keyword)


def test_roman_numerals_only_after_japanese():
    """英字の語(AI・X線)は数字にしない。漢字・かなの直後のローマ数字だけを畳む。"""
    assert title_search_key("基礎力学Ⅰ．") == "基礎力学1."
    assert title_search_key("AI") == "ai"
    assert title_search_key("X線") == "x線"
    assert title_search_key("計算力学実習Ⅳ") == "計算力学実習4"


def test_blank_keyword_matches_everything():
    assert matches_title("データベース", "　 ")
