"""時間割についての事実(レポート)と、組み立ての手順の記録。design.md §7.2。

アシスタントの説明はレポートだけを根拠にする(空いた曜日・満たせなかった条件・
要件枠の増減を、モデルに数えさせない)。組み立て(`/api/timetable/build`)と確認
(`/api/timetable/check`)が返し、画面にもそのまま出せる形にする。
"""

from collections.abc import Callable, Sequence
from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.curricula.requirements import normalize_title
from app.schemas.proposal import ProposedCourse, quarters_of
from app.timetable.conditions import DEFAULT_MAX_PERIODS_PER_DAY, Conditions
from app.timetable.context import StudentContext
from app.timetable.offerings import DAYS, WEEKDAYS


class _CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ConditionStatus(_CamelModel):
    """条件1つを満たしたか。`detail` は学生にそのまま見せられる1文。"""

    condition: str
    status: Literal["met", "unmet"]
    detail: str


class SlotChange(_CamelModel):
    """要件枠1つの、時間割を修得する前後の修得単位。"""

    slot: str
    before: int
    after: int
    required: int


class RemainingShortfall(_CamelModel):
    """時間割を修得してもなお残る不足。`reason` は組み立てが分かるときだけ入る。"""

    slot: str
    shortfall: int
    reason: str | None = None


class CreditsInfo(_CamelModel):
    """時間割の単位の合計と、対象学期に登録できる単位。"""

    total: int
    limit: int | None
    cap: int | None
    registered: int


class Report(_CamelModel):
    """時間割についての事実(§7.2)。値はすべて backend が計算する。

    - `days` — 曜日ごとの科目(「科目名(2限)」)。土曜は科目があるときだけ
    - `free_days` — 授業の無い平日
    - `other_free_day_options` — 今の全休の代わりに空けられる平日(必修と学生が
      入れた科目の無い平日)
    - `unscheduled` — 曜日・時限の無い科目(集中講義など)
    - `conditions` — 条件ごとに満たしたか
    - `requirements` — 不足のあった要件枠の、時間割を修得する前後の修得単位
    - `remaining_shortfall` — 時間割を修得してもなお残る不足
    - `retakes` — 時間割に入っている再履修の科目
    - `needs_confirmation` — 学生が確かめるべきこと
    """

    days: dict[str, list[str]]
    free_days: list[str]
    other_free_day_options: list[str] = []
    unscheduled: list[str] = []
    conditions: list[ConditionStatus] = []
    requirements: list[SlotChange] = []
    remaining_shortfall: list[RemainingShortfall] = []
    credits: CreditsInfo
    retakes: list[str] = []
    needs_confirmation: list[str] = []


StepKind = Literal["keep", "remove", "required", "include", "free_day", "fill", "unmet"]


class Step(_CamelModel):
    """組み立ての1手(§7.2)。frontend はこれを順に描いて、組み上がる様子を見せる。

    | kind | いつ |
    |---|---|
    | keep | 学生が入れた科目などを残した |
    | remove | 今の時間割から科目を外した(条件に反する・入れない科目) |
    | required | 必修を置いた(`note` は「必修」または「再履修」) |
    | include | 学生が入れたいと言った科目を置いた |
    | free_day | 全休の曜日を決めた(`day`、ほかに空けられた曜日は `others`) |
    | fill | 不足を埋める科目を置いた(`slot` は単位が入る要件枠、`shortfall_after` はその枠に残る不足) |
    | unmet | 条件を満たせなかった(`condition` と `detail`) |
    """

    kind: StepKind
    course: ProposedCourse | None = None
    day: str | None = None
    others: list[str] = []
    slot: str | None = None
    shortfall_after: int | None = None
    note: str | None = None
    condition: str | None = None
    detail: str | None = None


# --- 時間割の形 ---


def course_days(course: ProposedCourse) -> list[str]:
    """科目が授業を持つ曜日(重複なし・原文の順)。"""
    return list(dict.fromkeys(slot.day for slot in course.occupied_slots()))


def day_periods(courses: Sequence[ProposedCourse]) -> dict[str, set[int]]:
    """曜日ごとに授業のある時限。学期(クォーター)は問わない。"""
    periods: dict[str, set[int]] = {day: set() for day in DAYS}
    for course in courses:
        for slot in course.occupied_slots():
            periods[slot.day].add(slot.period)
    return periods


