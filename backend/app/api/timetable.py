"""時間割の組み立て・確認・アシスタント。design.md §6.1 / §7.2。

| パス | 形式 | 用途 |
|---|---|---|
| `POST /api/timetable/build` | JSON | 条件から時間割を組み立てる。モデルを呼ばない |
| `POST /api/timetable/check` | JSON | 与えた時間割のレポート(学生が手で直した後の事実) |
| `POST /api/timetable/assistant` | SSE | 時間割の画面の会話のすべて |

3本とも同じ「時間割の文脈」(学生プロファイル・課程コード・入学年度・対象学期・今の
時間割・今の条件)を受ける。**サーバは状態を持たない**(要件§5.2)。時間割・条件・対話は
frontend が持ち、毎回送る。

前提の不足と上流の失敗は、ストリームを開く前に状態コードで返す: 履修要項が無い(404)・
学年が無いなど(400)・api-clean に届かない(502)。

**学生データを永続化・ログ記録しない(§4.2.3)。**
"""

import random
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

from app.agents.timetable_assistant import (
    AssistantDeps,
    build_timetable_assistant,
    render_instructions,
)
from app.api.agent_stream import stream_agent, to_history
from app.api.sse import sse_response
from app.schemas.chat import ChatMessage
from app.schemas.proposal import ProposedCourse, TargetTerm
from app.schemas.student import StudentProfile
from app.timetable.builder import build_timetable, check_timetable
from app.timetable.conditions import Conditions
from app.timetable.context import StudentContext, build_student_context
from app.timetable.errors import ContextError, CurriculumNotFound
from app.timetable.report import summarize_report


class _CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class TimetableContextRequest(_CamelModel):
    """時間割の文脈(§6.1)。

    課程コードと入学年度を `studentProfile` とは別に受ける。履修要項を引くキーは
    (課程コード, 入学年度)(§4.4.2)だが、`StudentProfile.program` に入るのは課程名である。
    `timetable` はコマが重なっていてもよい(学生は重なる科目を承知で入れられる。§8.3.6)。
    """

    student_profile: StudentProfile
    program_code: str
    admission_year: int
    target_term: TargetTerm
    timetable: list[ProposedCourse] = []
    conditions: Conditions = Conditions()


class BuildRequest(TimetableContextRequest):
    mode: Literal["rebuild", "adjust", "remove"] = "rebuild"


class AssistantRequest(TimetableContextRequest):
    """`messages` の末尾(role: user)が今回の発話、それより前が履歴(§6.1)。"""

    messages: list[ChatMessage] = Field(min_length=1)

    @model_validator(mode="after")
    def check_last_message_is_user(self) -> "AssistantRequest":
        if self.messages[-1].role != "user":
            raise ValueError("messages の末尾は学生の発話(role: user)である必要があります")
        return self


async def _context(req: TimetableContextRequest) -> StudentContext:
    try:
        return await build_student_context(
            req.student_profile, req.program_code, req.admission_year, req.target_term
        )
    except CurriculumNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ContextError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="upstream error") from exc


router = APIRouter(prefix="/api/timetable", tags=["timetable"])


@router.post("/build")
async def post_build(req: BuildRequest) -> dict:
    """条件から時間割を組み立てる(§7.2)。モデルを呼ばないので数秒で返る。

    `message` はレポートから作った決まった説明(「希望条件なしで提案する」の吹き出し)。
    """
    student = await _context(req)
    result = build_timetable(
        student, req.conditions, req.timetable, mode=req.mode, rng=random.Random()
    )
    return {
        "timetable": [c.model_dump(by_alias=True) for c in result.courses],
        "totalCredits": result.total_credits,
        "report": result.report.model_dump(by_alias=True),
        "conditions": result.conditions.model_dump(by_alias=True),
        "steps": [step.model_dump(by_alias=True) for step in result.steps],
        "message": summarize_report(result.report, len(result.courses)),
    }


@router.post("/check")
async def post_check(req: TimetableContextRequest) -> dict:
    """与えた時間割のレポート(§7.2)。学生が手で直した後の事実の更新に使う。"""
    student = await _context(req)
    report = check_timetable(student, req.timetable, req.conditions)
    return {"report": report.model_dump(by_alias=True)}


@router.post("/assistant")
async def post_assistant(req: AssistantRequest):
    """時間割の画面の会話(§7.2)。SSE で本文・思考・ツールの進み具合・時間割を流す。"""
    student = await _context(req)
    deps = AssistantDeps(
        student=student,
        timetable=list(req.timetable),
        conditions=req.conditions,
    )
    instructions = render_instructions(student, deps.timetable, deps.conditions)
    return sse_response(
        stream_agent(
            build_timetable_assistant(),
            req.messages[-1].content,
            history=to_history(req.messages[:-1]),
            instructions=instructions,
            deps=deps,
            outbox=deps.outbox,
        )
    )
