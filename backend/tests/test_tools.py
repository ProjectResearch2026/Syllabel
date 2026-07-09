"""app/agents/tools.py のユニットテスト。実サーバには接続しない。"""
import pytest
import httpx
import pytest_asyncio

from app.agents import tools as tools_module
from app.agents.tools import search_syllabi, get_syllabus, get_masters


@pytest.fixture(autouse=True)
def reset_client_cache():
    """各テスト前後に _get_client の lru_cache をクリアする。"""
    tools_module._get_client.cache_clear()
    yield
    tools_module._get_client.cache_clear()


@pytest.fixture
def mock_transport():
    """httpx.MockTransport を返すファクトリ fixture。"""
    def _make(handler):
        return httpx.MockTransport(handler)
    return _make


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
        return httpx.Response(200, json=[])

    _patch_client(monkeypatch, handler)
    result = await search_syllabi()

    assert captured["url"].path == "/syllabi"
    assert result == []


@pytest.mark.asyncio
async def test_search_syllabi_query_params(monkeypatch):
    """指定したクエリパラメータが正しく送られることを確認する。"""
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["params"] = dict(request.url.params)
        return httpx.Response(200, json=[{"code": "B12345"}])

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
        return httpx.Response(200, json=[])

    _patch_client(monkeypatch, handler)
    await search_syllabi(q="AI", program=None, campus=None)

    assert "q" in captured["params"]
    assert "program" not in captured["params"]
    assert "campus" not in captured["params"]


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
