"""時間割の組み立てのテスト。design.md §7.2。

合成の履修要項と開講情報(`tests/timetable_fixtures.py`)で、組み立ての手順・条件・
レポート・手順の記録を確かめる。同点の候補は無作為に選ぶので、乱数の種を固定する。
"""

import random

import pytest

from app.curricula.requirements import entry_slot_keys
from app.schemas.proposal import CourseSlot, ProposedCourse
from app.timetable import context as context_module
from app.timetable.builder import build_timetable, check_timetable
from app.timetable.conditions import Conditions, PeriodRule, parse_period_rule
from app.timetable.context import build_student_context
import timetable_fixtures as fx


@pytest.fixture(autouse=True)
def curricula(monkeypatch):
    monkeypatch.setattr(
        context_module, "get_curricula", lambda: {("01", fx.ADMISSION_YEAR): fx.loaded()}
    )


async def _ctx(*courses, term="前期", grade=1, classes=None):
    return await build_student_context(
        fx.profile(*courses, grade=grade),
        "01",
        fx.ADMISSION_YEAR,
        fx.target(term, grade),
        catalog=fx.catalog(classes),
    )


def _build(ctx, conditions=None, current=(), mode="rebuild", seed=0):
    return build_timetable(
        ctx, conditions or Conditions(), current, mode=mode, rng=random.Random(seed)
    )


def _titles(courses) -> set[str]:
    return {c.title for c in courses}


def _course(title, code, day, period, *, category="選択", source="assistant", credits=2):
    return ProposedCourse(
        syllabus_code=code,
        title=title,
        day=day,
        period=period,
        term="前期",
        slots=[CourseSlot(term="前期", day=day, period=period)],
        credits=credits,
        category=category,
        reason="",
        source=source,
    )


# --- 材料 ---


@pytest.mark.asyncio
async def test_context_keeps_only_registrable_classes_of_the_target_term():
    ctx = await _ctx()
    titles = {c.course.title for c in ctx.candidates}

    assert "後期の科目" not in titles  # 対象学期(前期)に登録しない
    assert "他課程指定" not in titles  # 他課程だけが対象のクラス
    assert "有機化学" in titles  # 他課程の科目でも自課程が対象なら入る
    assert ctx.budget is not None and ctx.budget.remaining == 22


def test_entry_slot_levels_follow_overflow():
    entries = entry_slot_keys(fx.loaded().curriculum)

    assert entries.levels["applied.selreq"] == 0
    assert entries.levels["applied.elective"] == 1  # 選択必修から溢れを受ける
    assert entries.levels["free.faculty"] == 2
    assert entries.levels["free.all"] == 3
    assert entries.levels["liberal.humanities"] == 0
    assert entries.levels["liberal.elective"] == 1  # 教養の選択必修から溢れを受ける
    assert entries.levels["free.all"] > entries.levels["liberal.elective"]


# --- 必修 ---


@pytest.mark.asyncio
async def test_required_courses_are_always_placed():
    result = _build(await _ctx())
    by_title = {c.title: c for c in result.courses}

    for title in ("微分積分", "線形代数", "仏教の思想A"):
        assert by_title[title].reason == "必修"
    required_steps = [s for s in result.steps if s.kind == "required"]
    assert {s.course.title for s in required_steps} == {"微分積分", "線形代数", "仏教の思想A"}
    assert all(s.note == "必修" for s in required_steps)


@pytest.mark.asyncio
async def test_failed_required_course_is_placed_as_retake():
    """不合格の必修は、履修できる学期なら必ず置く(配当年次を過ぎていても)。"""
    ctx = await _ctx(fx.course("微分積分", status="failed"), grade=2)
    result = _build(ctx)

    placed = {c.title: c for c in result.courses}
    assert placed["微分積分"].reason == "再履修の必修"
    assert any(s.kind == "required" and s.note == "再履修" for s in result.steps)
    assert result.report.retakes == ["微分積分(必修)"]


