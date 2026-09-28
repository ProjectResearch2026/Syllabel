"""app/agents/instructor_name.py のユニットテスト。

**`frontend/lib/instructorName.ts` と同じ規則であることを前提とする**(design.md §6.1)。
検索画面(frontend)とシラバスチャット(backend)で当たり方が食い違うと、
「検索では出るのにチャットでは知らないと言われる」というねじれが起きる。
"""

import pytest

from app.agents.instructor_name import spell_instructor_name

FULL_WIDTH = "　"

#: api-clean に登録されている表記(2026年度の実データから)。全角スペース区切り
_REGISTERED = [
    f"山田{FULL_WIDTH}太郎",
    f"植田{FULL_WIDTH}祥明",
    f"オーガスティン{FULL_WIDTH}ジョナサン",
    f"ヘルナンデス{FULL_WIDTH}ホセ",
    f"ナットチー{FULL_WIDTH}直子",
    f"ドラグナ{FULL_WIDTH}ラルカ{FULL_WIDTH}マリア",
]


def _exists(registered: list[str], asked: list[str]):
    """api-clean の `instructor`(部分一致)を模した問い合わせ。問い合わせた語を asked に積む。"""

    async def exists(query: str) -> bool:
        asked.append(query)
        return any(query in name for name in registered)

    return exists


async def _spell(keyword: str, registered: list[str] = _REGISTERED) -> tuple[str | None, list[str]]:
    asked: list[str] = []
    return await spell_instructor_name(keyword, _exists(registered, asked)), asked


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "keyword, expected",
    [
        ("山田太郎", f"山田{FULL_WIDTH}太郎"),
        ("山田 太郎", f"山田{FULL_WIDTH}太郎"),
        ("植田祥明", f"植田{FULL_WIDTH}祥明"),
        # 姓が5文字以上。以前は姓の長さを1〜4文字で決め打ちしていて引けなかった
        ("オーガスティンジョナサン", f"オーガスティン{FULL_WIDTH}ジョナサン"),
        ("ヘルナンデスホセ", f"ヘルナンデス{FULL_WIDTH}ホセ"),
        ("ナットチー直子", f"ナットチー{FULL_WIDTH}直子"),
        # 区切りが2つ。以前は区切りを1つしか入れなかったので引けなかった
        ("ドラグナラルカマリア", f"ドラグナ{FULL_WIDTH}ラルカ{FULL_WIDTH}マリア"),
        # 入力の空白が一部だけでも組み立て直す
        ("ドラグナ ラルカマリア", f"ドラグナ{FULL_WIDTH}ラルカ{FULL_WIDTH}マリア"),
        # 区切りをまたぐ一部分でも当たる(部分一致なので)
        ("ティンジョナ", f"ティン{FULL_WIDTH}ジョナ"),
    ],
)
async def test_spells_registered_name(keyword, expected):
    """区切りの有無・位置・数によらず、登録表記に至る。"""
    spelled, _ = await _spell(keyword)
    assert spelled == expected


@pytest.mark.asyncio
async def test_asks_one_char_at_a_time():
    """1文字ずつ伸ばし、繋げて外れたところで区切りを挟む。"""
    _, asked = await _spell("山田太郎")
    assert asked == ["山田", "山田太", f"山田{FULL_WIDTH}太", f"山田{FULL_WIDTH}太郎"]


@pytest.mark.asyncio
async def test_half_width_separator_is_tried_after_full_width():
    """半角スペースで登録された教員にも至る(全角を試したあとに試す)。"""
    spelled, asked = await _spell("山田太郎", ["山田 太郎"])
    assert spelled == "山田 太郎"
    assert asked.index(f"山田{FULL_WIDTH}太") < asked.index("山田 太")


@pytest.mark.asyncio
async def test_backtracks_from_a_dead_end():
    """偶然当たる寄り道(別の教員の名前の一部)で行き止まったら戻って区切りを試す。"""
    # 「山田太」は別の教員(山田太一)に当たるが、そのまま伸ばしても「山田太郎」には至らない
    spelled, _ = await _spell("山田太郎", ["山田太一", f"山田{FULL_WIDTH}太郎"])
    assert spelled == f"山田{FULL_WIDTH}太郎"


@pytest.mark.asyncio
async def test_unknown_name_gives_none():
    """どの教員にも至らなければ None。"""
    spelled, _ = await _spell("存在しない先生")
    assert spelled is None


@pytest.mark.asyncio
async def test_blank_gives_none_without_asking():
    """空文字・空白だけの入力には問い合わせない。"""
    for keyword in ["", f"  {FULL_WIDTH} "]:
        spelled, asked = await _spell(keyword)
        assert spelled is None
        assert asked == []


@pytest.mark.asyncio
async def test_probes_are_capped():
    """どの語でも当たる相手でも、問い合わせは上限で打ち切る(際限なく増えない)。"""
    asked: list[str] = []

    async def always_but_never_complete(query: str) -> bool:
        asked.append(query)
        # 最後の1文字を含む語だけ外す → 行き止まりが続き、後戻りし続ける
        return "ん" not in query

    spelled = await spell_instructor_name("あいうえおかきくけこさしすせそたちつてとん", always_but_never_complete)
    assert spelled is None
    assert len(asked) <= 64
