from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
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


class ProposalChatRequest(BaseModel):
    """`POST /api/chat/proposal` のリクエスト。design.md §7.3「履歴+提案+質問」。

    シラバスチャット(`ChatRequest`)が質問文(`message`)と履歴(`history`)を
    分けて受けるのに対し、提案チャットは対話全体を `messages` の1本で受け、
    **末尾の user 発言を今回の質問、それより前を履歴として扱う**。提案画面の
    対話は提案を起点に続くもので、frontend 側が最後の1件だけ切り出す必然性が
    無いためである。

    提案(`proposal`)はサーバに永続化しないため毎リクエスト受け取る(§6.1)。
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    student_profile: StudentProfile | None = None
    proposal: TimetableProposal
    messages: list[ChatMessage] = Field(min_length=1)

    @model_validator(mode="after")
    def check_last_message_is_question(self) -> "ProposalChatRequest":
        if self.messages[-1].role != "user":
            raise ValueError(
                "messages の末尾は学生の質問(role: user)である必要があります"
            )
        return self

    @property
    def question(self) -> str:
        """今回の質問。"""
        return self.messages[-1].content

    @property
    def history(self) -> list[ChatMessage]:
        """質問より前の対話履歴。"""
        return self.messages[:-1]