@pytest.mark.asyncio
async def test_required_courses_that_clash_are_both_left_out():
    classes = dict(fx.CLASSES)
    classes.pop("Y000000003")  # 線形代数の水1 を無くす
    classes["Y000000002"] = fx._class("Y000000002", "線形代数", [("月", 1)])  # 微分積分と同じ月1
    result = _build(await _ctx(classes=classes))

    assert "微分積分" not in _titles(result.courses)
    assert "線形代数" not in _titles(result.courses)
    assert any("重なる" in item for item in result.report.needs_confirmation)


@pytest.mark.asyncio
async def test_required_course_breaks_free_day_when_unavoidable():
    """必修のクラスがどれも条件に合わなければ、条件を破って置き、破ったことを示す。"""
    result = _build(await _ctx(), Conditions(free_days=["月"]))

    assert "微分積分" in _titles(result.courses)  # 月1 にしかない
    status = next(c for c in result.report.conditions if c.condition == "月曜を全休にする")
    assert status.status == "unmet"
    assert "必修の微分積分" in status.detail
    assert any(s.kind == "unmet" and s.condition == "月曜を全休にする" for s in result.steps)


@pytest.mark.asyncio
async def test_required_course_takes_the_class_that_keeps_the_free_day():
    result = _build(await _ctx(), Conditions(free_days=["火"]))

    linear = next(c for c in result.courses if c.title == "線形代数")
    assert linear.day == "水"  # 火1 のクラスを避ける
    assert "火" in result.report.free_days


# --- 不足を埋める ---


@pytest.mark.asyncio
@pytest.mark.parametrize("seed", range(5))
async def test_fill_goes_from_upstream_slots_to_receiving_slots(seed):
    """溢れを受けない枠(選択必修)を先に、受け皿(選択・フリー)を後に埋める。"""
    result = _build(await _ctx(), seed=seed)
    fills = [s for s in result.steps if s.kind == "fill"]
    curriculum = fx.loaded().curriculum
    levels = entry_slot_keys(curriculum).levels
    keys = {slot.name: slot.key for slot in curriculum.requirement_slots}

    order = [levels[keys[s.slot]] for s in fills]
    assert order == sorted(order)
    assert {s.slot for s in fills[:2]} == {"専門応用科目(選択必修)", "教養教育科目(選択必修・人文)"}
    assert fills[0].shortfall_after == 0


@pytest.mark.asyncio
async def test_fill_meets_requirements_without_overfilling():
    result = _build(await _ctx())

    assert not result.report.remaining_shortfall
    assert result.total_credits <= 22
    # 不足を減らさない科目は入れない(必修 6 単位 + 不足の 16 単位)
    assert result.total_credits <= 22


@pytest.mark.asyncio
async def test_fill_prefers_course_whose_credits_fit_the_shortfall():
    """専門応用(選択)の不足が2単位なら、4単位の画像処理より2単位の科目を選ぶ。"""
    ctx = await _ctx(fx.course("情報理論"))  # 専門応用(選択) 4 のうち 2 を修得済み
    result = _build(ctx, Conditions(exclude=["数値解析"]))
    fills = [s for s in result.steps if s.kind == "fill" and s.slot == "専門応用科目(選択)"]

    assert fills and fills[0].course.title == "符号理論"


@pytest.mark.asyncio
async def test_fill_respects_credit_limit():
    result = _build(await _ctx(), Conditions(target_credits=8))

    assert result.total_credits <= 8
    reasons = {s.reason for s in result.report.remaining_shortfall}
    assert "登録できる単位の上限に達した" in reasons


@pytest.mark.asyncio
async def test_required_only_scope_places_only_required_courses():
    result = _build(await _ctx(), Conditions(scope="必修のみ"))

    assert _titles(result.courses) == {"微分積分", "線形代数", "仏教の思想A"}
    assert {s.reason for s in result.report.remaining_shortfall} == {"必修だけを入れる条件のため"}


@pytest.mark.asyncio
async def test_broad_scope_adds_courses_after_shortfall_is_gone():
    done = [fx.course(t) for t in ("数値解析", "情報理論", "符号理論", "哲学", "文学", "有機化学")]
    # 残る不足はオールフリーゾーンの2単位だけ。音楽・統計学・画像処理が候補に残る
    narrow = _build(await _ctx(*done))
    broad = _build(await _ctx(*done), Conditions(scope="広く"))

    assert len(broad.courses) > len(narrow.courses)
    assert broad.total_credits <= 22


