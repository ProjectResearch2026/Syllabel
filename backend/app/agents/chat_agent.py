"""シラバスチャットエージェント。design.md §7.4・§7.5。"""

from functools import lru_cache

from pydantic_ai import Agent

from app.agents import build_model
from app.agents.tools import get_syllabus, search_syllabi, search_syllabi_by_instructor


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
        """シラバスを検索する。キーワード・学部・課程・学期・曜日・時限・教員名・学年で絞り込める。

        教員名はフルネーム(`山田太郎`)でも姓のみ(`山田`)でも渡してよい。
        姓と名の区切り(全角スペース・半角スペース・無し)の違いは吸収する。
        """
        # このドキュメンテーション文字列はツールの説明として LLM に渡る。
        # 区切りを吸収するのは api-clean ではなくこちら側であり、教員名が
        # 指定されたときは表記の揺れを埋めて引き直す(§6.1)
        params: dict = {
            "q": q,
            "faculty": faculty,
            "program": program,
            "term": term,
            "day": day,
            "period": period,
            "grade": grade,
            "limit": limit,
        }
        if instructor:
            return await search_syllabi_by_instructor(instructor, **params)
        return await search_syllabi(**params)

    @agent.tool_plain
    async def tool_get_syllabus(code: str) -> dict:
        """シラバスコードを指定して講義の詳細情報を取得する。"""
        return await get_syllabus(code)

    return agent
