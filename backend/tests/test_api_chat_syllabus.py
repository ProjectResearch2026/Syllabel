"""app/api/chat_syllabus.py のテスト。実LLM・実APIには接続しない。"""
from contextlib import asynccontextmanager

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic_ai.models.test import TestModel

import app.api.chat_syllabus as mod
from app.agents import tools as tools_module
from app.agents.chat_agent import build_chat_agent
from app.main import app
from app.schemas.chat import ChatMessage
from app.schemas.student import Course, StudentProfile

client = TestClient(app)

SYLLABUS_DETAIL = {"syllabus_code": "B12345", "course_title": "情報基礎", "instructor": "田中"}
OUTPUT_TEXT = "これは テスト 応答 です"
DONE_EVENT = 'data: {"done": true}\n\n'


@pytest.fixture(autouse=True)
def reset_caches():
    build_chat_agent.cache_clear()
    tools_module._get_client.cache_clear()
    yield
    build_chat_agent.cache_clear()
    tools_module._get_client.cache_clear()

@pytest.fixture
def spy_stream(monkeypatch):
    """_stream_response に渡された引数を記録する。処理はそのまま通す。"""
    captured = {}
    original = mod._stream_response

    def spy(prompt, history, instructions=None):
        captured["prompt"] = prompt
        captured["history"] = history
        captured["instructions"] = instructions
        return original(prompt, history, instructions)

    monkeypatch.setattr(mod, "_stream_response", spy)
    return captured
# ---------------------------------------------------------------------------
# ヘルパー関数
# ---------------------------------------------------------------------------

def test_to_history_converts_roles():
    """user は ModelRequest、assistant は ModelResponse に変換される。"""
    messages = mod._to_history([
        ChatMessage(role="user", content="やあ"),
        ChatMessage(role="assistant", content="こんにちは"),
    ])
    assert [type(m).__name__ for m in messages] == ["ModelRequest", "ModelResponse"]


def test_build_prompt_includes_student_facts():
    """profile があれば学年と課程が質問文に前置される。"""
    profile = StudentProfile(grade=3, program="知能情報メディア課程")
    prompt = mod._build_prompt("月曜3限は?", profile)
    assert "3回生" in prompt
    assert "知能情報メディア課程" in prompt
    assert "月曜3限は?" in prompt


def test_build_prompt_excludes_completed_courses():
    """成績・履修データはプロンプトに含めない。要件§5.5。"""
    profile = StudentProfile(
        grade=3,
        program="知能情報メディア課程",
        completed_courses=[
            Course(title="極秘科目", year=2025, term="前期", credits=2.0, status="passed"),
        ],
    )
    prompt = mod._build_prompt("月曜3限は?", profile)
    assert "極秘科目" not in prompt

# ---------------------------------------------------------------------------
# POST /api/chat/syllabus
# ---------------------------------------------------------------------------

def test_chat_syllabus_returns_sse():
    """200 かつ content-type が text/event-stream であること。"""
    agent = build_chat_agent()
    with agent.override(model=TestModel(call_tools=[], custom_output_text=OUTPUT_TEXT)):
        resp = client.post("/api/chat/syllabus", json={"message": "こんにちは", "history": []})

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")


def test_chat_syllabus_streams_delta_then_done():
    """delta が1つ以上流れ、最後が done であること。"""
    agent = build_chat_agent()
    with agent.override(model=TestModel(call_tools=[], custom_output_text=OUTPUT_TEXT)):
        resp = client.post("/api/chat/syllabus", json={"message": "こんにちは", "history": []})

    events = [e for e in resp.text.split("\n\n") if e]
    assert len(events) >= 2
    assert all(e.startswith("data: ") for e in events)
    assert '"delta"' in events[0]
    assert resp.text.endswith(DONE_EVENT)


def test_chat_syllabus_accepts_history(spy_stream):
    """対話履歴が変換されてエージェントに渡ること。"""
    history = [
        {"role": "user", "content": "前の質問"},
        {"role": "assistant", "content": "前の回答"},
    ]
    agent = build_chat_agent()
    with agent.override(model=TestModel(call_tools=[], custom_output_text=OUTPUT_TEXT)):
        resp = client.post("/api/chat/syllabus", json={"message": "続き", "history": history})

    assert resp.status_code == 200
    assert [type(m).__name__ for m in spy_stream["history"]] == ["ModelRequest", "ModelResponse"]
    assert "続き" in spy_stream["prompt"]
    assert resp.text.endswith(DONE_EVENT)