def _periods_label(periods: Sequence[int]) -> str:
    return "・".join(str(p) for p in sorted(set(periods))) + "限"


# クォーターが前期・後期のどちらの半分か。「2Q」だけを渡すと、モデルが後期と読み違えた
# (2Q は前期の後半)。プロンプトに載る形なので、読み違えようのない言葉を添える
_QUARTER_LABEL = {1: "1Q・前期の前半", 2: "2Q・前期の後半", 3: "3Q・後期の前半", 4: "4Q・後期の後半"}


def _quarter_mark(course: ProposedCourse) -> str:
    """学期いっぱいでない科目(1Q〜4Q)の印。「2Q・前期の後半」の形。"""
    terms = {slot.term for slot in course.occupied_slots()} or {course.term}
    quarters = set()
    for term in terms:
        found = quarters_of(term)
        if found is not None and len(found) == 1:
            quarters |= found
    return "、".join(_QUARTER_LABEL[q] for q in sorted(quarters))


def describe_course(course: ProposedCourse, day: str | None = None) -> str:
    """「ソフトウェア開発法(3限)」の形。`day` を与えるとその曜日の時限だけを書く。"""
    slots = course.occupied_slots()
    if not slots:
        return f"{course.title}(曜日・時限未定)"
    periods = [s.period for s in slots if day is None or s.day == day]
    if day is None:
        label = "・".join(f"{s.day}{s.period}" for s in slots)
    else:
        label = _periods_label(periods)
    mark = _quarter_mark(course)
    return f"{course.title}({label}{'・' + mark if mark else ''})"


def timetable_days(courses: Sequence[ProposedCourse]) -> dict[str, list[str]]:
    """曜日ごとの科目。平日は空でも載せ、土曜は科目があるときだけ載せる。"""
    days: dict[str, list[str]] = {day: [] for day in WEEKDAYS}
    by_day: dict[str, list[tuple[int, str]]] = {day: [] for day in DAYS}
    for course in courses:
        for day in course_days(course):
            first = min(s.period for s in course.occupied_slots() if s.day == day)
            by_day[day].append((first, describe_course(course, day)))
    for day in DAYS:
        if day == "土" and not by_day[day]:
            continue
        days[day] = [label for _, label in sorted(by_day[day])]
    return days


def free_weekdays(courses: Sequence[ProposedCourse]) -> list[str]:
    """授業の無い平日。"""
    used = {day for course in courses for day in course_days(course)}
    return [day for day in WEEKDAYS if day not in used]


def is_required(course: ProposedCourse) -> bool:
    return course.category == "必修"


def pinned_keys(conditions: Conditions) -> set[str]:
    """学生が入れたいと言った科目(`include`)の、シラバスコードと正規化した科目名。"""
    return {x for wanted in conditions.include for x in (wanted, normalize_title(wanted))}


def is_removable(course: ProposedCourse, pinned: set[str] = frozenset()) -> bool:
    """組み立てが外してよい科目。必修・学生が自分で入れた科目・入れたい科目は外さない。"""
    return (
        course.source == "assistant"
        and not is_required(course)
        and course.syllabus_code not in pinned
        and normalize_title(course.title) not in pinned
    )


def other_free_day_options(
    courses: Sequence[ProposedCourse], pinned: set[str] = frozenset()
) -> list[str]:
    """授業はあるが、外せない科目(必修・自分で入れた科目・入れたい科目)の無い平日。

    今の全休の代わりに空けられる曜日である。
    """
    options = []
    for day in WEEKDAYS:
        on_day = [c for c in courses if day in course_days(c)]
        if on_day and all(is_removable(c, pinned) for c in on_day):
            options.append(day)
    return options


def _who(course: ProposedCourse) -> str:
    """条件の説明に添える、科目の性質。"""
    if course.source == "student":
        return "自分で入れた"
    if is_required(course):
        return "必修の"
    return ""


def _matches_exclude(course: ProposedCourse, exclude: Sequence[str]) -> bool:
    keys = {normalize_title(x) for x in exclude} | set(exclude)
    return normalize_title(course.title) in keys or (course.syllabus_code or "") in keys


