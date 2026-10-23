"""時間割のアシスタント。design.md §7.2。

`/proposal` の会話のすべてを1つのエージェントが受ける。質問には答え、時間割を作る・
変えるときは組み立て(`app/timetable/builder.py`)をツール(`build_timetable`)として呼ぶ。
**時間割の中身(どの科目をどのコマに入れるか)を決めるのは組み立てで、モデルは決めない。**
モデルは条件を書いて組み立てを呼び、返ったレポートだけを根拠に説明する。

プロンプト(`instructions`)は規則の後に、backend がリクエストごとに計算した事実を
節に分けて入れる(`render_instructions()`)。候補の科目の一覧は載せず、ツールで引かせる。
"""

import random
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field
from pydantic_ai import Agent, ModelRetry, RunContext

from app.agents import build_model
from app.agents.course_tools import register_course_tools
from app.schemas.proposal import ProposedCourse
from app.timetable.builder import build_timetable, check_timetable
from app.timetable.conditions import Conditions, Scope, Weekday, parse_period_rule
from app.timetable.context import StudentContext
from app.timetable.facts import (
    budget_lines,
    format_requirements,
    retake_lines,
    section,
    student_lines,
)
from app.timetable.report import Report, report_lines

INSTRUCTIONS = (
    "あなたは龍谷大学先端理工学部の履修登録を支援するAIアシスタントです。\n"
    "学生と対話しながら、【学生】の対象学期の時間割づくりを手伝ってください。\n"
    "\n"
    "回答は次の規則に従ってください。\n"
    "1. 時間割を作る・変えるときは build_timetable を呼ぶ。自分で科目を並べて時間割として示さない。\n"
    "2. 学生が時間割を求めたとき、または時間割の形についての希望(全休・避けたい時限・"
    "必修だけ・入れたい科目・外したい科目など)を述べたときに build_timetable を呼ぶ。"
    "使い方の質問・科目についての質問・雑談では呼ばない。\n"
    "3. 希望は build_timetable の引数に写す。曜日を言わない全休の希望は、聞き返さずに"
    "free_day_count で組み、返った結果の「代わりに全休にできる平日」を示して選び直せることを伝える。"
    "今の時間割を少し直すときは mode に adjust を、組み直すときは rebuild を使う。\n"
    "4. 時間割の説明は、build_timetable が返したレポートと【現在の時間割】に書かれた事実だけに基づく。"
    "満たせなかった条件は、満たせなかったと理由とともに書く。満たしていない希望を満たしたと書かない。\n"
    "5. 卒業要件・単位数は【卒業要件の充足状況】とレポートの値を用いる。自分で計算しない。"
    "単位数は整数で書き、「2.0単位」のように小数で書かない。\n"
    "6. 必修の科目(不合格・履修辞退の再履修を含む)は履修できる学期に履修するものであり、"
    "不足の確保や補填として書かない。再履修の科目は再履修であることを書く。\n"
    "7. 科目を勧めるときは search_courses で探し、その結果にある科目だけを勧める。"
    "興味・関心から探すときは topic を使う。時間割に入れるときは、その code を "
    "build_timetable の include に渡す。\n"
    "8. 講義の内容・評価方法・教科書などシラバスの事項は get_course が返した内容だけを根拠にする。"
    "シラバスの語をそのまま使い、より具体的な語や製品名に言い換えない。\n"
    "9. 時間割や説明の誤りを指摘されたら、まず【現在の時間割】とレポートで事実を確かめ、"
    "事実を答える。言葉の定義の説明から始めない。\n"
    "10. 推測を述べる場合は推測であることを明示し、情報が無い事項は無いと答える。"
)


@dataclass
class AssistantDeps:
    """1回の応答のあいだ、ツールが読み書きする状態。

    `timetable` と `conditions` は frontend から受け取った今の時間割と条件で、
    `build_timetable` が組み直すたびに置き換える。`outbox` はツールが SSE に流したい
    イベント(手順・時間割・条件)を積む。
    """

    student: StudentContext
    timetable: list[ProposedCourse]
    conditions: Conditions
    outbox: list[dict] = field(default_factory=list)
    rng: random.Random = field(default_factory=random.Random)
    last_report: Report | None = None


def _merge_conditions(
    current: Conditions,
    *,
    scope: Scope | None,
    free_days: list[Weekday] | None,
    free_day_count: int | None,
    avoid_periods: list[str] | None,
    max_days: int | None,
    max_periods_per_day: int | None,
    target_credits: int | None,
    include: list[str] | None,
    exclude: list[str] | None,
) -> Conditions:
    """ツールの引数を今の条件に重ねる。指定しなかった引数は今の条件のまま。"""
    update: dict = {}
    if scope is not None:
        update["scope"] = scope
    if free_days is not None:
        update["free_days"] = list(dict.fromkeys(free_days))
    if free_day_count is not None:
        update["free_day_count"] = free_day_count
    if avoid_periods is not None:
        try:
            update["avoid_periods"] = [parse_period_rule(text) for text in avoid_periods]
        except ValueError as exc:
            raise ModelRetry(str(exc)) from exc
    if max_days is not None:
        update["max_days"] = max_days or None
    if max_periods_per_day is not None:
        update["max_periods_per_day"] = max_periods_per_day
    if target_credits is not None:
        update["target_credits"] = target_credits or None
    if include is not None:
        update["include"] = list(dict.fromkeys(include))
    if exclude is not None:
        update["exclude"] = list(dict.fromkeys(exclude))
    return Conditions.model_validate({**current.model_dump(), **update})


