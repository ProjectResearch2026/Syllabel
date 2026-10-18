"""app/api/syllabus.py のテスト。app.agents.tools の関数を monkeypatch する。"""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

SYLLABI_RESPONSE = {
    "count": 1,
    "limit": 20,
    "offset": 0,
    "results": [{"syllabus_code": "B12345", "course_title": "情報基礎"}],
}
SYLLABUS_DETAIL = {"syllabus_code": "B12345", "course_title": "情報基礎", "instructor": "田中"}
MASTERS_RESPONSE = {"faculties": ["理工学部"], "terms": ["前期", "後期"]}


# ---------------------------------------------------------------------------
# GET /api/syllabi
# ---------------------------------------------------------------------------

def test_search_syllabi_ok(monkeypatch):
    async def mock_search(**kwargs):
        return SYLLABI_RESPONSE

    import app.api.syllabus as mod
    monkeypatch.setattr(mod, "search_syllabi", mock_search)

    resp = client.get("/api/syllabi", params={"q": "情報"})
    assert resp.status_code == 200
    assert resp.json() == SYLLABI_RESPONSE


def test_search_syllabi_passes_query_params(monkeypatch):
    captured = {}

    async def mock_search(**kwargs):
        captured.update(kwargs)
        return SYLLABI_RESPONSE

    import app.api.syllabus as mod
    monkeypatch.setattr(mod, "search_syllabi", mock_search)

    client.get("/api/syllabi", params={"q": "AI", "faculty": "理工", "limit": 10})
    assert captured["q"] == "AI"
    assert captured["faculty"] == "理工"
    assert captured["limit"] == 10


def test_search_syllabi_502_on_upstream_error(monkeypatch):
    import httpx

    async def mock_search(**kwargs):
        req = httpx.Request("GET", "http://test/syllabi")
        resp = httpx.Response(500, request=req)
        raise httpx.HTTPStatusError("error", request=req, response=resp)

    import app.api.syllabus as mod
    monkeypatch.setattr(mod, "search_syllabi", mock_search)

    resp = client.get("/api/syllabi")
    assert resp.status_code == 502


# ---------------------------------------------------------------------------
# GET /api/syllabi/{code}
# ---------------------------------------------------------------------------

def test_get_syllabus_ok(monkeypatch):
    async def mock_get(code: str) -> dict:
        return SYLLABUS_DETAIL

    import app.api.syllabus as mod
    monkeypatch.setattr(mod, "get_syllabus", mock_get)

    resp = client.get("/api/syllabi/B12345")
    assert resp.status_code == 200
    assert resp.json() == SYLLABUS_DETAIL


def test_get_syllabus_404(monkeypatch):
    import httpx

    async def mock_get(code: str) -> dict:
        req = httpx.Request("GET", f"http://test/syllabi/{code}")
        resp = httpx.Response(404, request=req)
        raise httpx.HTTPStatusError("not found", request=req, response=resp)

    import app.api.syllabus as mod
    monkeypatch.setattr(mod, "get_syllabus", mock_get)

    resp = client.get("/api/syllabi/NOTEXIST")
    assert resp.status_code == 404


def test_get_syllabus_502_on_upstream_error(monkeypatch):
    import httpx

    async def mock_get(code: str) -> dict:
        req = httpx.Request("GET", f"http://test/syllabi/{code}")
        resp = httpx.Response(503, request=req)
        raise httpx.HTTPStatusError("error", request=req, response=resp)

    import app.api.syllabus as mod
    monkeypatch.setattr(mod, "get_syllabus", mock_get)

    resp = client.get("/api/syllabi/B12345")
    assert resp.status_code == 502


# ---------------------------------------------------------------------------
# GET /api/masters
# ---------------------------------------------------------------------------

def test_get_masters_ok(monkeypatch):
    async def mock_masters() -> dict:
        return MASTERS_RESPONSE

    import app.api.syllabus as mod
    monkeypatch.setattr(mod, "get_masters", mock_masters)

    resp = client.get("/api/masters")
    assert resp.status_code == 200
    assert resp.json() == MASTERS_RESPONSE


def test_get_masters_502_on_upstream_error(monkeypatch):
    import httpx

    async def mock_masters() -> dict:
        req = httpx.Request("GET", "http://test/masters")
        resp = httpx.Response(500, request=req)
        raise httpx.HTTPStatusError("error", request=req, response=resp)

    import app.api.syllabus as mod
    monkeypatch.setattr(mod, "get_masters", mock_masters)

    resp = client.get("/api/masters")
    assert resp.status_code == 502


# ---------------------------------------------------------------------------
# GET /api/course-targets(§6.1.3)
# ---------------------------------------------------------------------------

FACULTY = "先端理工学部"


@pytest.fixture(autouse=True)
def _clear_targets_cache():
    """口ごとにキャッシュを捨てる。テスト間で組み立て結果を持ち越さない。"""
    import app.api.syllabus as mod

    mod.clear_targets_cache()
    yield
    mod.clear_targets_cache()


