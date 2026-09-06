"""app/agents/tools.py のユニットテスト。実サーバには接続しない。"""
import pytest
import httpx

from app.agents import tools as tools_module
from app.agents.tools import (
    search_syllabi,
    search_syllabi_for_agent,
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
# search_syllabi_for_agent(issue #62 / design.md §7.4.1 規則6)
# ---------------------------------------------------------------------------

# 一覧には担当教員も term_schedule_raw も無い。LLM がクラスを見分けられず
# 別クラスの属性を混ぜたため、backend 側で詳細を引いて行ごとに確定させる。

_LIST_ROWS = [
    {"syllabus_code": "Y000001030", "course_title": "情報基礎", "day_of_week": "木", "period": 3},
    {"syllabus_code": "Y000001060", "course_title": "情報基礎", "day_of_week": "木", "period": 1},
    {"syllabus_code": "Y000009999", "course_title": "微分積分", "day_of_week": "月", "period": 2},
]
_DETAILS = {
    "Y000001030": {
        "instructors": [{"kanji_name": "植村　渉", "kana_name": "うえむら"}],
        "term_schedule_raw": "１Ｑ 木３・木４",
    },
    "Y000001060": {
        "instructors": [{"kanji_name": "丸山　敦"}],
        "term_schedule_raw": "１Ｑ 木１・木２",
    },
    "Y000009999": {"instructors": [], "term_schedule_raw": "前期　月２"},
}


def _list_handler(monkeypatch, rows=None, limit=10, detail_status=200):
    """/syllabi と /syllabi/{code} の両方を返すハンドラを仕込む。"""
    rows = _LIST_ROWS if rows is None else rows
    requested: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/syllabi":
            body = {"count": len(rows), "limit": limit, "offset": 0,
                    "results": [dict(r) for r in rows]}
            return httpx.Response(200, json=body)
        code = path.removeprefix("/syllabi/")
        requested.append(code)
        if detail_status != 200:
            return httpx.Response(detail_status, json={"detail": "boom"})
        return httpx.Response(200, json=_DETAILS.get(code, {}))

    _patch_client(monkeypatch, handler)
    return requested


@pytest.mark.asyncio
async def test_for_agent_adds_instructor_and_schedule(monkeypatch):
    """各行に担当教員と開講コマ原文が付き、行ごとに正しく対応すること。"""
    requested = _list_handler(monkeypatch)

    data = await search_syllabi_for_agent(q="情報基礎")

    by_code = {r["syllabus_code"]: r for r in data["results"]}
    assert by_code["Y000001030"]["instructors"] == ["植村　渉"]
    assert by_code["Y000001030"]["term_schedule_raw"] == "１Ｑ 木３・木４"
    # 取り違えの回帰。丸山のコマが植村の行に混ざってはいけない
    assert by_code["Y000001060"]["instructors"] == ["丸山　敦"]
    assert by_code["Y000001060"]["term_schedule_raw"] == "１Ｑ 木１・木２"
    assert sorted(requested) == ["Y000001030", "Y000001060", "Y000009999"]


@pytest.mark.asyncio
async def test_for_agent_counts_same_title_classes(monkeypatch):
    """同名科目のクラス数が付き、1件だけの科目は含まれないこと。"""
    _list_handler(monkeypatch)

    data = await search_syllabi_for_agent(q="情報基礎")

    assert data["same_title_classes"] == {"情報基礎": 2}


@pytest.mark.asyncio
async def test_for_agent_survives_detail_failure(monkeypatch):
    """詳細取得が失敗しても検索結果は返ること(その行が補われないだけ)。"""
    _list_handler(monkeypatch, detail_status=500)

    data = await search_syllabi_for_agent(q="情報基礎")

    assert len(data["results"]) == 3
    assert "instructors" not in data["results"][0]


@pytest.mark.asyncio
async def test_for_agent_flags_possible_continuation(monkeypatch):
    """取得件数が上限に達していれば may_have_more が立つこと。"""
    _list_handler(monkeypatch, limit=3)

    data = await search_syllabi_for_agent(q="情報基礎")

    assert data["may_have_more"] is True


@pytest.mark.asyncio
async def test_for_agent_omits_flag_when_not_full(monkeypatch):
    """上限に達していなければ may_have_more は付かないこと。"""
    _list_handler(monkeypatch, limit=10)

    data = await search_syllabi_for_agent(q="情報基礎")

    assert "may_have_more" not in data


@pytest.mark.asyncio
async def test_for_agent_caps_detail_fetches(monkeypatch):
    """詳細取得は _ENRICH_LIMIT 件までに抑えること。"""
    rows = [
        {"syllabus_code": f"X{i:06d}", "course_title": "多数科目"}
        for i in range(tools_module._ENRICH_LIMIT + 5)
    ]
    requested = _list_handler(monkeypatch, rows=rows, limit=100)

    await search_syllabi_for_agent(q="多数")

    assert len(requested) == tools_module._ENRICH_LIMIT


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
