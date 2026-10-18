"""app/api/chat_syllabus.py のテスト。実LLM・実APIには接続しない。"""

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic_ai.messages import ModelMessage, PartStartEvent, TextPart, ToolReturnPart
from pydantic_ai.models.function import (
    AgentInfo,
    DeltaThinkingCalls,
    DeltaThinkingPart,
    DeltaToolCall,
    DeltaToolCalls,
    FunctionModel,
)
from pydantic_ai.models.test import TestModel

import app.agents.chat_agent as chat_agent_mod
import app.api.chat_syllabus as mod
from app.agents import tools as tools_module
from app.agents.chat_agent import build_chat_agent
from app.main import app
from app.schemas.chat import ChatMessage
from app.schemas.student import Course, StudentProfile

client = TestClient(app)

SYLLABUS_DETAIL = {
    "syllabus_code": "B12345",
    "course_title": "情報基礎",
    "instructor": "田中",
}
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


def _deltas(body: str) -> list[str]:
    """SSE レスポンス本文から delta の値だけを順番に取り出す。"""
    values: list[str] = []
    for event in body.split("\n\n"):
        if not event.startswith("data: "):
            continue
        payload = json.loads(event.removeprefix("data: "))
        if "delta" in payload:
            values.append(payload["delta"])
    return values


def _has_tool_return(messages: list[ModelMessage]) -> bool:
    """ツール実行結果が履歴に入っている(=2回目のモデル呼び出し)かを判定する。"""
    return any(
        isinstance(part, ToolReturnPart)
        for message in messages
        for part in getattr(message, "parts", [])
    )


# ---------------------------------------------------------------------------
# ヘルパー関数
# ---------------------------------------------------------------------------


def test_to_history_converts_roles():
    """user は ModelRequest、assistant は ModelResponse に変換される。"""
    messages = mod._to_history(
        [
            ChatMessage(role="user", content="やあ"),
            ChatMessage(role="assistant", content="こんにちは"),
        ]
    )
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
            Course(
                title="極秘科目", year=2025, term="前期", credits=2.0, status="passed"
            ),
        ],
    )
    prompt = mod._build_prompt("月曜3限は?", profile)
    assert "極秘科目" not in prompt


# ---------------------------------------------------------------------------
# システムプロンプト(issue #62)
# ---------------------------------------------------------------------------

# 回答内容そのものは LLM 依存で非決定的なため、ここで確かめるのは
# 「原典を逸脱させないための規則がプロンプトに載り、両ルートでモデルに渡ること」まで。
# 捏造が実際に消えたかは実機スモーク(scripts/smoke_chat_syllabus.py)で確認する。


@pytest.mark.parametrize(
    "rule",
    [
        "ツールが返した内容だけを根拠にする",  # 対応案1
        "推測であることを明示",  # 対応案2
        "必修",  # 対応案3
        "複数のクラス",  # 対応案4
    ],
)
def test_syllabus_prompt_states_grounding_rules(rule: str):
    """issue #62 の対応案1〜4に当たる規則がプロンプトに含まれること。"""
    assert rule in mod._SYLLABUS_PROMPT


def test_syllabus_prompt_matches_design_doc():
    """設計書 §7.4.1 に転記したプロンプトが実体と一致すること。

    プロンプトは設計書に本文ごと載せている(design.md §7.4.1)。片方だけ直すと
    設計書が嘘になるため、コードブロックの中身を照合する。
    """
    doc = Path(__file__).parents[2] / "docs" / "design" / "05-interfaces.md"
    if not doc.exists():  # 設計書を含まない配布物では検査しない
        pytest.skip("設計書が無い")

    body = doc.read_text(encoding="utf-8").split("#### 7.4.1 システムプロンプト", 1)[1]
    quoted = body.split("```", 2)[1].strip("\n")

    assert quoted == mod._SYLLABUS_PROMPT


def test_syllabus_prompt_reaches_model(spy_stream):
    """/api/chat/syllabus でプロンプトが instructions として渡ること。"""
    agent = build_chat_agent()
    with agent.override(model=TestModel(call_tools=[], custom_output_text=OUTPUT_TEXT)):
        resp = client.post(
            "/api/chat/syllabus", json={"message": "情報基礎とは?", "history": []}
        )

    assert resp.status_code == 200
    assert mod._SYLLABUS_PROMPT in spy_stream["instructions"]


