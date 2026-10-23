from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.schemas.proposal import TargetTerm
from app.schemas.student import StudentProfile


class ChatMessage(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    role: Literal["user", "assistant"]
    content: str

class ChatRequest(BaseModel):
    """シラバスチャット(`POST /api/chat/syllabus` / `.../{code}`)のリクエスト。design.md §7.4。

    課程コード・入学年度・対象学期があれば、検索ツールの結果にその学生にとっての区分・
    入る要件枠・履修できるか・修得済みかを付け、【卒業要件の充足状況】をプロンプトに入れる
    (§7.4、要件§5.5)。無ければ学年と課程だけを添える。
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    message: str
    history: list[ChatMessage] = []
    profile: StudentProfile | None = None
    program_code: str | None = None
    admission_year: int | None = None
    target_term: TargetTerm | None = None
