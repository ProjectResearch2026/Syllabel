"""シラバスチャットエージェント。design.md §7.4・§7.5。

ツールは `search_courses` / `get_course`(`app/agents/course_tools.py`)で、時間割の
アシスタントと同じものを使う。学生の文脈(`StudentContext`)があれば、ツールの結果に
その学生にとっての区分・入る要件枠・履修できるか・修得済みかが付く。

役割定義は呼び出し側が instructions として毎リクエスト渡す(app/api/chat_syllabus.py)。
"""

from dataclasses import dataclass
from functools import lru_cache

from pydantic_ai import Agent

from app.agents import build_model
from app.agents.course_tools import register_course_tools
from app.timetable.context import StudentContext


@dataclass
class ChatDeps:
    """シラバスチャットのツールが読む文脈。学生の情報が無ければ `student` は None。"""

    student: StudentContext | None = None


@lru_cache
def build_chat_agent() -> Agent[ChatDeps, str]:
    """シラバスチャットエージェントを生成する。build_model()(§6.3)と同じ遅延初期化。"""
    agent: Agent[ChatDeps, str] = Agent(build_model(), deps_type=ChatDeps)
    register_course_tools(agent)
    return agent
