"""時間割のアシスタント。design.md §7.2。

`/proposal` の会話のすべてを1つのエージェントが受ける。質問には答え、時間割を作る・
変えるときは組み立て(`app/timetable/builder.py`)をツール(`build_timetable`)として呼ぶ。
**時間割の中身(どの科目をどのコマに入れるか)を決めるのは組み立てで、モデルは決めない。**
モデルは条件を書いて組み立てを呼び、返ったレポートだけを根拠に説明する。

プロンプト(`instructions`)は規則の後に、backend がリクエストごとに計算した事実を
節に分けて入れる(`assistant_instructions()`)。時間割と条件の節はモデルを呼ぶたびに
作り直す。候補の科目の一覧は載せず、ツールで引かせる。
"""

import random
from collections.abc import Sequence
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field
from pydantic_ai import Agent, ModelRetry, RunContext

from app.agents import build_model, chat_model_settings
from app.agents.course_tools import register_course_tools
from app.curricula.requirements import normalize_title
from app.schemas.proposal import ProposedCourse
from app.timetable.builder import BuildResult, build_timetable, check_timetable
from app.timetable.candidates import display_title, key_of
from app.timetable.conditions import Conditions, Scope, Weekday, parse_period_rule
from app.timetable.context import StudentContext, slots_label
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
    "学生と対話しながら、【学生】の対象学期の時間割づくりを手伝ってください。日本語だけで答えてください。考える過程(思考)も日本語で書いてください。\n"
    "\n"
    "回答は次の規則に従ってください。\n"
    "1. 時間割を作る・変えるときは build_timetable を呼ぶ。自分で科目を並べて時間割として示さない。\n"
    "2. 学生が時間割を求めたとき、または時間割の形についての希望(全休・避けたい時限・"
    "必修だけ・入れたい科目・外したい科目など)を述べたときに build_timetable を呼ぶ。"
    "使い方の質問・科目についての質問・雑談では呼ばない。\n"
    "3. 希望は build_timetable の引数に写す。曜日を言わない全休の希望は、聞き返さずに "
    "free_day_count で組み、返った結果の「代わりに全休にできる平日」を示して選び直せることを伝える。"
    "今の時間割を少し直すとき(科目を入れる・外して代わりを入れるときを含む)は mode に adjust を、"
    "組み直すときは rebuild を使う。"
    "科目を外してとだけ言われ、代わりを求められていないときは mode に remove を使い、代わりの科目を入れない。"
    "入れたい科目は include に渡すだけでよい。コマが重なる科目や単位の上限を超える分は、"
    "組み立てが外してよい科目から残る不足が増えにくいものを選んで外し、外した科目を結果に書く。"
    "exclude は学生が外す科目を指定したときに使う。"
    "学生の話から時間割に要らない科目があると分かったときは、build_timetable を呼ぶ前に、"
    "外せる科目(【現在の時間割】にある科目)の科目名と単位数、その理由を示して外すか尋ねる。"
    "学生が外すと答えたら、その科目を exclude に渡して remove で外す。"
    "学生が、成績表にまだ載っていない科目(今履修していて成績が後で出る科目など)に合格する前提で"
    "組みたいと言ったときは、その科目名を assume_passed に渡して組み直す。"
    "成績発表待ちの科目は渡さなくても合格する前提で数える。\n"
    "4. 時間割の説明は、build_timetable が返したレポートと【現在の時間割】に書かれた事実だけに基づく。"
    "学生が会話で述べた事実は、レポートの値を変えずに、学生から聞いたこととして添えてよい。"
    "満たせなかった条件は、満たせなかったと理由とともに書く。満たしていない希望を満たしたと書かない。"
    "確かめることがあれば、学生が何を確かめればよいかを必ず書く(画面には出ないため)。"
    "時間割は画面の表に出るので、曜日ごとの科目を表や一覧で書き直さない。"
    "変わったこと・満たせなかった条件・残る不足・選び直せることを短く書く。"
    "残る不足はレポートに載っているものだけを書き、必修の不足や対象学期に取れる科目の無いことは"
    "学生に聞かれない限り書かない(後の学期に取るのが当たり前のため)。\n"
    "5. 卒業要件・単位数は【卒業要件の充足状況】とレポートの値を用いる。自分で計算しない。"
    "単位数は整数で書き、「2.0単位」のように小数で書かない。"
    "科目を外すと不足が増えるかは、「外してよい科目を1つだけ外したときに増える不足」で判断する。"
    "「科目ごとの入れたときの理由」は入れた時点の理由で、今その要件枠を満たしているとは限らない。\n"
    "6. 必修の科目(不合格・履修辞退の再履修を含む)は履修できる学期に履修するものであり、"
    "不足の確保や補填として書かない。再履修の科目は再履修であることを書く。"
    "必修でない科目は、不合格・履修辞退だったものでも、自分から勧めたり再履修するか尋ねたりしない。"
    "学生が履修したいと言ったときだけ search_courses で探して include に入れる。\n"
    "7. 科目を勧めるときは search_courses で探し、その結果にある科目だけを勧める。"
    "興味・関心から探すときは topic を使う。時間割に入れるときは、その code を "
    "build_timetable の include に渡す。前の発話で出た科目のコードは【会話で出た科目】にある。"
    "そこにも無いコードを記憶で書かず、search_courses で探し直す。\n"
    "8. 講義の内容・評価方法・教科書などシラバスの事項は get_course が返した内容だけを根拠にする。"
    "シラバスの語をそのまま使い、より具体的な語や製品名に言い換えない。\n"
    "9. 時間割や説明の誤りを指摘されたら、まず【現在の時間割】とレポートで事実を確かめ、"
    "事実を答える。言葉の定義の説明から始めない。\n"
    "10. 推測を述べる場合は推測であることを明示し、情報が無い事項は無いと答える。\n"
    "11. ツールの名前や引数の名前(build_timetable・search_courses・include・remove など)は"
    "回答に書かない。ツールの働きに触れるときは「時間割を組み直す機能」のように、"
    "学生に分かる言葉で書く。"
)


