"""app/api/chat_proposal.py のテスト。実LLMには接続しない。"""

from collections.abc import AsyncIterator

import pytest
from fastapi.testclient import TestClient
from pydantic_ai.messages import ModelMessage, ToolReturnPart
from pydantic_ai.models.function import (
    AgentInfo,
    DeltaToolCall,
    DeltaToolCalls,
    FunctionModel,
)
from pydantic_ai.models.test import TestModel

import app.agents.chat_agent as chat_agent_mod
import app.api.chat_proposal as mod
from app.agents import tools as tools_module
from app.agents.chat_agent import build_chat_agent
from app.main import app

client = TestClient(app)

OUTPUT_TEXT = "これは テスト 応答 です"
DONE_EVENT = 'data: {"done": true}\n\n'

PROPOSAL = {
    "courses": [
        {
            "title": "情報基礎",
            "day": "月",
            "period": 1,
            "term": "前期",
            "credits": 2,
            "category": "必修",
            "reason": "卒業必修のため",
        },
    ],
    "totalCredits": 2,
    "summary": "1年前期の必修を中心に組みました。",
}


@pytest.fixture(autouse=True)
def reset_caches():
    build_chat_agent.cache_clear()
    tools_module._get_client.cache_clear()
    yield
    build_chat_agent.cache_clear()
    tools_module._get_client.cache_clear()


@pytest.fixture
def fake_llm():
    """LLMをTestModelに差し替える。実際のvllmは呼ばれない。"""
    agent = build_chat_agent()
    with agent.override(model=TestModel(call_tools=[], custom_output_text=OUTPUT_TEXT)):
        yield


@pytest.fixture
def spy_stream(monkeypatch):
    """_stream_response に渡された引数を記録する。処理はそのまま通す。"""
    captured = {}
    original = mod._stream_response

    def spy(prompt, history, instructions):
        captured["prompt"] = prompt
        captured["history"] = history
        captured["instructions"] = instructions
        return original(prompt, history, instructions)

    monkeypatch.setattr(mod, "_stream_response", spy)
    return captured


def _has_tool_return(messages: list[ModelMessage]) -> bool:
    """ツール実行結果が履歴に入っている(=2回目のモデル呼び出し)かを判定する。"""
    return any(
        isinstance(part, ToolReturnPart)
        for message in messages
        for part in getattr(message, "parts", [])
    )


# ---------------------------------------------------------------------------
# POST /api/chat/proposal
# ---------------------------------------------------------------------------


def test_chat_proposal_streams_deltas(fake_llm):
    """200 + text/event-stream で delta が流れ、done で終わる。"""
    r = client.post(
        "/api/chat/proposal",
        json={"message": "なぜこの科目？", "history": [], "proposal": PROPOSAL},
    )
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    assert '"delta"' in r.text
    assert r.text.endswith(DONE_EVENT)


def test_chat_proposal_injects_proposal(fake_llm, spy_stream):
    """現在の提案が instructions に埋め込まれる。"""
    r = client.post(
        "/api/chat/proposal",
        json={"message": "質問", "history": [], "proposal": PROPOSAL},
    )
    assert r.status_code == 200
    assert "【現在の履修提案】" in spy_stream["instructions"]
    assert "情報基礎" in spy_stream["instructions"]


def test_chat_proposal_accepts_history(fake_llm, spy_stream):
    """対話履歴が PydanticAI の型に変換されて渡される。"""
    r = client.post(
        "/api/chat/proposal",
        json={
            "message": "もう少し詳しく",
            "history": [
                {"role": "user", "content": "なぜ情報基礎？"},
                {"role": "assistant", "content": "必修だからです。"},
            ],
            "proposal": PROPOSAL,
        },
    )
    assert r.status_code == 200
    assert [type(m).__name__ for m in spy_stream["history"]] == [
        "ModelRequest",
        "ModelResponse",
    ]


def test_chat_proposal_requires_proposal():
    """proposal が無いリクエストは422になる。"""
    r = client.post("/api/chat/proposal", json={"message": "質問", "history": []})
    assert r.status_code == 422


def test_chat_proposal_rejects_time_conflict():
    """同じコマに2科目ある提案は422で弾かれる。"""
    bad = {
        "courses": [
            {"title": "A", "day": "月", "period": 1, "term": "前期", "reason": "r"},
            {"title": "B", "day": "月", "period": 1, "term": "前期", "reason": "r"},
        ],
        "summary": "重複あり",
    }
    r = client.post(
        "/api/chat/proposal",
        json={"message": "質問", "history": [], "proposal": bad},
    )
    assert r.status_code == 422


def test_chat_proposal_runs_tool_after_blank_text(monkeypatch):
    """提案チャットでも tool_get_syllabus が実行され、本文が流れること(#43 と同じ経路の回帰)。"""
    called = {}

    async def fake_get_syllabus(code: str) -> dict:
        called["code"] = code
        return {"syllabus_code": code, "course_title": "情報基礎"}

    monkeypatch.setattr(chat_agent_mod, "get_syllabus", fake_get_syllabus)

    async def stream_fn(
        messages: list[ModelMessage], info: AgentInfo
    ) -> AsyncIterator[str | DeltaToolCalls]:
        if _has_tool_return(messages):
            yield "情報基礎は月曜1限です"
        else:
            yield "\n\n"
            yield {
                0: DeltaToolCall(
                    name="tool_get_syllabus", json_args='{"code": "B12345"}'
                )
            }

    agent = build_chat_agent()
    with agent.override(model=FunctionModel(stream_function=stream_fn)):
        resp = client.post(
            "/api/chat/proposal",
            json={"message": "情報基礎の詳細は?", "history": [], "proposal": PROPOSAL},
        )

    assert resp.status_code == 200
    assert called["code"] == "B12345"
    assert "情報基礎は月曜1限です" in resp.text
    assert resp.text.endswith(DONE_EVENT)
