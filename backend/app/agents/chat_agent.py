"""シラバスチャットエージェント。design.md §7.4・§7.5。"""

from functools import lru_cache

from pydantic_ai import Agent

from app.agents import build_model
from app.agents.tools import get_syllabus, search_syllabi


@lru_cache
def build_chat_agent() -> Agent:
    """シラバスチャットエージェントを生成する。build_model()(05)と同じ遅延初期化パターン。

    役割定義は呼び出し側が instructions として毎リクエスト渡す(app/api/chat_syllabus.py)。
    """
    agent: Agent[None, str] = Agent(build_model())

    @agent.tool_plain
    async def tool_search_syllabi(
        q: str | None = None,
        faculty: str | None = None,
        program: str | None = None,
        term: str | None = None,
        day: str | None = None,
        period: str | None = None,
        instructor: str | None = None,
        grade: int | None = None,
        limit: int = 10,
    ) -> dict:
        """シラバスを検索する。キーワード・学部・課程・学期・曜日・時限・教員名・学年で絞り込める。"""
        return await search_syllabi(
            q=q,
            faculty=faculty,
            program=program,
            term=term,
            day=day,
            period=period,
            instructor=instructor,
            grade=grade,
            limit=limit,
        )

    @agent.tool_plain
    async def tool_get_syllabus(code: str) -> dict:
        """シラバスコードを指定して講義の詳細情報を取得する。"""
        return await get_syllabus(code)

    return agent