def test_syllabus_prompt_reaches_model_by_code(monkeypatch, spy_stream):
    """講義単位ルートでも、講義詳細の前段にプロンプトが残ること。"""

    async def mock_get(code: str) -> dict:
        return SYLLABUS_DETAIL

    monkeypatch.setattr(mod, "get_syllabus", mock_get)

    agent = build_chat_agent()
    with agent.override(model=TestModel(call_tools=[], custom_output_text=OUTPUT_TEXT)):
        resp = client.post(
            "/api/chat/syllabus/B12345", json={"message": "この講義は?", "history": []}
        )

    assert resp.status_code == 200
    assert mod._SYLLABUS_PROMPT in spy_stream["instructions"]


# ---------------------------------------------------------------------------
# POST /api/chat/syllabus
# ---------------------------------------------------------------------------


def test_chat_syllabus_returns_sse():
    """200 かつ content-type が text/event-stream であること。"""
    agent = build_chat_agent()
    with agent.override(model=TestModel(call_tools=[], custom_output_text=OUTPUT_TEXT)):
        resp = client.post(
            "/api/chat/syllabus", json={"message": "こんにちは", "history": []}
        )

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")


def test_chat_syllabus_streams_delta_then_done():
    """delta が1つ以上流れ、最後が done であること。"""
    agent = build_chat_agent()
    with agent.override(model=TestModel(call_tools=[], custom_output_text=OUTPUT_TEXT)):
        resp = client.post(
            "/api/chat/syllabus", json={"message": "こんにちは", "history": []}
        )

    events = [e for e in resp.text.split("\n\n") if e]
    assert len(events) >= 2
    assert all(e.startswith("data: ") for e in events)
    assert '"delta"' in events[0]
    assert resp.text.endswith(DONE_EVENT)
    assert "".join(_deltas(resp.text)) == OUTPUT_TEXT


def test_chat_syllabus_accepts_history(spy_stream):
    """対話履歴が変換されてエージェントに渡ること。"""
    history = [
        {"role": "user", "content": "前の質問"},
        {"role": "assistant", "content": "前の回答"},
    ]
    agent = build_chat_agent()
    with agent.override(model=TestModel(call_tools=[], custom_output_text=OUTPUT_TEXT)):
        resp = client.post(
            "/api/chat/syllabus", json={"message": "続き", "history": history}
        )

    assert resp.status_code == 200
    assert [type(m).__name__ for m in spy_stream["history"]] == [
        "ModelRequest",
        "ModelResponse",
    ]
    assert "続き" in spy_stream["prompt"]
    assert resp.text.endswith(DONE_EVENT)
    assert "龍谷大学" in spy_stream["instructions"]


def test_chat_syllabus_runs_tool_after_blank_text(monkeypatch):
    """ツール直前に空白だけの TextPart が来てもツールが実行され、本文が流れること。

    Qwen3.6(reasoning パーサ)の実挙動の回帰テスト。run_stream() は最初の
    TextPart("\\n\\n")を最終出力とみなしてグラフを打ち切っていた。
    """
    called = {}

    # キーワードは科目名の表記の揺れを畳む口(search_syllabi_by_title)へ回る(§6.1)
    async def fake_search_syllabi(q, **kwargs) -> dict:
        called["kwargs"] = {"q": q, **kwargs}
        return {"items": [SYLLABUS_DETAIL]}

    monkeypatch.setattr(chat_agent_mod, "search_syllabi_by_title", fake_search_syllabi)

    async def stream_fn(
        messages: list[ModelMessage], info: AgentInfo
    ) -> AsyncIterator[str | DeltaToolCalls]:
        if _has_tool_return(messages):
            yield "情報基礎は"
            yield "月曜3限です"
        else:
            # ツール呼び出しの直前に空白だけのテキストが混じる
            yield "\n\n"
            yield {
                0: DeltaToolCall(
                    name="tool_search_syllabi", json_args='{"q": "情報基礎"}'
                )
            }

    agent = build_chat_agent()
    with agent.override(model=FunctionModel(stream_function=stream_fn)):
        resp = client.post(
            "/api/chat/syllabus", json={"message": "情報基礎は何曜日?", "history": []}
        )

    assert resp.status_code == 200
    assert called["kwargs"]["q"] == "情報基礎"

    deltas = _deltas(resp.text)
    assert deltas, "本文が1つも流れていない"
    assert "".join(deltas) == "情報基礎は月曜3限です"
    assert deltas[0].strip(), "先頭に空白だけの delta が流れている"
    assert resp.text.endswith(DONE_EVENT)