@dataclass
class AssistantDeps:
    """1回の応答のあいだ、ツールが読み書きする状態。

    `timetable` と `conditions` は frontend から受け取った今の時間割と条件で、
    `build_timetable` が組み直すたびに置き換える。`outbox` はツールが SSE に流したい
    イベント(手順・時間割・条件)を積む。`activity_results` は呼び出しの id → その呼び出しの
    ツールの行に添える結果(`build_outcome()`)。

    `student` は条件の合格する前提の科目(`assume_passed`)に合格したとみなした文脈で、
    検索のツールとプロンプトの事実が読む。`base` はリクエストのままの文脈で、組み立ては
    こちらから条件に合わせて作り直す(`StudentContext.assuming()`)。
    """

    student: StudentContext
    timetable: list[ProposedCourse]
    conditions: Conditions
    base: StudentContext | None = None
    outbox: list[dict] = field(default_factory=list)
    rng: random.Random = field(default_factory=random.Random)
    last_report: Report | None = None
    activity_results: dict[str, dict] = field(default_factory=dict)
    # 会話のツールの行に出たシラバスコード(古い順)。【会話で出た科目】に載せる
    mentioned: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        if self.base is None:
            self.base = self.student
        self.student = self.base.assuming(self.conditions.assume_passed)


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
    assume_passed: list[str] | None = None,
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
    if assume_passed is not None:
        update["assume_passed"] = list(dict.fromkeys(assume_passed))
    return Conditions.model_validate({**current.model_dump(), **update})


def resolve_assumed(student: StudentContext, values: list[str]) -> list[str]:
    """合格する前提にする科目を履修要項の科目名にそろえる。引けない値はモデルに書き直させる。

    単位と要件枠は履修要項から採るので、履修要項に無い科目は数えられない。
    """
    titles: list[str] = []
    for value in values:
        course = student.resolve_assumed(value)
        if course is None:
            raise ModelRetry(
                f"assume_passed の「{value}」は履修要項に無い科目です。科目名を確かめてください"
            )
        titles.append(course.title)
    return titles


def _matches(course: ProposedCourse, wanted: str) -> bool:
    return course.syllabus_code == wanted or normalize_title(course.title) == normalize_title(wanted)


@dataclass(frozen=True)
class Changes:
    """組み立ての前後で時間割がどう変わったか(科目名)。"""

    removed: list[str]
    added: list[str]
    # 同じ科目を別のコマのクラスに替えた(科目名 → 「木4→水4」)
    moved: dict[str, str]


