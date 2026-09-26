"""app/agents/tools.py のユニットテスト。実サーバには接続しない。"""
import pytest
import httpx

from app.agents import tools as tools_module
from app.agents.tools import (
    search_syllabi,
    search_syllabi_by_instructor,
    get_syllabus,
    get_masters,
)


@pytest.fixture(autouse=True)
def reset_client_cache():
    """各テスト前後に _get_client の lru_cache をクリアする。"""
    tools_module._get_client.cache_clear()
    yield
    tools_module._get_client.cache_clear()


def _patch_client(monkeypatch, handler):
    """_get_client() が返すクライアントをモックに差し替える。"""
    s = tools_module.get_settings()
    client = httpx.AsyncClient(
        base_url=s.api_clean_base_url,
        timeout=s.http_timeout,
        transport=httpx.MockTransport(handler),
    )
    monkeypatch.setattr(tools_module, "_get_client", lambda: client)


# ---------------------------------------------------------------------------
# _get_client — トークンゲートウェイ向けの Authorization ヘッダ(design.md §3.4.4)
# ---------------------------------------------------------------------------

def test_get_client_without_api_key(monkeypatch):
    """API_CLEAN_API_KEY が空なら Authorization を付けない。

    api-clean を直接叩く開発環境の経路。無認証の相手に余計なヘッダを送らない。
    """
    monkeypatch.setenv("API_CLEAN_API_KEY", "")
    tools_module.get_settings.cache_clear()
    try:
        assert "authorization" not in tools_module._get_client().headers
    finally:
        tools_module.get_settings.cache_clear()


def test_get_client_with_api_key(monkeypatch):
    """API_CLEAN_API_KEY があれば Bearer として付く(ゲートウェイ経由の経路)。"""
    monkeypatch.setenv("API_CLEAN_API_KEY", "syllabus-gw-token-for-test")
    tools_module.get_settings.cache_clear()
    try:
        headers = tools_module._get_client().headers
        assert headers["authorization"] == "Bearer syllabus-gw-token-for-test"
    finally:
        tools_module.get_settings.cache_clear()


# ---------------------------------------------------------------------------
# search_syllabi
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_search_syllabi_path(monkeypatch):
    """パスが /syllabi であることを確認する。"""
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = request.url
        return httpx.Response(200, json={"count": 0, "limit": 20, "offset": 0, "results": []})

    _patch_client(monkeypatch, handler)
    result = await search_syllabi()

    assert captured["url"].path == "/syllabi"
    assert result == {"count": 0, "limit": 20, "offset": 0, "results": []}


@pytest.mark.asyncio
async def test_search_syllabi_query_params(monkeypatch):
    """指定したクエリパラメータが正しく送られることを確認する。"""
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["params"] = dict(request.url.params)
        return httpx.Response(200, json={"count": 1, "limit": 10, "offset": 0, "results": [{"syllabus_code": "B12345"}]})

    _patch_client(monkeypatch, handler)
    await search_syllabi(q="情報", faculty="理工", limit=10, offset=0)

    assert captured["params"]["q"] == "情報"
    assert captured["params"]["faculty"] == "理工"
    assert captured["params"]["limit"] == "10"
    assert captured["params"]["offset"] == "0"


@pytest.mark.asyncio
async def test_search_syllabi_none_params_omitted(monkeypatch):
    """None のパラメータはクエリに含まれないことを確認する。"""
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["params"] = dict(request.url.params)
        return httpx.Response(200, json={"count": 0, "limit": 20, "offset": 0, "results": []})

    _patch_client(monkeypatch, handler)
    await search_syllabi(q="AI", program=None, campus=None)

    assert "q" in captured["params"]
    assert "program" not in captured["params"]
    assert "campus" not in captured["params"]


# ---------------------------------------------------------------------------
# search_syllabi_by_instructor — 教員名の表記ゆれ(design.md §6.1 / §6.2)
# ---------------------------------------------------------------------------

FULL_WIDTH = "\u3000"

#: 教員名が全角スペース区切りでのみ登録されている api-clean を模したデータ
_ROWS = [
    {"syllabus_code": "A1", "instructor": f"山田{FULL_WIDTH}太郎"},
    {"syllabus_code": "A2", "instructor": f"山田{FULL_WIDTH}太郎"},
    {"syllabus_code": "B1", "instructor": f"山田{FULL_WIDTH}花子"},
    {"syllabus_code": "C1", "instructor": f"オーガスティン{FULL_WIDTH}ジョナサン"},
    {"syllabus_code": "D1", "instructor": f"ドラグナ{FULL_WIDTH}ラルカ{FULL_WIDTH}マリア"},
]


def _instructor_handler(captured: list):
    """`instructor` の部分一致だけを効かせるハンドラ。引いた (語, limit) を captured に積む。"""

    def handler(request: httpx.Request) -> httpx.Response:
        params = dict(request.url.params)
        instructor = params.get("instructor")
        limit = int(params["limit"]) if "limit" in params else None
        captured.append((instructor, limit))
        rows = [r for r in _ROWS if instructor and instructor in r["instructor"]]
        return httpx.Response(
            200,
            json={"count": len(rows[:limit]), "limit": limit or 20, "offset": 0, "results": rows[:limit]},
        )

    return handler