def test_chat_syllabus_emits_error_event(monkeypatch):
    """ストリーム中に例外が起きても error → done が流れること。"""

    class BoomAgent:
        def run_stream(self, *args, **kwargs):
            raise RuntimeError("boom")

    monkeypatch.setattr(mod, "build_chat_agent", lambda: BoomAgent())

    resp = client.post("/api/chat/syllabus", json={"message": "こんにちは", "history": []})

    assert resp.status_code == 200
    assert '"error"' in resp.text
    assert "boom" not in resp.text
    assert resp.text.endswith(DONE_EVENT)


# ---------------------------------------------------------------------------
# POST /api/chat/syllabus/{code}
# ---------------------------------------------------------------------------

def test_chat_syllabus_by_code_fetches_detail(monkeypatch):
    """URL の code で get_syllabus が呼ばれること。"""
    called = {}

    async def mock_get(code: str) -> dict:
        called["code"] = code
        return SYLLABUS_DETAIL

    monkeypatch.setattr(mod, "get_syllabus", mock_get)

    agent = build_chat_agent()
    with agent.override(model=TestModel(call_tools=[], custom_output_text=OUTPUT_TEXT)):
        resp = client.post("/api/chat/syllabus/B12345", json={"message": "この講義は?", "history": []})

    assert resp.status_code == 200
    assert called["code"] == "B12345"
    assert resp.text.endswith(DONE_EVENT)

def test_chat_syllabus_by_code_injects_detail(monkeypatch, spy_stream):
    """講義詳細が instructions に日本語のまま埋め込まれること。"""

    async def mock_get(code: str) -> dict:
        return SYLLABUS_DETAIL

    monkeypatch.setattr(mod, "get_syllabus", mock_get)

    agent = build_chat_agent()
    with agent.override(model=TestModel(call_tools=[], custom_output_text=OUTPUT_TEXT)):
        resp = client.post("/api/chat/syllabus/B12345", json={"message": "この講義は?", "history": []})

    assert resp.status_code == 200
    assert "【対象講義】" in spy_stream["instructions"]
    assert "情報基礎" in spy_stream["instructions"]

def test_chat_syllabus_by_code_404(monkeypatch):
    """upstream が 404 なら 404 を返すこと。"""

    async def mock_get(code: str) -> dict:
        req = httpx.Request("GET", f"http://test/syllabi/{code}")
        resp = httpx.Response(404, request=req)
        raise httpx.HTTPStatusError("not found", request=req, response=resp)

    monkeypatch.setattr(mod, "get_syllabus", mock_get)

    resp = client.post("/api/chat/syllabus/NOTEXIST", json={"message": "hi", "history": []})
    assert resp.status_code == 404


def test_chat_syllabus_by_code_502_on_upstream_error(monkeypatch):
    """upstream が 5xx なら 502 を返すこと。"""

    async def mock_get(code: str) -> dict:
        req = httpx.Request("GET", f"http://test/syllabi/{code}")
        resp = httpx.Response(503, request=req)
        raise httpx.HTTPStatusError("error", request=req, response=resp)

    monkeypatch.setattr(mod, "get_syllabus", mock_get)

    resp = client.post("/api/chat/syllabus/B12345", json={"message": "hi", "history": []})
    assert resp.status_code == 502


def test_chat_syllabus_by_code_502_on_connect_error(monkeypatch):
    """upstream に接続できないときも 502 を返すこと。"""

    async def mock_get(code: str) -> dict:
        raise httpx.ConnectError("connection failed")

    monkeypatch.setattr(mod, "get_syllabus", mock_get)

    resp = client.post("/api/chat/syllabus/B12345", json={"message": "hi", "history": []})
    assert resp.status_code == 502

def test_chat_syllabus_error_midstream_still_emits_done(monkeypatch):
    """delta を流した後に失敗しても error → done で締めること。"""

    class _Result:
        async def stream_text(self, delta=False, debounce_by=0.1):
            yield "途中まで"
            raise RuntimeError("boom")

    class MidBoomAgent:
        def run_stream(self, *args, **kwargs):
            @asynccontextmanager
            async def cm():
                yield _Result()

            return cm()

    monkeypatch.setattr(mod, "build_chat_agent", lambda: MidBoomAgent())

    resp = client.post("/api/chat/syllabus", json={"message": "こんにちは", "history": []})

    assert resp.status_code == 200
    assert '"delta"' in resp.text
    assert '"error"' in resp.text
    assert "boom" not in resp.text
    assert resp.text.endswith(DONE_EVENT)