def _slots_text(course: ProposedCourse) -> str:
    return "・".join(f"{s.day}{s.period}" for s in course.occupied_slots()) or "曜日・時限未定"


def timetable_changes(before: list[ProposedCourse], after: list[ProposedCourse]) -> Changes:
    """この組み立てで外した科目・入れた科目・コマを移した科目。

    モデルにも学生にも、組み立てが何をしたかを見せる。前後の時間割を見比べさせると、
    モデルは自分の呼び出しで外した科目を「もともと外されていた」と読み違えた(実機)。
    手順(`steps`)ではなく前後の時間割から出す。組み直し(`rebuild`)は残す科目も手順に積む。
    """
    old = {key_of(c): c for c in before}
    new = {key_of(c): c for c in after}
    moved = {
        display_title(c): f"{_slots_text(old[key])}→{_slots_text(c)}"
        for key, c in new.items()
        if key in old and _slots_text(old[key]) != _slots_text(c)
    }
    return Changes(
        removed=[display_title(c) for key, c in old.items() if key not in new],
        added=[display_title(c) for key, c in new.items() if key not in old],
        moved=moved,
    )


def build_outcome(
    result: BuildResult, failed: dict[str, str], *, mode: str, changes: Changes
) -> dict:
    """組み立てのツールの行に添える結果。行を開いたときに、頼んだ条件ではなく組み立てが
    何をしたかを見せるためのもの。

    - `mode` — 実際に使った組み立ての起点
    - `removed` / `added` / `moved` — この組み立てで外した科目・入れた科目・コマを移した科目
      (`timetable_changes()`)。入れたい科目のために外した科目は `displaced` に理由つきで出すので除く
    - `freeDays` — 組み立てで全休にした曜日(指定された曜日と、日数だけ頼まれて選んだ曜日。
      手順4)
    - `failed` — 頼まれた入れる・外すのうちできなかったもの(`build_failures()`)
    - `displaced` — 入れたい科目のために外した科目(科目名 → 理由。手順3)
    """
    outcome: dict = {
        "mode": mode,
        "removed": [title for title in changes.removed if title not in result.displaced],
        "added": changes.added,
        "moved": changes.moved,
    }
    if result.conditions.free_days:
        outcome["freeDays"] = list(result.conditions.free_days)
    if failed:
        outcome["failed"] = failed
    if result.displaced:
        outcome["displaced"] = dict(result.displaced)
    return outcome


