"""chat_agent のユニットテスト。実サーバには接続しない。"""

import pytest
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
