"""app/agents/instructor_name.py のユニットテスト。

**`frontend/lib/instructorName.ts` と同じ規則であることを前提とする**(design.md §6.1)。
検索画面(frontend)とシラバスチャット(backend)で当たり方が食い違うと、
「検索では出るのにチャットでは知らないと言われる」というねじれが起きる。
"""

from app.agents.instructor_name import instructor_queries

FULL_WIDTH = "　"


def test_full_width_space_is_first():
    """全角区切りのフルネームは入力どおりが先頭に来る(1リクエストで当たる)。"""
    queries = instructor_queries(f"山田{FULL_WIDTH}太郎")
    assert queries[0] == f"山田{FULL_WIDTH}太郎"


def test_half_width_space_expands_to_full_width():
    """半角スペースのフルネームに全角区切りと区切りなしを足す。"""
    queries = instructor_queries("山田 太郎")
    assert queries[0] == "山田 太郎"
    assert f"山田{FULL_WIDTH}太郎" in queries
    assert "山田太郎" in queries


def test_no_space_tries_each_split_point():
    """区切りなしの入力は、区切りを入れる位置を順に試す。"""
    queries = instructor_queries("山田太郎")
    assert queries[0] == "山田太郎"
    # 姓2文字での区切り(実際に登録されている表記)が含まれる
    assert f"山田{FULL_WIDTH}太郎" in queries
    assert "山田 太郎" in queries
    # 姓1文字・3文字も試す(どこが境目か分からないため)
    assert f"山{FULL_WIDTH}田太郎" in queries
    assert f"山田太{FULL_WIDTH}郎" in queries


def test_surname_only_is_unchanged_at_head():
    """姓のみは部分一致で当たるため、入力どおりが先頭に来る。"""
    assert instructor_queries("山田")[0] == "山田"


def test_blank_gives_no_query():
    """空文字・空白だけの入力には検索語を出さない。"""
    assert instructor_queries("") == []
    assert instructor_queries(f"  {FULL_WIDTH} ") == []


def test_queries_are_unique():
    """同じ語を二度引かない(区切りなしの書き換えは入力そのものと重なる)。"""
    for word in ["山田太郎", "山田 太郎", f"山田{FULL_WIDTH}太郎", "山田"]:
        queries = instructor_queries(word)
        assert len(queries) == len(set(queries))


def test_surname_length_is_capped():
    """長い入力でも試行が際限なく増えない(姓の長さの上限は4文字)。"""
    queries = instructor_queries("あいうえおかきくけこ")
    # 入力そのもの + 区切り位置4か所 × (全角・半角)
    assert len(queries) == 1 + 4 * 2