def build_failures(
    before: list[ProposedCourse],
    after: list[ProposedCourse],
    *,
    mode: str,
    include: list[str],
    exclude: list[str],
    include_failures: dict[str, str],
    include_placed: dict[str, str] | None = None,
    previous_exclude: list[str] | None = None,
) -> dict[str, str]:
    """この呼び出しで頼まれた入れる・外すのうち、できなかったもの(引数の値 → 理由)。

    外す科目が今の時間割に無かったときも、外せなかったものとして返す(組み直す `rebuild` は
    今の時間割を起点にしないので除く)。モデルが時間割に無い科目を外すと言い出したとき、
    学生にもモデルにもそれが分かるようにする。ただし前から入れない科目だったもの
    (`previous_exclude`)は除く。`exclude` は渡すたびに一覧ごと置き換わるので、モデルは
    前に外した科目も並べ直す。それを「外せませんでした」と出すと、もう外れている科目を
    外せなかったように読める(実機)。入れたい科目を指定と別のクラスで置いたとき
    (`include_placed`)は、そのクラスがあれば入れられたとみなす。
    """
    previous = {normalize_title(v) for v in previous_exclude or []}
    placed = include_placed or {}
    failed: dict[str, str] = {}
    for wanted in include:
        found = wanted, placed.get(wanted, wanted)
        if not any(_matches(c, w) for c in after for w in found):
            failed[wanted] = include_failures.get(wanted, "時間割に入っていない")
    for wanted in exclude:
        if any(_matches(c, wanted) for c in after):
            failed[wanted] = "必修は外せない"
        elif (
            mode != "rebuild"
            and normalize_title(wanted) not in previous
            and not any(_matches(c, wanted) for c in before)
        ):
            failed[wanted] = "時間割に無い"
    return failed


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
    """時間割のアシスタントを生成する。規則は `assistant_instructions()` が毎回渡す。"""
    agent: Agent[AssistantDeps, str] = Agent(
        build_model(), model_settings=chat_model_settings(), deps_type=AssistantDeps
    )

    @agent.tool(name="build_timetable")
    async def build_timetable_tool(
        ctx: RunContext[AssistantDeps],
        mode: Literal["rebuild", "adjust", "remove"],
        scope: Scope | None = None,
        free_days: list[Weekday] | None = None,
        free_day_count: Annotated[int, Field(ge=0, le=5)] | None = None,
        avoid_periods: list[str] | None = None,
        max_days: Annotated[int, Field(ge=0, le=5)] | None = None,
        max_periods_per_day: Annotated[int, Field(ge=1, le=7)] | None = None,
        target_credits: Annotated[int, Field(ge=0)] | None = None,
        include: list[str] | None = None,
        exclude: list[str] | None = None,
        assume_passed: list[str] | None = None,
    ) -> str:
        """条件から時間割を組み立てる。必修(再履修を含む)は必ず入る。指定しなかった引数は【現在の条件】のまま。

        Args:
            mode: 必ず書く。rebuild は組み直す(学生が自分で入れた科目は残す)。adjust は今の
                時間割を起点に、条件に反する科目を外して空いた分を埋める。remove は今の時間割から
                条件に反する科目を外すだけで、空いた分を埋めない。
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
            include: 入れたい科目のシラバスコード(search_courses の code)。渡すと一覧ごと
                置き換わるので、【現在の条件】の入れたい科目も入れておくなら並べる。[] でやめる。
            exclude: 入れたくない科目の科目名またはシラバスコード。渡すと一覧ごと置き換わる。
                [] でやめる。
            assume_passed: 合格する前提で数える科目の科目名。成績表にまだ載っていない科目
                (今履修していて成績が後で出る科目など)に合格する前提で組みたいと言われたときに
                渡す。卒業要件の不足をその単位を足して数え、組み直す。渡すと一覧ごと置き換わる。
                [] でやめる。成績発表待ちの科目は渡さなくても合格する前提で数える。

        Returns:
            この組み立てで外した科目・入れた科目と、組み立てた時間割のレポート(曜日ごとの科目・
            授業の無い平日・条件ごとに満たしたか・要件枠の修得単位の増減・残る不足・確かめること)。
            説明はこれだけに基づく。
        """
        deps = ctx.deps
        base = deps.base or deps.student
        if assume_passed is not None:
            assume_passed = resolve_assumed(base, assume_passed)
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
            assume_passed=assume_passed,
        )
        result = build_timetable(base, conditions, deps.timetable, mode=mode, rng=deps.rng)
        failed = build_failures(
            deps.timetable,
            result.courses,
            mode=mode,
            include=include or [],
            exclude=exclude or [],
            include_failures=result.include_failures,
            include_placed=result.include_placed,
            previous_exclude=deps.conditions.exclude,
        )
        changes = timetable_changes(deps.timetable, result.courses)
        deps.activity_results[ctx.tool_call_id] = build_outcome(
            result, failed, mode=mode, changes=changes
        )
        deps.timetable = result.courses
        deps.conditions = result.conditions
        deps.student = base.assuming(result.conditions.assume_passed)
        deps.last_report = result.report
        deps.outbox.append({"build": {"mode": mode}})
        deps.outbox.extend({"step": step.model_dump(by_alias=True)} for step in result.steps)
        deps.outbox.append(timetable_event(result.courses, result.report))
        deps.outbox.append({"conditions": result.conditions.model_dump(by_alias=True)})
        lines = [
            f"時間割を組んだ(mode: {mode})。",
            f"この組み立てで外した科目: {'、'.join(changes.removed) or 'なし'}",
            f"この組み立てで入れた科目: {'、'.join(changes.added) or 'なし'}",
        ]
        if changes.moved:
            lines.append(
                "この組み立てでコマを移した科目: "
                + "、".join(f"{title}({where})" for title, where in changes.moved.items())
            )
        lines += report_lines(result.report)
        if result.displaced:
            lines.append(
                "入れたい科目のために外した科目: "
                + "、".join(f"{title}({why})" for title, why in result.displaced.items())
            )
        missing = [wanted for wanted in exclude or [] if failed.get(wanted) == "時間割に無い"]
        if missing:
            titles = "、".join(deps.student.title_of(wanted) for wanted in missing)
            lines.append(f"外す科目のうち、今の時間割に無かった科目(外していない): {titles}")
        described = result.conditions.describe(deps.student.title_of)
        lines.append(f"今の条件: {'、'.join(described) if described else 'なし'}")
        return "\n".join(lines)

    register_course_tools(agent)
    return agent