# --- 条件 ---


@pytest.mark.asyncio
async def test_free_day_count_chooses_a_day_without_required_courses():
    result = _build(await _ctx(), Conditions(free_day_count=1))

    chosen = result.conditions.free_days
    assert len(chosen) == 1
    assert chosen[0] not in ("月", "木")  # 必修(微分積分・仏教の思想A)がある
    assert chosen[0] in result.report.free_days
    assert any(s.kind == "free_day" and s.day == chosen[0] for s in result.steps)
    status = next(c for c in result.report.conditions if c.condition == f"{chosen[0]}曜を全休にする")
    assert status.status == "met"


@pytest.mark.asyncio
async def test_free_day_count_reports_when_required_courses_fill_every_day():
    classes = {
        **fx.CLASSES,
        "Y000000002": fx._class("Y000000002", "線形代数", [("火", 1), ("水", 1), ("金", 1)]),
    }
    classes.pop("Y000000003")
    result = _build(await _ctx(classes=classes), Conditions(free_day_count=2))

    status = next(c for c in result.report.conditions if c.condition == "全休の日を2日作る")
    assert status.status == "unmet"


@pytest.mark.asyncio
async def test_avoid_periods_keeps_electives_out_and_reports_required():
    result = _build(await _ctx(), Conditions(avoid_periods=[PeriodRule(period=1)]))

    status = next(c for c in result.report.conditions if c.condition == "1限(全曜日)を避ける")
    assert status.status == "unmet"  # 微分積分(月1)と線形代数(1限のみ)は必修
    first_period = [
        c for c in result.courses if any(s.period == 1 for s in c.occupied_slots())
    ]
    assert all(c.category == "必修" for c in first_period)


@pytest.mark.asyncio
async def test_max_periods_per_day_caps_electives():
    result = _build(await _ctx(), Conditions(max_periods_per_day=2))

    for day, labels in result.report.days.items():
        periods = {p for c in result.courses for s in c.occupied_slots() if s.day == day for p in [s.period]}
        assert len(periods) <= 2, (day, labels)


@pytest.mark.asyncio
async def test_include_places_the_wanted_class_and_exclude_keeps_it_out():
    result = _build(
        await _ctx(), Conditions(include=["Y000000006"], exclude=["情報理論"])
    )

    assert "符号理論" in _titles(result.courses)
    assert "情報理論" not in _titles(result.courses)
    assert any(s.kind == "include" and s.course.title == "符号理論" for s in result.steps)


@pytest.mark.asyncio
async def test_include_reports_why_it_could_not_be_placed():
    result = _build(await _ctx(), Conditions(include=["Y000000009", "Y000000010"]))

    details = {c.condition: c.detail for c in result.report.conditions if c.status == "unmet"}
    assert any("後期開講" in d for d in details.values())
    assert any("他課程が対象" in d for d in details.values())


# --- 今の時間割を起点にする ---


@pytest.mark.asyncio
async def test_adjust_removes_only_removable_courses_on_the_free_day():
    current = [
        _course("微分積分", "Y000000001", "月", 1, category="必修"),
        _course("線形代数", "Y000000002", "火", 1, category="必修"),
        _course("仏教の思想A", "G000000001", "木", 2, category="必修"),
        _course("符号理論", "Y000000006", "水", 3),
        _course("哲学", "G000000002", "水", 2, source="student"),
    ]
    result = _build(await _ctx(), Conditions(free_days=["水"]), current, mode="adjust")

    assert "符号理論" not in _titles(result.courses)
    assert "哲学" in _titles(result.courses)  # 学生が入れた科目は外さない
    assert any(s.kind == "remove" and s.course.title == "符号理論" for s in result.steps)
    status = next(c for c in result.report.conditions if c.condition == "水曜を全休にする")
    assert status.status == "unmet"
    assert "自分で入れた哲学" in status.detail


