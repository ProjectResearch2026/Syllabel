"""シラバスチャットのSSEエンドポイント。design.md §6.1 / §7.4 / §7.5。

ツールは `search_courses` / `get_course`(`app/agents/course_tools.py`)で、時間割の
アシスタントと同じものを使う。課程コード・入学年度・対象学期が送られれば学生の文脈
(`StudentContext`)を作り、ツールの結果にその学生にとっての区分・入る要件枠・履修
できるか・修得済みかを付け、【卒業要件の充足状況】をプロンプトに入れる。文脈が作れ
なければ(履修要項が無い・api-clean に届かない)、学年と課程だけを添えて答える。

SSE は本文(`delta`)のほかに、思考(`thinking`)とツールの進み具合(`activity`)を流す
(`app/api/agent_stream.py`)。
"""

import json

import httpx
from fastapi import APIRouter, HTTPException

from app.agents.chat_agent import ChatDeps, build_chat_agent
from app.agents.course_tools import annotate, course_header, format_sections
from app.agents.tools import get_syllabus
from app.api.agent_stream import stream_agent, to_history
from app.api.sse import sse_response
from app.schemas.chat import ChatRequest
from app.timetable.context import StudentContext, build_student_context
from app.timetable.facts import format_requirements, retake_lines, section, student_lines

# 実機検証(2026-09-04, issue #62)で、骨格は原典どおりでも装飾部分に捏造が出た。
# 「文書作成ソフト」→「Word」のような一般語の具体化、原典にない概念(プライバシー保護)の
# 追加、開講週数の推定、1クラスの内容の全クラスへの一般化が実際に起きたため、
# 観測された誤りの型を名指しで禁じる。design.md §7.4.1。
_SYLLABUS_PROMPT = (
    "あなたは龍谷大学の履修登録を支援するAIアシスタントです。\n"
    "学生のシラバスに関する質問に日本語で答えてください。考える過程(思考)も日本語で書いてください。\n"
    "科目を探すときは search_courses、講義の内容を読むときは get_course を使ってください。\n"
    "\n"
    "回答は次の規則に従ってください。\n"
    "1. ツールが返した内容だけを根拠にする。シラバスに書かれていない事項を補わない。\n"
    "2. シラバスの語をそのまま使う。より具体的な語や製品名への言い換えをしない"
    "(例:「文書作成ソフト」を「Word」、「ネットワークストレージ」を「クラウド」と書き換えない)。\n"
    "3. シラバスにない形容や評価を付け加えない(例:「実践的な」)。\n"
    "4. 週数・回数・期間などの数値は、シラバスに書かれている場合だけ示す。自分で計算・推定しない。\n"
    "5. 区分・履修区分(必修・選択必修・選択)と、単位が入る要件枠は、ツールが返した type・"
    "fillsSlot と【卒業要件の充足状況】の値で答える。ツールがそれを返さないときは、"
    "履修要項で確認するよう案内する。\n"
    "6. 同じ科目名で複数のクラスが開講されている場合は、どのクラスの情報かを"
    "講義コード・担当教員・サブタイトルで明示し、他のクラスにも当てはまるかのように書かない。\n"
    "7. 興味・関心から科目を探すときは search_courses の topic を使い、"
    "勧める理由には matchedIn(講義概要など、どこに書かれていたか)を添える。\n"
    "8. 推測を述べる場合は、推測であることを明示する。\n"
    "9. シラバスに情報が無い事項は、無いと答える。\n"
    "10. 単位数は整数で書き、「2.0単位」のように小数で書かない。"
)


async def _student_context(req: ChatRequest) -> StudentContext | None:
    """課程コード・入学年度・対象学期があれば学生の文脈を作る。作れなければ None。"""
    if (
        req.profile is None
        or req.program_code is None
        or req.admission_year is None
        or req.target_term is None
    ):
        return None
    try:
        return await build_student_context(
            req.profile, req.program_code, req.admission_year, req.target_term
        )
    except (ValueError, httpx.HTTPError):  # 文脈が作れなくてもチャットは続ける
        return None


def _facts(req: ChatRequest, student: StudentContext | None) -> list[str]:
    """学生についての節。文脈があれば要件の充足状況まで、無ければ学年と課程だけ。"""
    if student is not None:
        return [
            section("学生", student_lines(student)),
            section(
                "卒業要件の充足状況",
                format_requirements(student.requirements, student.assumed_passes()),
            ),
            section("再履修する必修", retake_lines(student)),
        ]
    profile = req.profile
    facts: list[str] = []
    if profile is not None and profile.grade is not None:
        facts.append(f"学年: {profile.grade}回生")
    if profile is not None and profile.program:
        facts.append(f"課程: {profile.program}")
    return [section("学生", facts)] if facts else []


def _instructions(req: ChatRequest, student: StudentContext | None, extra: str = "") -> str:
    parts = [_SYLLABUS_PROMPT, *_facts(req, student)]
    if extra:
        parts.append(extra)
    return "\n\n".join(parts)


def _stream(req: ChatRequest, student: StudentContext | None, instructions: str):
    return sse_response(
        stream_agent(
            build_chat_agent(),
            req.message,
            history=to_history(req.history),
            instructions=instructions,
            deps=ChatDeps(student=student),
        )
    )


router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat/syllabus")
async def chat_syllabus(req: ChatRequest):
    """シラバス全体に対するチャット。design.md §7.4。"""
    student = await _student_context(req)
    return _stream(req, student, _instructions(req, student))


@router.post("/chat/syllabus/{code}")
async def chat_syllabus_by_code(code: str, req: ChatRequest):
    """特定講義に絞ったチャット。design.md §7.5。

    講義の詳細を最初に引き、`get_course` と同じ形(全節。成績評価は項目と割合の行)に
    整えて【対象講義】として渡す。api-clean の JSON をそのまま渡すと、内部の id や
    JSON 文字列のままの成績評価でトークンを使い、読み違いのもとになる。
    """
    try:
        detail = await get_syllabus(code)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404)
        raise HTTPException(status_code=502, detail="upstream error")
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="upstream error")

    student = await _student_context(req)
    course = course_header(detail)
    course.update(annotate(student, code, str(detail.get("course_title") or "")))
    course["sections"] = format_sections(
        detail,
        [
            "概要",
            "到達目標",
            "講義方法",
            "授業計画",
            "成績評価",
            "教科書",
            "参考文献",
            "授業外学修",
            "アドバイス",
            "担当教員",
            "備考",
        ],
    )
    target = section("対象講義", [json.dumps(course, ensure_ascii=False, indent=1)])
    return _stream(req, student, _instructions(req, student, target))