# 【会話で出た科目】に載せる科目の数の上限(新しいものから)
MAX_MENTIONED = 30


def static_sections(student: StudentContext) -> str:
    """規則と、応答のあいだ変わらない事実の節(学生・登録できる単位・再履修)。

    卒業要件の充足状況は条件の合格する前提の科目(`assume_passed`)で変わるので、
    `current_sections()` に置く。
    """
    return "\n\n".join(
        [
            INSTRUCTIONS,
            section("学生", student_lines(student)),
            section("登録できる単位", budget_lines(student)),
            section("再履修する必修", retake_lines(student)),
        ]
    )


def mentioned_lines(student: StudentContext, codes: Sequence[str]) -> list[str]:
    """【会話で出た科目】の中身。シラバスコードごとに科目名・曜日時限・単位。

    対話履歴は本文だけで、前の発話で検索した科目のコードは残らない。実機で、モデルが
    前の発話で勧めた科目のコードを覚えたつもりで書き、修得済みの別の科目のコードを
    入れたい科目に渡した。frontend が会話のツールの行から集めたコードを送り、科目名などは
    backend が開講情報から引き直す(frontend の値を信じない)。開講情報に無いコードは載せない。
    """
    lines = []
    for code in list(dict.fromkeys(reversed(codes)))[:MAX_MENTIONED]:
        offered = student.catalog.classes.get(code)
        if offered is None:
            continue
        subtitle = f"({offered.subtitle})" if offered.subtitle else ""
        credits = f"・{offered.credits}単位" if offered.credits is not None else ""
        lines.append(
            f"- {code}: {offered.course_title}{subtitle} "
            f"{slots_label(list(offered.slots), offered.term)}{credits}"
        )
    return lines


def current_sections(
    student: StudentContext,
    timetable: list[ProposedCourse],
    conditions: Conditions,
    mentioned: Sequence[str] = (),
) -> str:
    """卒業要件の充足状況・時間割・条件・会話で出た科目の節。組み立てるたびに変わる。

    `student` は条件の合格する前提の科目に合格したとみなした文脈(`AssistantDeps.student`)。
    """
    if timetable:
        current = report_lines(check_timetable(student, timetable, conditions))
        sources = [
            f"- {display_title(c)}: {c.reason or '理由なし'}"
            + ("(学生が自分で入れた)" if c.source == "student" else "")
            for c in timetable
        ]
        current = [
            *current,
            "科目ごとの入れたときの理由(今その要件枠を満たしているとは限らない):",
            *sources,
        ]
    else:
        current = ["まだ時間割は無い"]
    described = conditions.describe(student.title_of)
    sections = [
        section(
            "卒業要件の充足状況",
            format_requirements(student.requirements, student.assumed_passes()),
        ),
        section("現在の時間割", current),
        section("現在の条件", described if described else ["なし"]),
    ]
    listed = mentioned_lines(student, mentioned)
    if listed:
        sections.append(section("会話で出た科目", listed))
    return "\n\n".join(sections)


def assistant_instructions(student: StudentContext):
    """エージェントに渡す instructions。**時間割と条件の節は、モデルを呼ぶたびに作り直す。**

    1回の応答のうちに build_timetable が時間割を変えても、先頭で作った【現在の時間割】の
    ままだと、モデルは組み立て前の時間割と組み立て後のレポートという食い違う事実を見る
    (実機で、組み立て前の「入れた理由」を読んで誤って答えた)。関数で渡すと、PydanticAI が
    モデルを呼ぶたびに評価し直す。

    **全体を1つの関数で返す(system メッセージを1本にする)。** 変わらない部分と作り直す
    部分を別々に渡すと、PydanticAI はそれぞれを別の system メッセージとして送る。Qwen の
    チャットテンプレートは先頭以外の system メッセージを受け付けず、応答が即座に失敗した。
    """
    fixed = static_sections(student)

    def instructions(ctx: RunContext[AssistantDeps]) -> str:
        deps = ctx.deps
        current = current_sections(deps.student, deps.timetable, deps.conditions, deps.mentioned)
        return f"{fixed}\n\n{current}"

    return instructions