def evaluate_conditions(
    courses: Sequence[ProposedCourse],
    conditions: Conditions,
    *,
    include_failures: dict[str, str] | None = None,
    limit: int | None = None,
    title_of: Callable[[str], str] | None = None,
) -> list[ConditionStatus]:
    """時間割が条件を満たしているか。条件ごとに1件。

    組み立てた時間割にも、学生が手で直した時間割にも同じ判定を掛ける。満たせない
    ときは、どの科目が理由かを書く(「水に必修の線形代数(2限)がある」)。

    `title_of` は入れたい科目(`include`。シラバスコード)を科目名に直す関数。入れられ
    なかった科目は時間割に無いので、ここで直さないとコードのまま学生に見える。
    """
    statuses: list[ConditionStatus] = []
    periods = day_periods(courses)
    free = free_weekdays(courses)

    if conditions.scope == "必修のみ":
        extra = [c for c in courses if c.source == "assistant" and not is_required(c)]
        statuses.append(
            ConditionStatus(
                condition="必修だけを入れる",
                status="unmet" if extra else "met",
                detail=(
                    "必修以外の科目もある: " + "、".join(c.title for c in extra)
                    if extra
                    else "必修だけを入れている"
                ),
            )
        )

    for day in dict.fromkeys(conditions.free_days):
        on_day = [c for c in courses if day in course_days(c)]
        statuses.append(
            ConditionStatus(
                condition=f"{day}曜を全休にする",
                status="unmet" if on_day else "met",
                detail=(
                    f"{day}曜に" + "、".join(f"{_who(c)}{describe_course(c, day)}" for c in on_day) + "がある"
                    if on_day
                    else f"{day}曜は授業が無い"
                ),
            )
        )

    wanted = conditions.wanted_free_days()
    if conditions.free_day_count > len(set(conditions.free_days)):
        statuses.append(
            ConditionStatus(
                condition=f"全休の日を{wanted}日作る",
                status="met" if len(free) >= wanted else "unmet",
                detail=(
                    f"授業の無い平日: {'・'.join(free)}"
                    if free
                    else "授業の無い平日が無い"
                ),
            )
        )

    for rule in conditions.avoid_periods:
        hits = [
            c
            for c in courses
            if any(rule.matches(s.day, s.period) for s in c.occupied_slots())
        ]
        statuses.append(
            ConditionStatus(
                condition=f"{rule.label()}を避ける",
                status="unmet" if hits else "met",
                detail=(
                    "、".join(f"{_who(c)}{describe_course(c)}" for c in hits) + "が入っている"
                    if hits
                    else f"{rule.label()}に授業は無い"
                ),
            )
        )

    if conditions.max_days is not None:
        used = [day for day in WEEKDAYS if day not in free]
        statuses.append(
            ConditionStatus(
                condition=f"授業のある平日を{conditions.max_days}日までにする",
                status="met" if len(used) <= conditions.max_days else "unmet",
                detail=f"授業のある平日は{len(used)}日({'・'.join(used) or 'なし'})",
            )
        )

    over = {
        day: len(ps) for day, ps in periods.items() if len(ps) > conditions.max_periods_per_day
    }
    if over or conditions.max_periods_per_day != DEFAULT_MAX_PERIODS_PER_DAY:
        statuses.append(
            ConditionStatus(
                condition=f"1日{conditions.max_periods_per_day}コマまでにする",
                status="unmet" if over else "met",
                detail=(
                    "、".join(f"{day}曜は{n}コマ" for day, n in over.items())
                    + (
                        "(必修や自分で入れた科目で埋まる)"
                        if _over_is_fixed(courses, over, conditions.max_periods_per_day)
                        else ""
                    )
                    if over
                    else f"どの曜日も{conditions.max_periods_per_day}コマ以内"
                ),
            )
        )

    total = sum(c.credits or 0 for c in courses)
    if conditions.target_credits is not None:
        statuses.append(
            ConditionStatus(
                condition=f"単位数を{conditions.target_credits}単位までにする",
                status="met" if total <= conditions.target_credits else "unmet",
                detail=f"時間割の単位は{total}単位",
            )
        )

    failures = include_failures or {}
    for wanted_course in conditions.include:
        present = [
            c
            for c in courses
            if c.syllabus_code == wanted_course
            or normalize_title(c.title) == normalize_title(wanted_course)
        ]
        statuses.append(
            ConditionStatus(
                condition=f"{_include_label(wanted_course, present, title_of)}を入れる",
                status="met" if present else "unmet",
                detail=(
                    "時間割に入っている"
                    if present
                    else failures.get(wanted_course, "時間割に入っていない")
                ),
            )
        )

    if conditions.exclude:
        hits = [c for c in courses if _matches_exclude(c, conditions.exclude)]
        statuses.append(
            ConditionStatus(
                condition="入れない科目(" + "、".join(conditions.exclude) + ")を外す",
                status="unmet" if hits else "met",
                detail=(
                    "、".join(c.title for c in hits) + "が入っている"
                    if hits
                    else "どれも入っていない"
                ),
            )
        )

    if limit is not None and total > limit:
        statuses.append(
            ConditionStatus(
                condition="登録できる単位の上限を超えない",
                status="unmet",
                detail=f"時間割の単位は{total}単位で、登録できる単位({limit}単位)を超える",
            )
        )
    return statuses