@pytest.mark.asyncio
async def test_rebuild_keeps_only_courses_the_student_added():
    current = [
        _course("符号理論", "Y000000006", "水", 3),
        _course("文学", "G000000003", "月", 4, source="student"),
    ]
    result = _build(await _ctx(), current=current)

    kept = [s.course for s in result.steps if s.kind == "keep"]
    assert [c.title for c in kept] == ["文学"]
    assert next(c for c in result.courses if c.title == "文学").source == "student"


# --- レポート ---


@pytest.mark.asyncio
async def test_report_lists_days_requirements_and_credits():
    result = _build(await _ctx())
    report = result.report

    assert set(report.days) == {"月", "火", "水", "木", "金"}
    assert any("微分積分(1限)" == label for label in report.days["月"])
    assert report.credits.total == result.total_credits
    assert report.credits.limit == 22
    assert {c.slot for c in report.requirements} >= {"専門基礎科目(必修)", "専門応用科目(選択必修)"}


@pytest.mark.asyncio
async def test_check_reports_a_hand_edited_timetable():
    ctx = await _ctx()
    courses = [
        _course("画像処理", "Y000000007", "金", 3, credits=4),
        _course("文学", "G000000003", "金", 4, source="student"),
    ]
    report = check_timetable(ctx, courses, Conditions(free_days=["金"]))

    status = next(c for c in report.conditions if c.condition == "金曜を全休にする")
    assert status.status == "unmet"
    assert report.free_days == ["月", "火", "水", "木"]
    assert report.credits.total == 6


# --- 条件の表記 ---


@pytest.mark.parametrize(
    ("text", "day", "period"),
    [("金5", "金", 5), ("金曜5限", "金", 5), ("1限", None, 1), ("１限", None, 1), ("3", None, 3)],
)
def test_parse_period_rule(text, day, period):
    rule = parse_period_rule(text)
    assert (rule.day, rule.period) == (day, period)


def test_parse_period_rule_rejects_unreadable_text():
    with pytest.raises(ValueError):
        parse_period_rule("午前中")


def test_conditions_describe_only_what_was_set():
    assert Conditions().describe() == []
    lines = Conditions(free_day_count=1, avoid_periods=[PeriodRule(day="金", period=5)]).describe()
    assert lines == ["全休の日を1日作る", "避ける時限: 金5"]


@pytest.mark.asyncio
async def test_report_leaves_out_shortfalls_the_student_takes_for_granted():
    """必修の枠と、対象学期に取れる科目が無い枠の不足は、残る不足に載せない。

    どちらも後の学期に取るのが当たり前で、載せると説明が長くなるだけである。
    """
    from app.timetable.report import NO_CANDIDATE, make_report

    report = make_report(
        await _ctx(), [], Conditions(), shortfall_reasons={"applied.elective": NO_CANDIDATE}
    )
    slots = {s.slot for s in report.remaining_shortfall}

    assert "専門基礎科目(必修)" not in slots
    assert "教養教育科目(必修・仏教)" not in slots
    assert "専門応用科目(選択)" not in slots
    assert "専門応用科目(選択必修)" in slots


@pytest.mark.asyncio
async def test_failed_elective_is_left_out_unless_the_student_asks():
    """必修でない不合格・履修辞退の科目は不足を埋める候補にしない。入れたいと言われたら入れる。"""
    from app.timetable.facts import retake_lines

    ctx = await _ctx(
        fx.course("微分積分", status="failed"), fx.course("符号理論", status="failed"), grade=2
    )
    for seed in range(5):
        result = build_timetable(ctx, Conditions(), rng=random.Random(seed))
        assert "符号理論" not in _titles(result.courses)

    code = next(code for code, (c, _) in ctx.classes.items() if c.course.title == "符号理論")
    result = _build(ctx, Conditions(include=[code]))
    assert "符号理論" in _titles(result.courses)

    # プロンプトに載せるのは必修の再履修だけ(モデルが自分から持ち出さないように)
    assert retake_lines(ctx) == ["- 微分積分(対象学期に履修できれば必ず入る)"]
