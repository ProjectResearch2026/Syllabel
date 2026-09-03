from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.schemas.proposal import TimetableProposal
from app.schemas.student import StudentProfile


class ChatMessage(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    message: str
    history: list[ChatMessage] = []
    profile: StudentProfile | None = None


class ProposalChatRequest(ChatRequest):
    """提案チャットのリクエスト。design.md §7.3。"""

    proposal: TimetableProposal