def _include_label(
    wanted: str, present: Sequence[ProposedCourse], title_of: Callable[[str], str] | None
) -> str:
    if present:
        return present[0].title
    return title_of(wanted) if title_of else wanted


def _over_is_fixed(courses: Sequence[ProposedCourse], over: dict[str, int], cap: int) -> bool:
    """上限を超えたどの曜日も、必修と学生が入れた科目だけで上限を超えているか。"""
    for day in over:
        fixed = [c for c in courses if day in course_days(c) and not is_removable(c)]
        periods = {s.period for c in fixed for s in c.occupied_slots() if s.day == day}
        if len(periods) <= cap:
            return False
    return True


# 残る不足の理由のうち、学生に伝えなくてよいもの。対象学期に取れる科目が無い枠は、
# 後の学期に取るのが当たり前で、書くと説明が長くなるだけである
NO_CANDIDATE = "対象学期に履修できる候補が無い"


def _required_slot_keys(ctx: StudentContext) -> set[str]:
    """必修だけを受け入れる要件枠。その不足は後の学期の必修で埋まるのが当たり前で、伝えない。"""
    keys = set()
    for slot in ctx.curriculum.requirement_slots:
        accepted = slot.accepts.type
        types = accepted if isinstance(accepted, list) else [accepted]
        if types == ["必修"]:
            keys.add(slot.key)
    return keys


def make_report(
    ctx: StudentContext,
    courses: Sequence[ProposedCourse],
    conditions: Conditions,
    *,
    include_failures: dict[str, str] | None = None,
    shortfall_reasons: dict[str, str] | None = None,
    confirmations: Sequence[str] = (),
) -> Report:
    """時間割のレポートを作る(§7.2)。組み立てた時間割にも手で直した時間割にも使う。

    Args:
        include_failures: 入れたい科目(`include`)を入れられなかった理由。組み立てだけが分かる。
        shortfall_reasons: 要件枠(key)の不足が残った理由。組み立てだけが分かる。
        confirmations: 組み立てが見つけた、学生が確かめるべきこと(必修どうしの重なりなど)。
    """
    limit = ctx.budget.remaining if ctx.budget else None
    before = {slot.key: slot for slot in ctx.requirements.slots}
    after = ctx.judge_with(courses)
    changes: list[SlotChange] = []
    remaining: list[RemainingShortfall] = []
    reasons = shortfall_reasons or {}
    required_slots = _required_slot_keys(ctx)
    for slot in after.slots:
        if slot.required == 0:
            continue
        prior = before[slot.key]
        if prior.shortfall > 0:
            changes.append(
                SlotChange(
                    slot=slot.name, before=prior.earned, after=slot.earned, required=slot.required
                )
            )
        # 必修の枠と、対象学期に取れる科目が無い枠の不足は載せない(学生には当たり前で、
        # 載せるとアシスタントも説明に書く)
        obvious = slot.key in required_slots or reasons.get(slot.key) == NO_CANDIDATE
        if slot.shortfall > 0 and not obvious:
            remaining.append(
                RemainingShortfall(
                    slot=slot.name, shortfall=slot.shortfall, reason=reasons.get(slot.key)
                )
            )

    retakes = ctx.retakes()
    confirm: list[str] = list(confirmations)
    for course in courses:
        if not course.occupied_slots():
            confirm.append(f"{course.title}は曜日・時限が未定(集中講義など)。日程を確かめる")
        result = ctx.prerequisites.get(normalize_title(course.title))
        if result is not None and result.status == "unknown":
            confirm.append(f"{course.title}の先修条件はシステムでは判定できない。条件: {result.notes}")

    total = sum(c.credits or 0 for c in courses)
    return Report(
        days=timetable_days(courses),
        free_days=free_weekdays(courses),
        other_free_day_options=other_free_day_options(courses, pinned_keys(conditions)),
        unscheduled=[c.title for c in courses if not c.occupied_slots()],
        conditions=evaluate_conditions(
            courses,
            conditions,
            include_failures=include_failures,
            limit=limit,
            title_of=ctx.title_of,
        ),
        requirements=changes,
        remaining_shortfall=remaining,
        credits=CreditsInfo(
            total=total,
            limit=limit,
            cap=ctx.budget.cap if ctx.budget else None,
            registered=ctx.budget.registered if ctx.budget else 0,
        ),
        # 履修区分を添える。必修でない再履修の科目まで「外せない」と説明された
        retakes=[
            f"{c.title}({c.category or '履修区分不明'})"
            for c in courses
            if normalize_title(c.title) in retakes
        ],
        needs_confirmation=list(dict.fromkeys(confirm)),
    )


