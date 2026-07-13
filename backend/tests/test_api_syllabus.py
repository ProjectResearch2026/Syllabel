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
