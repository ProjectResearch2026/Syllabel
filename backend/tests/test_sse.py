"""app/api/sse.py のテスト。"""
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.sse import format_sse, sse_response


def test_format_sse_basic():
    assert format_sse({"delta": "こん"}) == 'data: {"delta": "こん"}\n\n'


def test_format_sse_done_is_lowercase_true():
    assert format_sse({"done": True}) == 'data: {"done": true}\n\n'


def test_sse_response_streams_events():
    app = FastAPI()

    @app.get("/stream")
    async def stream():
        async def gen():
            yield format_sse({"delta": "こん"})
            yield format_sse({"done": True})

        return sse_response(gen())


    client = TestClient(app)
    resp = client.get("/stream")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")
    assert resp.headers["cache-control"] == "no-cache"
    assert resp.text == 'data: {"delta": "こん"}\n\ndata: {"done": true}\n\n'