def report_lines(report: Report) -> list[str]:
    """レポートをプロンプトに載せる行にする。値は数えず、そのまま書く。"""
    lines = ["曜日ごとの科目:"]
    for day, labels in report.days.items():
        lines.append(f"- {day}: {'、'.join(labels) if labels else '授業なし(全休)'}")
    if report.unscheduled:
        lines.append(f"- 曜日・時限未定: {'、'.join(report.unscheduled)}")
    lines.append(f"授業の無い平日: {'・'.join(report.free_days) or 'なし'}")
    if report.other_free_day_options:
        lines.append(
            "代わりに全休にできる平日(必修・自分で入れた科目が無い): "
            + "・".join(report.other_free_day_options)
        )
    credits = report.credits
    limit = f" / 登録できる単位 {credits.limit}" if credits.limit is not None else ""
    lines.append(f"単位の合計: {credits.total}{limit}")
    if report.conditions:
        lines.append("条件:")
        for status in report.conditions:
            mark = "満たした" if status.status == "met" else "満たせなかった"
            lines.append(f"- {status.condition}: {mark}。{status.detail}")
    if report.requirements:
        lines.append("要件枠の修得単位(時間割を修得する前 → 後 / 必要):")
        for change in report.requirements:
            lines.append(f"- {change.slot}: {change.before} → {change.after} / {change.required}")
    if report.remaining_shortfall:
        lines.append("時間割を修得しても残る不足:")
        for short in report.remaining_shortfall:
            reason = f"({short.reason})" if short.reason else ""
            lines.append(f"- {short.slot}: {short.shortfall}単位{reason}")
    if report.retakes:
        lines.append(f"再履修の科目: {'、'.join(report.retakes)}")
    if report.needs_confirmation:
        lines.append("確かめること:")
        lines.extend(f"- {item}" for item in report.needs_confirmation)
    return lines


def summarize_report(report: Report, course_count: int) -> str:
    """レポートから、モデルを通さずに学生へ見せる説明を作る(「希望条件なしで提案する」)。

    書くのはレポートにある事実だけで、推測や評価を足さない。
    """
    credits = report.credits
    limit = f"(登録できる単位は{credits.limit}単位)" if credits.limit is not None else ""
    lines = [f"時間割を組みました。{course_count}科目・{credits.total}単位です{limit}。", ""]
    if report.free_days:
        lines.append(f"- 授業の無い平日: {'・'.join(report.free_days)}")
    else:
        lines.append("- 授業の無い平日はありません")
    unmet = [c for c in report.conditions if c.status == "unmet"]
    for status in unmet:
        lines.append(f"- 満たせなかった条件: {status.condition}({status.detail})")
    for short in report.remaining_shortfall:
        reason = f"。{short.reason}" if short.reason else ""
        lines.append(f"- この時間割を修得しても {short.slot} が{short.shortfall}単位不足{reason}")
    if report.retakes:
        lines.append(f"- 再履修の科目: {'、'.join(report.retakes)}")
    for item in report.needs_confirmation:
        lines.append(f"- 確かめること: {item}")
    lines += ["", "条件(全休・避けたい時限・入れたい科目など)があれば、書いてください。組み直します。"]
    return "\n".join(lines)