def timetable_event(courses: list[ProposedCourse], report: Report) -> dict:
    """SSE の `timetable` イベント。frontend は時間割をこれで差し替える。"""
    return {
        "timetable": {
            "courses": [c.model_dump(by_alias=True) for c in courses],
            "totalCredits": sum(c.credits or 0 for c in courses),
            "report": report.model_dump(by_alias=True),
        }
    }


@lru_cache
def build_timetable_assistant() -> Agent[AssistantDeps, str]:
    """時間割のアシスタントを生成する。規則は `render_instructions()` が毎回渡す。"""
    agent: Agent[AssistantDeps, str] = Agent(build_model(), deps_type=AssistantDeps)

    @agent.tool(name="build_timetable")
    async def build_timetable_tool(
        ctx: RunContext[AssistantDeps],
        mode: Literal["rebuild", "adjust"] = "rebuild",
        scope: Scope | None = None,
        free_days: list[Weekday] | None = None,
        free_day_count: Annotated[int, Field(ge=0, le=5)] | None = None,
        avoid_periods: list[str] | None = None,
        max_days: Annotated[int, Field(ge=0, le=5)] | None = None,
        max_periods_per_day: Annotated[int, Field(ge=1, le=7)] | None = None,
        target_credits: Annotated[int, Field(ge=0)] | None = None,
        include: list[str] | None = None,
        exclude: list[str] | None = None,
    ) -> str:
        """条件から時間割を組み立てる。必修(再履修を含む)は必ず入る。指定しなかった引数は【現在の条件】のまま。

        Args:
            mode: rebuild は組み直す(学生が自分で入れた科目は残す)。adjust は今の時間割を
                起点に、条件に反する科目を外して空いた分を埋める。
            scope: 必修のみ(必修だけ) / 不足を埋める(既定。卒業要件の不足を埋める) /
                広く(不足を埋めた後も登録できる単位まで入れる)。
            free_days: 全休にする曜日。[] で全休の指定をやめる。
            free_day_count: 全休にしたい平日の数。曜日を言われずに「全休が欲しい」と言われたら 1。
                0 で全休の希望をやめる。
            avoid_periods: 避ける時限。「1限」(全曜日の1限)・「金5」(金曜5限)の形。[] でやめる。
            max_days: 授業のある平日の数の上限。0 で上限をやめる。
            max_periods_per_day: 選択科目を足して1日に入れるコマ数の上限(既定 4)。
                学生が「1日5コマでもいい」と言えば 5。
            target_credits: 単位数の上限。0 で上限をやめる。
            include: 入れたい科目のシラバスコード(search_courses の code)。[] でやめる。
            exclude: 入れたくない科目の科目名またはシラバスコード。[] でやめる。

        Returns:
            組み立てた時間割のレポート(曜日ごとの科目・授業の無い平日・条件ごとに満たしたか・
            要件枠の修得単位の増減・残る不足・確かめること)。説明はこれだけに基づく。
        """
        deps = ctx.deps
        conditions = _merge_conditions(
            deps.conditions,
            scope=scope,
            free_days=free_days,
            free_day_count=free_day_count,
            avoid_periods=avoid_periods,
            max_days=max_days,
            max_periods_per_day=max_periods_per_day,
            target_credits=target_credits,
            include=include,
            exclude=exclude,
        )
        result = build_timetable(
            deps.student, conditions, deps.timetable, mode=mode, rng=deps.rng
        )
        deps.timetable = result.courses
        deps.conditions = result.conditions
        deps.last_report = result.report
        deps.outbox.append({"build": {"mode": mode}})
        deps.outbox.extend({"step": step.model_dump(by_alias=True)} for step in result.steps)
        deps.outbox.append(timetable_event(result.courses, result.report))
        deps.outbox.append({"conditions": result.conditions.model_dump(by_alias=True)})
        lines = ["時間割を組み直した。", *report_lines(result.report)]
        described = result.conditions.describe()
        lines.append(f"今の条件: {'、'.join(described) if described else 'なし'}")
        return "\n".join(lines)

    register_course_tools(agent)
    return agent


def render_instructions(
    student: StudentContext, timetable: list[ProposedCourse], conditions: Conditions
) -> str:
    """規則と、リクエストごとに backend が計算した事実の節。"""
    if timetable:
        current = report_lines(check_timetable(student, timetable, conditions))
        sources = [
            f"- {c.title}: {c.reason or '理由なし'}"
            + ("(学生が自分で入れた)" if c.source == "student" else "")
            for c in timetable
        ]
        current = [*current, "科目ごとの入れた理由:", *sources]
    else:
        current = ["まだ時間割は無い"]
    described = conditions.describe()
    sections = [
        INSTRUCTIONS,
        section("学生", student_lines(student)),
        section("卒業要件の充足状況", format_requirements(student.requirements)),
        section("登録できる単位", budget_lines(student)),
        section("未修得の科目(再履修の対象)", retake_lines(student)),
        section("現在の時間割", current),
        section("現在の条件", described if described else ["なし"]),
    ]
    return "\n\n".join(sections)
