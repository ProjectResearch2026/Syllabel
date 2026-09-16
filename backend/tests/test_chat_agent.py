"""chat_agent のユニットテスト。実サーバには接続しない。"""

import pytest
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import FunctionModel
from pydantic_ai.models.test import TestModel

from app.agents.chat_agent import build_chat_agent
from app.agents import tools as tools_module


@pytest.fixture(autouse=True)
def reset_caches():
    build_chat_agent.cache_clear()
    tools_module._get_client.cache_clear()
    yield
    build_chat_agent.cache_clear()
    tools_module._get_client.cache_clear()


# ---------------------------------------------------------------------------
# ファクトリの基本動作
# ---------------------------------------------------------------------------

def test_build_chat_agent_returns_agent():
    """build_chat_agent() が Agent を返すことを確認する。"""
    from pydantic_ai import Agent
    assert isinstance(build_chat_agent(), Agent)


def test_build_chat_agent_is_cached():
    """lru_cache により同一インスタンスが返ることを確認する。"""
    assert build_chat_agent() is build_chat_agent()


# ---------------------------------------------------------------------------
# TestModel によるエンドツーエンド確認
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_chat_agent_returns_str_without_tool():
    """ツール呼び出しなしでも文字列の応答を返すことを確認する。"""
    agent = build_chat_agent()
    with agent.override(model=TestModel(call_tools=[])):
        result = await agent.run("こんにちは")
    assert isinstance(result.output, str)


@pytest.mark.asyncio
async def test_chat_agent_calls_search_tool(monkeypatch):
    """TestModel が tool_search_syllabi を呼び出したとき、search_syllabi が実行されることを確認する。"""
    called = {}

    async def fake_search_syllabi(**kwargs):
        called["kwargs"] = kwargs
        return {"count": 1, "limit": 10, "offset": 0, "results": [{"syllabus_code": "B12345", "course_title": "情報基礎"}]}

    monkeypatch.setattr("app.agents.chat_agent.search_syllabi", fake_search_syllabi)
    build_chat_agent.cache_clear()

    agent = build_chat_agent()
    with agent.override(model=TestModel(call_tools=["tool_search_syllabi"])):
        result = await agent.run("情報基礎を検索して")

    assert isinstance(result.output, str)
    assert "kwargs" in called


@pytest.mark.asyncio
async def test_chat_agent_calls_get_tool(monkeypatch):
    """TestModel が tool_get_syllabus を呼び出したとき、get_syllabus が実行されることを確認する。"""
    called = {}

    async def fake_get_syllabus(code: str):
        called["code"] = code
        return {"syllabus_code": code, "course_title": "情報基礎", "instructor": "山田 太郎"}

    monkeypatch.setattr("app.agents.chat_agent.get_syllabus", fake_get_syllabus)
    build_chat_agent.cache_clear()

    agent = build_chat_agent()
    with agent.override(model=TestModel(call_tools=["tool_get_syllabus"])):
        result = await agent.run("B12345の詳細を教えて")

    assert isinstance(result.output, str)
    assert "code" in called


# ---------------------------------------------------------------------------
# 教員名での検索(design.md §6.1)
# ---------------------------------------------------------------------------

def _model_calling_search(args: dict) -> FunctionModel:
    """`tool_search_syllabi` を指定の引数で1度だけ呼ぶモデルを作る。

    `TestModel` はツールの引数をスキーマから機械的に作るため、教員名のように
    「どんな値で呼ばれたか」が要るときは `FunctionModel` で組み立てる。
    """

    def call(messages, info):
        if any(getattr(part, "tool_name", None) == "tool_search_syllabi"
               for message in messages for part in message.parts):
            return ModelResponse(parts=[TextPart("検索しました")])
        return ModelResponse(parts=[ToolCallPart("tool_search_syllabi", args)])

    return FunctionModel(call)


@pytest.mark.asyncio
async def test_chat_agent_expands_instructor_notation(monkeypatch):
    """教員名を指定されたら、表記の揺れを埋める口(search_syllabi_by_instructor)へ回す。

    api-clean の `instructor` は登録された表記のままの部分一致であり、
    `search_syllabi()` をそのまま使うと「山田太郎」(区切りなし)は0件になる(§6.1)。
    """
    called = {}

    async def fake_by_instructor(instructor, **params):
        called["instructor"] = instructor
        called["params"] = params
        return {"count": 1, "limit": 10, "offset": 0, "results": [{"syllabus_code": "B12345"}]}

    monkeypatch.setattr("app.agents.chat_agent.search_syllabi_by_instructor", fake_by_instructor)
    build_chat_agent.cache_clear()

    agent = build_chat_agent()
    with agent.override(model=_model_calling_search({"instructor": "山田太郎"})):
        await agent.run("山田太郎先生の講義は?")

    assert called["instructor"] == "山田太郎"
    # `instructor` は位置引数で渡すため、その他の条件だけが params に入る
    assert "instructor" not in called["params"]
    assert called["params"]["limit"] == 10


@pytest.mark.asyncio
async def test_chat_agent_keeps_plain_search_without_instructor(monkeypatch):
    """教員名が無いときは従来どおり素通しの search_syllabi を使う。"""
    called = {}

    async def fail_by_instructor(instructor, **params):  # pragma: no cover - 呼ばれない
        raise AssertionError("教員名の指定が無いのに引き直しの口が呼ばれた")

    async def fake_search_syllabi(**kwargs):
        called["kwargs"] = kwargs
        return {"count": 0, "limit": 10, "offset": 0, "results": []}

    monkeypatch.setattr("app.agents.chat_agent.search_syllabi_by_instructor", fail_by_instructor)
    monkeypatch.setattr("app.agents.chat_agent.search_syllabi", fake_search_syllabi)
    build_chat_agent.cache_clear()

    agent = build_chat_agent()
    with agent.override(model=_model_calling_search({"q": "情報基礎"})):
        await agent.run("情報基礎を検索して")

    assert called["kwargs"]["q"] == "情報基礎"