def _fake_search_by_program(by_program: dict[str | None, list[str]], calls: list[dict]):
    """`program` ごとにコード一覧を返す `search_syllabi` の差し替え。

    api-clean の `program` は完全一致で、対象課程を持たないシラバスは絞り込みから
    落ちる。その振る舞いを、辞書に無い課程名を空で返すことで模す。
    """

    async def mock_search(**kwargs):
        calls.append(kwargs)
        codes = by_program.get(kwargs.get("program"), [])
        rows = [{"syllabus_code": c} for c in codes] if kwargs["offset"] == 0 else []
        return {"count": len(rows), "limit": kwargs["limit"], "offset": kwargs["offset"], "results": rows}

    return mock_search


def _fake_masters(names: list[str]):
    async def mock_masters():
        return {"course_program": [{"id": i, "name": n} for i, n in enumerate(names, 1)]}

    return mock_masters


def test_course_targets_maps_codes_to_programs(monkeypatch):
    """コード → 対象課程を返す。どの課程にも現れないコードは空配列(課程指定なし)。"""
    import app.api.syllabus as mod

    calls: list[dict] = []
    monkeypatch.setattr(
        mod,
        "search_syllabi",
        _fake_search_by_program(
            {None: ["A1", "B1", "S1", "G1"], "課程A": ["A1", "S1"], "課程B": ["B1", "S1"]},
            calls,
        ),
    )
    monkeypatch.setattr(mod, "get_masters", _fake_masters(["課程A", "課程B"]))

    resp = client.get("/api/course-targets", params={"year": 2026, "faculty": FACULTY})

    assert resp.status_code == 200
    body = resp.json()
    assert body["offeringYear"] == 2026
    assert body["faculty"] == FACULTY
    assert body["targets"] == {
        "A1": ["課程A"],
        "B1": ["課程B"],
        "S1": ["課程A", "課程B"],
        "G1": [],  # 課程指定なし
    }
    # 学部で絞った全件を1本、課程ごとに1本ずつ引く
    assert [c.get("program") for c in calls] == [None, "課程A", "課程B"]
    assert {c["faculty"] for c in calls} == {FACULTY}


def test_course_targets_has_etag_and_returns_304(monkeypatch):
    """学生データを含まないため ETag で再検証できる(§6.1.3)。"""
    import app.api.syllabus as mod

    monkeypatch.setattr(
        mod, "search_syllabi", _fake_search_by_program({None: ["A1"], "課程A": ["A1"]}, [])
    )
    monkeypatch.setattr(mod, "get_masters", _fake_masters(["課程A"]))

    first = client.get("/api/course-targets", params={"year": 2026, "faculty": FACULTY})
    etag = first.headers["ETag"]
    assert "max-age" in first.headers["Cache-Control"]

    again = client.get(
        "/api/course-targets",
        params={"year": 2026, "faculty": FACULTY},
        headers={"If-None-Match": etag},
    )
    assert again.status_code == 304
    assert again.headers["ETag"] == etag


def test_course_targets_caches_between_requests(monkeypatch):
    """2回目は上流を引き直さない(組み立ては10リクエスト規模になるため)。"""
    import app.api.syllabus as mod

    calls: list[dict] = []
    monkeypatch.setattr(
        mod, "search_syllabi", _fake_search_by_program({None: ["A1"], "課程A": ["A1"]}, calls)
    )
    monkeypatch.setattr(mod, "get_masters", _fake_masters(["課程A"]))

    client.get("/api/course-targets", params={"year": 2026, "faculty": FACULTY})
    n = len(calls)
    client.get("/api/course-targets", params={"year": 2026, "faculty": FACULTY})

    assert len(calls) == n


def test_course_targets_upstream_failure_is_502(monkeypatch):
    """上流に届かないときは 502(§6.1 / §3.4.4)。"""
    import httpx

    import app.api.syllabus as mod

    async def boom(**kwargs):
        raise httpx.RequestError("connect error")

    monkeypatch.setattr(mod, "search_syllabi", boom)
    monkeypatch.setattr(mod, "get_masters", _fake_masters(["課程A"]))

    resp = client.get("/api/course-targets", params={"year": 2026, "faculty": FACULTY})
    assert resp.status_code == 502


# ---------------------------------------------------------------------------
# 接続失敗・タイムアウト(httpx.RequestError)は 502。捕まえないと 500 になる
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    ("attr", "path"),
    [
        ("search_syllabi", "/api/syllabi"),
        ("get_syllabus", "/api/syllabi/B12345"),
        ("get_masters", "/api/masters"),
    ],
)
@pytest.mark.parametrize("error", ["connect", "timeout"])
def test_unreachable_upstream_is_502(monkeypatch, attr, path, error):
    import httpx

    async def mock_unreachable(*args, **kwargs):
        req = httpx.Request("GET", "http://test/")
        if error == "connect":
            raise httpx.ConnectError("connection refused", request=req)
        raise httpx.ReadTimeout("timed out", request=req)

    import app.api.syllabus as mod
    monkeypatch.setattr(mod, attr, mock_unreachable)

    resp = client.get(path)
    assert resp.status_code == 502