@pytest.mark.asyncio
async def test_by_instructor_full_width_hits_in_one_request(monkeypatch):
    """全角区切りのフルネームは1リクエストで当たる(従来と同じコスト)。"""
    captured: list = []
    _patch_client(monkeypatch, _instructor_handler(captured))

    result = await search_syllabi_by_instructor(f"山田{FULL_WIDTH}太郎")

    assert [r["syllabus_code"] for r in result["results"]] == ["A1", "A2"]
    assert captured == [(f"山田{FULL_WIDTH}太郎", None)]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "keyword, codes",
    [
        ("山田 太郎", ["A1", "A2"]),
        ("山田太郎", ["A1", "A2"]),
        # 姓が5文字以上・区切りが2つの教員も区切りなしで引ける
        ("オーガスティンジョナサン", ["C1"]),
        ("ドラグナラルカマリア", ["D1"]),
    ],
)
async def test_by_instructor_spells_registered_name(monkeypatch, keyword, codes):
    """入力どおりで外れたら登録表記を組み立て、その語で引き直す。"""
    captured: list = []
    _patch_client(monkeypatch, _instructor_handler(captured))

    result = await search_syllabi_by_instructor(keyword)

    assert [r["syllabus_code"] for r in result["results"]] == codes
    assert captured[0] == (keyword, None)  # まず入力どおりで引く
    # 組み立ての問い合わせは1件だけ引く
    assert all(limit == 1 for _, limit in captured[1:-1])


@pytest.mark.asyncio
async def test_by_instructor_surname_only_hits_in_one_request(monkeypatch):
    """姓のみは部分一致で当たるため、引き直さない。"""
    captured: list = []
    _patch_client(monkeypatch, _instructor_handler(captured))

    result = await search_syllabi_by_instructor("山田")

    assert [r["syllabus_code"] for r in result["results"]] == ["A1", "A2", "B1"]
    assert captured == [("山田", None)]


@pytest.mark.asyncio
async def test_by_instructor_unknown_name_returns_empty(monkeypatch):
    """組み立てられなければ入力どおりで引いた結果(0件)を返す。"""
    captured: list = []
    _patch_client(monkeypatch, _instructor_handler(captured))

    result = await search_syllabi_by_instructor("存在しない先生")

    assert result["results"] == []


@pytest.mark.asyncio
async def test_by_instructor_passes_other_conditions(monkeypatch):
    """`instructor` 以外の条件はそのまま api-clean へ渡る(組み立ての問い合わせにも)。"""
    captured: list = []

    def handler(request: httpx.Request) -> httpx.Response:
        params = dict(request.url.params)
        captured.append(params)
        rows = [r for r in _ROWS if params["instructor"] in r["instructor"]]
        return httpx.Response(200, json={"count": len(rows), "limit": 10, "offset": 0, "results": rows})

    _patch_client(monkeypatch, handler)
    await search_syllabi_by_instructor("山田太郎", faculty="先端理工学部", year=2026, limit=10)

    assert len(captured) > 1
    for params in captured:
        assert params["faculty"] == "先端理工学部"
        assert params["year"] == "2026"
    assert captured[0]["limit"] == "10"
    assert captured[-1]["limit"] == "10"


@pytest.mark.asyncio
async def test_by_instructor_propagates_probe_failure(monkeypatch):
    """組み立ての問い合わせが失敗したら例外を送出する(「見つからない」と誤答しない)。"""

    def handler(request: httpx.Request) -> httpx.Response:
        if dict(request.url.params).get("limit") == "1":
            return httpx.Response(503, json={"detail": "busy"})
        return httpx.Response(200, json={"count": 0, "limit": 20, "offset": 0, "results": []})

    _patch_client(monkeypatch, handler)
    with pytest.raises(httpx.HTTPStatusError):
        await search_syllabi_by_instructor("山田太郎")


@pytest.mark.asyncio
async def test_by_instructor_blank_drops_the_condition(monkeypatch):
    """空白だけの教員名は条件にしない(空文字で絞り込まない)。"""
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["params"] = dict(request.url.params)
        return httpx.Response(200, json={"count": 0, "limit": 20, "offset": 0, "results": []})

    _patch_client(monkeypatch, handler)
    await search_syllabi_by_instructor("   ", q="情報")

    assert "instructor" not in captured["params"]
    assert captured["params"]["q"] == "情報"


# ---------------------------------------------------------------------------
# get_syllabus
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_syllabus_path(monkeypatch):
    """パスが /syllabi/{code} であることを確認する。"""
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = request.url
        return httpx.Response(200, json={"code": "B12345", "title": "情報基礎"})

    _patch_client(monkeypatch, handler)
    result = await get_syllabus("B12345")

    assert captured["url"].path == "/syllabi/B12345"
    assert result["code"] == "B12345"


@pytest.mark.asyncio
async def test_get_syllabus_raises_on_error(monkeypatch):
    """404 のとき httpx.HTTPStatusError が送出されることを確認する。"""
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    _patch_client(monkeypatch, handler)
    with pytest.raises(httpx.HTTPStatusError):
        await get_syllabus("NOTEXIST")


# ---------------------------------------------------------------------------
# get_masters
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_masters_path(monkeypatch):
    """パスが /masters であることを確認する。"""
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = request.url
        return httpx.Response(200, json={"faculties": [], "terms": []})

    _patch_client(monkeypatch, handler)
    result = await get_masters()

    assert captured["url"].path == "/masters"
    assert "faculties" in result


# ---------------------------------------------------------------------------
# タイムアウト設定
# ---------------------------------------------------------------------------

def test_client_timeout_from_settings(monkeypatch):
    """_get_client のタイムアウトが settings.http_timeout と一致することを確認する。"""
    monkeypatch.setenv("HTTP_TIMEOUT", "42.0")
    # lru_cache はリセット済み(autouse fixture)
    from app.settings import Settings
    monkeypatch.setattr(tools_module, "get_settings", lambda: Settings())

    client = tools_module._get_client()
    assert client.timeout.read == pytest.approx(42.0)
