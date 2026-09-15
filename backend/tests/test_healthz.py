"""死活確認の口。design.md §3.5.1。

公開経路から backend へ届くのは `/pr-2026/api/*` のみで、gateway が `/pr-2026`
を剥がすため `/api/healthz` として到達する。`/healthz` はネットワーク内から
直に叩く用に残してある。
"""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_healthz():
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_api_healthz():
    """gateway 経由(/pr-2026/api/healthz → /api/healthz)で届く口。"""
    r = client.get("/api/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