def test_chat_syllabus_strips_leading_whitespace():
    """本文の先頭に付いた空白は取り除いて流すこと。"""

    async def stream_fn(
        messages: list[ModelMessage], info: AgentInfo
    ) -> AsyncIterator[str]:
        yield "\n\nこんにちは"

    agent = build_chat_agent()
    with agent.override(model=FunctionModel(stream_function=stream_fn)):
        resp = client.post(
            "/api/chat/syllabus", json={"message": "やあ", "history": []}
        )

    assert resp.status_code == 200
    assert _deltas(resp.text) == ["こんにちは"]
    assert resp.text.endswith(DONE_EVENT)


def test_chat_syllabus_does_not_stream_thinking():
    """思考(ThinkingPart)はクライアントに流さないこと。"""

    async def stream_fn(
        messages: list[ModelMessage], info: AgentInfo
    ) -> AsyncIterator[str | DeltaThinkingCalls]:
        yield {0: DeltaThinkingPart(content="内部思考です")}
        yield "本文です"

    agent = build_chat_agent()
    with agent.override(model=FunctionModel(stream_function=stream_fn)):
        resp = client.post(
            "/api/chat/syllabus", json={"message": "やあ", "history": []}
        )

    assert resp.status_code == 200
    assert _deltas(resp.text) == ["本文です"]
    assert "内部思考" not in resp.text


def test_chat_syllabus_emits_error_event(monkeypatch):
    """ストリーム中に例外が起きても error → done が流れること。"""

    class BoomAgent:
        def run_stream_events(self, *args, **kwargs):
            raise RuntimeError("boom")

    monkeypatch.setattr(mod, "build_chat_agent", lambda: BoomAgent())

    resp = client.post(
        "/api/chat/syllabus", json={"message": "こんにちは", "history": []}
    )

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
        resp = client.post(
            "/api/chat/syllabus/B12345", json={"message": "この講義は?", "history": []}
        )

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
        resp = client.post(
            "/api/chat/syllabus/B12345", json={"message": "この講義は?", "history": []}
        )

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

    resp = client.post(
        "/api/chat/syllabus/NOTEXIST", json={"message": "hi", "history": []}
    )
    assert resp.status_code == 404


def test_chat_syllabus_by_code_502_on_upstream_error(monkeypatch):
    """upstream が 5xx なら 502 を返すこと。"""

    async def mock_get(code: str) -> dict:
        req = httpx.Request("GET", f"http://test/syllabi/{code}")
        resp = httpx.Response(503, request=req)
        raise httpx.HTTPStatusError("error", request=req, response=resp)

    monkeypatch.setattr(mod, "get_syllabus", mock_get)

    resp = client.post(
        "/api/chat/syllabus/B12345", json={"message": "hi", "history": []}
    )
    assert resp.status_code == 502


def test_chat_syllabus_by_code_502_on_connect_error(monkeypatch):
    """upstream に接続できないときも 502 を返すこと。"""

    async def mock_get(code: str) -> dict:
        raise httpx.ConnectError("connection failed")

    monkeypatch.setattr(mod, "get_syllabus", mock_get)

    resp = client.post(
        "/api/chat/syllabus/B12345", json={"message": "hi", "history": []}
    )
    assert resp.status_code == 502


def test_chat_syllabus_error_midstream_still_emits_done(monkeypatch):
    """delta を流した後に失敗しても error → done で締めること。"""

    class MidBoomAgent:
        def run_stream_events(self, *args, **kwargs):
            @asynccontextmanager
            async def cm():
                async def events():
                    yield PartStartEvent(index=0, part=TextPart(content="途中まで"))
                    raise RuntimeError("boom")

                yield events()

            return cm()

    monkeypatch.setattr(mod, "build_chat_agent", lambda: MidBoomAgent())

    resp = client.post(
        "/api/chat/syllabus", json={"message": "こんにちは", "history": []}
    )

    assert resp.status_code == 200
    assert '"delta"' in resp.text
    assert '"error"' in resp.text
    assert "boom" not in resp.text
    assert resp.text.endswith(DONE_EVENT)
