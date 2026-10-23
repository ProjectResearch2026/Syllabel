"""chat_agent のユニットテスト。実サーバには接続しない。"""

import json

import pytest
from pydantic_ai import Agent
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart, ToolReturnPart
from pydantic_ai.models.function import FunctionModel

from app.agents import course_tools
from app.agents.chat_agent import ChatDeps, build_chat_agent
import timetable_fixtures as fx


@pytest.fixture(autouse=True)
def reset_caches(monkeypatch):
    build_chat_agent.cache_clear()

    async def fake_catalog(*args, **kwargs):
        return fx.catalog()

    monkeypatch.setattr(course_tools, "get_catalog", fake_catalog)
    yield
    build_chat_agent.cache_clear()


def test_build_chat_agent_returns_cached_agent_with_course_tools():
    agent = build_chat_agent()
    assert isinstance(agent, Agent)
    assert agent is build_chat_agent()
    assert set(agent._function_toolset.tools) == {"search_courses", "get_course"}


def _model_calling(tool: str, args: dict, seen: list):
    def call(messages, info):
        returns = [
            part
            for message in messages
            for part in getattr(message, "parts", [])
            if isinstance(part, ToolReturnPart)
        ]
        if not returns:
            return ModelResponse(parts=[ToolCallPart(tool_name=tool, args=args)])
        seen.append(returns[-1].content)
        return ModelResponse(parts=[TextPart(content="見つかりました。")])

    return FunctionModel(call)


@pytest.mark.asyncio
async def test_search_tool_runs_without_student():
    seen: list = []
    agent = build_chat_agent()
    with agent.override(model=_model_calling("search_courses", {"keyword": "理論"}, seen)):
        result = await agent.run("理論の科目は?", deps=ChatDeps())

    assert result.output == "見つかりました。"
    titles = {c["title"] for c in seen[0]["courses"]}
    assert titles == {"情報理論", "符号理論"}


@pytest.mark.asyncio
async def test_get_tool_returns_formatted_sections(monkeypatch):
    async def fake_get_syllabus(code):
        return {
            "syllabus_code": code,
            "course_title": "符号理論",
            "term_name": "前期",
            "slots": [{"term": "前期", "day": "水", "period": 3}],
            "credits": 2,
            "grading": json.dumps({"評価項目": [{"項目": "試験", "割合": 100}]}, ensure_ascii=False),
        }

    monkeypatch.setattr(course_tools, "get_syllabus", fake_get_syllabus)
    seen: list = []
    agent = build_chat_agent()
    model = _model_calling("get_course", {"code": "Y000000006", "sections": ["成績評価"]}, seen)
    with agent.override(model=model):
        await agent.run("評価方法は?", deps=ChatDeps())

    assert seen[0]["sections"] == {"成績評価": "試験 100%"}
    assert seen[0]["when"] == "前期 水3"


def test_reasoning_effort_defaults_to_low_and_can_be_changed(monkeypatch):
    """既定は low。`LLM_REASONING_EFFORT` で切り替えられる(§6.3.1)。"""
    from app.agents import chat_model_settings
    from app.settings import get_settings

    def effort() -> str:
        get_settings.cache_clear()
        return chat_model_settings()["extra_body"]["chat_template_kwargs"]["reasoning_effort"]

    monkeypatch.delenv("LLM_REASONING_EFFORT", raising=False)
    assert effort() == "low"
    monkeypatch.setenv("LLM_REASONING_EFFORT", "xhigh")
    assert effort() == "xhigh"
    get_settings.cache_clear()


def test_reasoning_effort_rejects_values_the_template_does_not_know(monkeypatch):
    """テンプレートは3値以外で例外を投げるので、起動時に弾く。"""
    import pydantic

    from app.settings import Settings

    monkeypatch.setenv("LLM_REASONING_EFFORT", "high")
    with pytest.raises(pydantic.ValidationError):
        Settings()
