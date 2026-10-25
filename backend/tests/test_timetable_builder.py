"""時間割の組み立てのテスト。design.md §7.2。

合成の履修要項と開講情報(`tests/timetable_fixtures.py`)で、組み立ての手順・条件・
レポート・手順の記録を確かめる。同点の候補は無作為に選ぶので、乱数の種を固定する。
"""

import random

import pytest

from app.curricula.requirements import entry_slot_keys
from app.schemas.proposal import CourseSlot, ProposedCourse
from app.timetable import context as context_module
from app.timetable.builder import UNFILLED, build_timetable, check_timetable
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


@pytest.mark.asyncio
async def test_yearly_cap_subtracts_what_was_registered_in_the_first_half():
    """4年次の上限は年間(7・8セメスター合わせて48)。後期は前期に登録した単位を引く。

    成績の付いた科目(不合格を含む)も登録した時点で上限に数えている。随意科目と
    サマーセッション科目は上限に数えない。
    """
    from app.schemas.student import Course

    def taken(title, credits, status="passed", term="前期"):
        return Course(title=title, year=fx.OFFERING_YEAR, term=term, credits=credits, status=status)

    ctx = await _ctx(
        taken("前期の科目A", 20),
        taken("前期の科目B", 4, status="failed"),
        taken("夏の科目", 2, term="サ集"),
        taken("去年の科目", 20, term="後期").model_copy(update={"year": fx.OFFERING_YEAR - 1}),
        term="後期",
        grade=4,
    )
    assert ctx.budget is not None
    assert (ctx.budget.cap, ctx.budget.registered, ctx.budget.per_year) == (48, 24, True)
    assert ctx.budget.remaining == 24

    # 前期は、その学期に登録済みの単位だけを引く
    first = await _ctx(taken("前期の科目A", 20, status="registered"), term="前期", grade=4)
    assert (first.budget.cap, first.budget.registered) == (48, 20)


@pytest.mark.asyncio
async def test_semester_cap_counts_half_of_a_full_year_course():
    """通年の科目は、前期と後期に半分ずつ数える(履修要項の注記)。"""
    from app.schemas.student import Course

    whole = Course(title="通年の科目", year=fx.OFFERING_YEAR, term="通年", credits=4, status="registered")
    ctx = await _ctx(whole, term="後期", grade=2)
    assert (ctx.budget.cap, ctx.budget.registered) == (22, 2)


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
    reasons = [s.reason or "" for s in result.report.remaining_shortfall]
    assert any(r.startswith("登録できる単位の上限に達した。候補: ") for r in reasons)


@pytest.mark.asyncio
async def test_shortfall_reason_names_the_course_a_candidate_clashes_with():
    """上限に達していても、重なりで入らない候補は重なる科目の名前まで書く。

    上限だけを理由にすると、モデルは「どれかを外せば入る」と説明し、実際には重なる
    科目を外さないと入らない入れ替えを提案した。
    """
    current = [
        *_required_courses(),
        _course("文学", "G000000003", "月", 3),
        _course("音楽", "G000000004", "火", 3),
        _course("哲学", "G000000002", "水", 3, category="選択必修"),
        _course("有機化学", "Y000000008", "金", 3),
    ]
    result = _build(await _ctx(), Conditions(target_credits=14), current, mode="adjust")

    assert result.total_credits == 14
    short = {s.slot: s.reason or "" for s in result.report.remaining_shortfall}
    reason = short["専門応用科目(選択)"]
    assert reason.startswith("登録できる単位の上限に達した。候補: ")
    assert "符号理論(哲学と水3で重なる)" in reason
    # 挙げるのは3件までで、残りは件数にする
    assert reason.count("で重なる") == 3 and reason.endswith("、ほか1件")


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
    # 入れられなかった科目もシラバスコードではなく科目名で書く
    assert not any("Y0000000" in condition for condition in details)


def _clash_classes():
    """符号理論を情報理論と同じ月3に置いた開講情報。"""
    classes = dict(fx.CLASSES)
    classes["Y000000006"] = fx._class("Y000000006", "符号理論", [("月", 3)])
    return classes


@pytest.mark.asyncio
async def test_include_displaces_a_removable_course_in_the_same_period():
    """入れたい科目と重なる科目が外してよい科目なら、外して入れる(外したことを返す)。

    実機で、現代の技術を入れたいと言われたのに、月3の政治学のすすめ(組み立てが入れた
    選択必修)を外さず、入れられなかった。
    """
    current = [_course("情報理論", "Y000000005", "月", 3)]
    result = _build(
        await _ctx(classes=_clash_classes()),
        Conditions(include=["Y000000006"]),
        current,
        mode="adjust",
    )

    assert "符号理論" in _titles(result.courses)
    assert "情報理論" not in _titles(result.courses)
    assert result.displaced == {"情報理論": "符号理論と月3で重なる"}
    removed = next(i for i, s in enumerate(result.steps) if s.kind == "remove")
    included = next(i for i, s in enumerate(result.steps) if s.kind == "include")
    assert removed < included
    assert result.steps[removed].note == "入れたい科目の「符号理論」と月3で重なるため"


@pytest.mark.asyncio
async def test_include_does_not_displace_a_course_the_student_added():
    current = [_course("情報理論", "Y000000005", "月", 3, source="student")]
    result = _build(
        await _ctx(classes=_clash_classes()),
        Conditions(include=["Y000000006"]),
        current,
        mode="adjust",
    )

    assert "情報理論" in _titles(result.courses)
    assert "符号理論" not in _titles(result.courses)
    assert result.displaced == {}
    assert result.include_failures["Y000000006"] == (
        "符号理論は「情報理論」(必修・自分で入れた科目・入れたい科目で外せない)と月3で重なる"
    )


def _required():
    return [
        _course("微分積分", "Y000000001", "月", 1, category="必修"),
        _course("線形代数", "Y000000002", "火", 1, category="必修"),
        _course("仏教の思想A", "G000000001", "木", 2, category="必修"),
    ]


@pytest.mark.asyncio
async def test_include_over_the_limit_displaces_the_course_whose_loss_hurts_least():
    """上限を超えるときは、外しても残る不足が増えにくい科目を外す。

    哲学は教養教育科目(選択必修・人文)を、文学はその下流の教養教育科目(選択)を埋めている。
    上流の枠を空けない文学を外す。
    """
    current = [
        *_required(),
        _course("哲学", "G000000002", "水", 2, category="選択必修"),
        _course("文学", "G000000003", "月", 4),
    ]
    result = _build(
        await _ctx(),
        Conditions(include=["Y000000006"], target_credits=10),
        current,
        mode="adjust",
    )

    assert "符号理論" in _titles(result.courses)
    assert "哲学" in _titles(result.courses)
    assert "文学" not in _titles(result.courses)
    assert result.total_credits == 10
    assert result.displaced == {"文学": "符号理論を入れると登録できる単位(10単位)を超える"}


@pytest.mark.asyncio
async def test_include_over_the_limit_fails_when_nothing_can_be_removed():
    current = [*_required(), _course("哲学", "G000000002", "水", 2, source="student")]
    result = _build(
        await _ctx(),
        Conditions(include=["Y000000006"], target_credits=8),
        current,
        mode="adjust",
    )

    assert "符号理論" not in _titles(result.courses)
    assert "哲学" in _titles(result.courses)
    assert result.displaced == {}
    assert "外してよい科目を外しても収まらない" in result.include_failures["Y000000006"]


@pytest.mark.asyncio
async def test_report_tells_which_removable_courses_can_go_without_new_shortfall():
    """外してよい科目を1つ外したときに増える不足。受け皿まで溢れている科目は増えない。"""
    courses = [
        *_required(),
        _course("哲学", "G000000002", "水", 2, category="選択必修"),
        _course("情報理論", "Y000000005", "月", 3),
        _course("符号理論", "Y000000006", "水", 3),
        _course("統計学", "Y000000011", "火", 3),
        _course("画像処理", "Y000000007", "金", 3, credits=4),
        _course("文学", "G000000003", "月", 4, source="student"),
    ]
    report = check_timetable(await _ctx(), courses, Conditions())

    effects = {e.course: e.shortfall for e in report.removal_effects}
    # 必修・自分で入れた科目は載せない
    assert set(effects) == {
        "哲学(水2)", "情報理論(月3)", "符号理論(水3)", "統計学(火3)", "画像処理(金3)"
    }
    assert effects["哲学(水2)"] == ["教養教育科目(選択必修・人文) 2単位"]
    assert effects["統計学(火3)"] == []

    from app.timetable.report import report_lines

    lines = report_lines(report)
    assert "- 統計学(火3): 増えない" in lines
    assert "- 哲学(水2): 教養教育科目(選択必修・人文) 2単位" in lines


@pytest.mark.asyncio
async def test_report_tells_the_credits_that_overflow_every_slot():
    """受け皿(オールフリーゾーン)まで埋まって余る単位。要件枠の「後」は必要を超えないので、別に載せる。"""
    from app.timetable.report import report_lines

    courses = [
        *_required(),
        _course("統計学", "Y000000011", "火", 3, source="student"),
        _course("情報理論", "Y000000005", "月", 3),
        _course("符号理論", "Y000000006", "水", 3),
        _course("画像処理", "Y000000007", "金", 3, credits=4),
    ]
    report = check_timetable(await _ctx(), courses, Conditions())

    # 専門応用(選択)4 → 学部フリー2 → オールフリー2 に入りきらない2単位。余りは
    # 自分で入れた科目でなく、外してよい科目に寄せる
    assert report.surplus == ["画像処理(金3) 2単位"]
    assert (
        "時間割の単位のうち卒業要件に数えられない単位(入る要件枠が受け皿まで埋まっている、"
        "または算入の上限を超える): 画像処理(金3) 2単位"
    ) in report_lines(report)
    free = next(c for c in report.requirements if c.slot == "オールフリーゾーン")
    assert (free.after, free.required) == (2, 2)

    fewer = check_timetable(await _ctx(), courses[:-1], Conditions())
    assert fewer.surplus == []
    assert "時間割の単位のうち卒業要件に数えられない単位: なし" in report_lines(fewer)


@pytest.mark.parametrize("mode", ["remove", "adjust", "rebuild"])
@pytest.mark.asyncio
async def test_exclude_never_removes_a_required_course(mode):
    """入れない科目に必修を指定されても外さない。学生が自分で入れた科目は、頼まれたので外す。"""
    from app.agents.timetable_assistant import build_failures

    current = [
        _course("微分積分", "Y000000001", "月", 1, category="必修"),
        _course("哲学", "G000000002", "水", 2, source="student"),
    ]
    result = _build(await _ctx(), Conditions(exclude=["微分積分", "哲学"]), current, mode=mode)

    assert "微分積分" in _titles(result.courses)
    assert "哲学" not in _titles(result.courses)
    failed = build_failures(
        current, result.courses, mode=mode, include=[], exclude=["微分積分", "哲学"],
        include_failures={},
    )
    assert failed == {"微分積分": "必修は外せない"}
    status = next(c for c in result.report.conditions if c.condition.startswith("入れない科目"))
    assert status.detail == "微分積分が入っている(必修は外せない)"


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


def _required_courses():
    return [
        _course("微分積分", "Y000000001", "月", 1, category="必修"),
        _course("線形代数", "Y000000002", "火", 1, category="必修"),
        _course("仏教の思想A", "G000000001", "木", 2, category="必修"),
    ]


@pytest.mark.asyncio
async def test_remove_only_removes_and_reports_the_unfilled_shortfall():
    current = [*_required_courses(), _course("文学", "G000000003", "月", 4)]
    result = _build(await _ctx(), Conditions(exclude=["文学"]), current, mode="remove")

    assert _titles(result.courses) == {"微分積分", "線形代数", "仏教の思想A"}
    assert [s.course.title for s in result.steps if s.kind == "remove"] == ["文学"]
    assert not any(s.kind == "fill" for s in result.steps)  # 代わりの科目を入れない
    short = {s.slot: s.reason for s in result.report.remaining_shortfall}
    assert short["教養教育科目(選択)"] == UNFILLED  # 音楽で埋められる


@pytest.mark.asyncio
async def test_adjust_fills_what_the_removed_course_left():
    current = [*_required_courses(), _course("文学", "G000000003", "月", 4)]
    result = _build(await _ctx(), Conditions(exclude=["文学"]), current, mode="adjust")

    assert "文学" not in _titles(result.courses)
    assert "音楽" in _titles(result.courses)


@pytest.mark.asyncio
async def test_remove_keeps_the_reason_of_a_shortfall_it_cannot_fill():
    current = [
        *_required_courses(),
        _course("哲学", "G000000002", "水", 2, category="選択必修"),
        _course("文学", "G000000003", "月", 4),
        _course("音楽", "G000000004", "木", 4),
    ]
    result = _build(await _ctx(), Conditions(exclude=["哲学"]), current, mode="remove")

    assert "哲学" not in _titles(result.courses)
    short = {s.slot: s.reason for s in result.report.remaining_shortfall}
    # 人文の選択必修は哲学しかなく、代わりを探しても埋まらない
    assert short["教養教育科目(選択必修・人文)"] == "入れない科目に指定された科目しか候補が無い"


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


# --- クラスの選び方・サブタイトルで見分ける科目 ---


def _with_offerings(monkeypatch, extra_codes: dict[str, list[str]], liberal: list[dict] = ()):
    """開講年度ファイルにコードを、教養教育科目に科目を足す。"""
    resolved = {k: dict(v) for k, v in fx.RESOLVED.items()}
    for title, codes in extra_codes.items():
        program = "00" if title in {c["title"] for c in liberal} or title in resolved["00"] else "01"
        resolved[program][title] = [*resolved[program].get(title, []), *codes]
    monkeypatch.setattr(fx, "RESOLVED", resolved)
    if liberal:
        base = fx.liberal_arts()
        extended = base.model_copy(
            update={
                "courses": [
                    *base.courses,
                    *(type(base.courses[0]).model_validate(c) for c in liberal),
                ]
            }
        )
        monkeypatch.setattr(fx, "liberal_arts", lambda: extended)


@pytest.mark.asyncio
async def test_include_by_code_tries_the_other_classes_of_the_course(monkeypatch):
    """コードで渡された入れたい科目も、そのクラスが重なれば同じ科目の別のクラスで入れる。"""
    _with_offerings(monkeypatch, {"符号理論": ["Y000000012"]})
    classes = dict(fx.CLASSES)
    classes["Y000000012"] = fx._class("Y000000012", "符号理論", [("木", 5)])
    current = [_course("哲学", "G000000002", "水", 2, source="student"),
               _course("統計学", "Y000000011", "水", 3, source="student")]
    result = _build(
        await _ctx(classes=classes), Conditions(include=["Y000000006"]), current, mode="adjust"
    )

    placed = next(c for c in result.courses if c.title == "符号理論")
    assert placed.syllabus_code == "Y000000012"  # 水3 は自分で入れた統計学と重なる
    assert result.include_placed == {"Y000000006": "Y000000012"}
    # 置いたクラスを入れたい科目として持ち直す(手で外したとき frontend が条件から除ける)
    assert result.conditions.include == ["Y000000012"]
    assert not any(c.status == "unmet" for c in result.report.conditions)


@pytest.mark.asyncio
async def test_include_prefers_the_class_it_was_given(monkeypatch):
    _with_offerings(monkeypatch, {"符号理論": ["Y000000012"]})
    classes = dict(fx.CLASSES)
    classes["Y000000012"] = fx._class("Y000000012", "符号理論", [("月", 5)])
    for seed in range(5):
        result = _build(
            await _ctx(classes=classes), Conditions(include=["Y000000006"]), seed=seed
        )
        placed = next(c for c in result.courses if c.title == "符号理論")
        assert placed.syllabus_code == "Y000000006"
        assert result.include_placed == {}


_SPECIAL = {
    "title": "教養教育科目特別講義",
    "category": "教養教育科目",
    "subcategory": "教養教育科目特別講義",
    "type": "選択",
    "credits": 2,
    "grade": 1,
    "term": "前期",
}


async def _special_ctx(monkeypatch, *courses):
    _with_offerings(monkeypatch, {"教養教育科目特別講義": ["G000000005", "G000000006"]}, [_SPECIAL])
    classes = dict(fx.CLASSES)
    classes["G000000005"] = fx._class("G000000005", "教養教育科目特別講義", [("火", 4)])
    classes["G000000006"] = fx._class("G000000006", "教養教育科目特別講義", [("水", 4)])
    classes["G000000005"] = classes["G000000005"].__class__(
        **{**classes["G000000005"].__dict__, "subtitle": "AI基礎"}
    )
    classes["G000000006"] = classes["G000000006"].__class__(
        **{**classes["G000000006"].__dict__, "subtitle": "地域学"}
    )
    # 対象学部のコード(検索が引く範囲)も CLASSES から作られる
    monkeypatch.setattr(fx, "CLASSES", classes)
    return await _ctx(*courses)


@pytest.mark.asyncio
async def test_special_lectures_are_told_apart_by_subtitle(monkeypatch):
    """特別講義はサブタイトルごとに別の科目。1つ修得済みでも、別の講義を入れられる。"""
    ctx = await _special_ctx(monkeypatch, fx.course("教養教育科目特別講義"))

    specials = [c for c in ctx.candidates if c.course.title == "教養教育科目特別講義"]
    assert {c.subtitle for c in specials} == {"AI基礎", "地域学"}

    result = _build(ctx, Conditions(include=["G000000005", "G000000006"]))
    placed = {c.subtitle for c in result.courses if c.title == "教養教育科目特別講義"}
    assert placed == {"AI基礎", "地域学"}
    assert "教養教育科目特別講義(AI基礎)(4限)" in result.report.days["火"]
    assert result.include_failures == {}


@pytest.mark.asyncio
async def test_search_lists_special_lectures_by_subtitle(monkeypatch):
    from app.agents.course_tools import search_courses

    ctx = await _special_ctx(monkeypatch, fx.course("教養教育科目特別講義"))
    found = await search_courses(ctx, keyword="特別講義", catalog=ctx.catalog)

    assert {c["subtitle"] for c in found["courses"]} == {"AI基礎", "地域学"}
    assert all(c["status"].startswith("同じ科目名の別の講義を修得済み") for c in found["courses"])


# --- 合格する前提の科目 ---


def _applied_elective(report):
    return next(c for c in report.requirements if c.slot == "専門応用科目(選択)")


@pytest.mark.asyncio
async def test_registered_course_counts_as_passed_when_filling():
    """成績発表待ちの科目は合格する前提で不足を数える。落ちる前提で埋めると要らない科目まで入る。"""
    ctx = await _ctx(fx.course("統計学", status="registered"))

    applied = next(s for s in ctx.requirements.slots if s.key == "applied.elective")
    assert applied.earned == 2
    assert [c.title for c in ctx.assumed_passes()] == ["統計学"]
    result = _build(ctx)
    assert "統計学" not in _titles(result.courses)
    assert _applied_elective(result.report).before == 2


@pytest.mark.asyncio
async def test_assume_passed_counts_the_course_and_drops_it_from_the_candidates():
    """成績表に載っていない科目も、条件の assume_passed で合格する前提にできる。"""
    ctx = await _ctx()
    assert _applied_elective(_build(ctx).report).before == 0

    conditions = Conditions(assume_passed=["統計学"])
    result = _build(ctx, conditions)

    assert "統計学" not in _titles(result.courses)
    assert _applied_elective(result.report).before == 2
    assert _applied_elective(check_timetable(ctx, result.courses, conditions)).before == 2
    assert "合格する前提で数える科目: 統計学" in conditions.describe()
    # 合格する前提をやめると、また候補に戻る
    assumed = ctx.assuming(["統計学"])
    assert "統計学" not in {c.course.title for c in assumed.candidates}
    assert "統計学" in {c.course.title for c in assumed.assuming([]).candidates}


def _overfilled_courses():
    """画像処理(専門応用・選択 4単位)に合格する前提にすると、2単位余る時間割。"""
    return [
        *_required_courses(),
        _course("哲学", "G000000002", "水", 2, category="選択必修"),
        _course("情報理論", "Y000000005", "月", 3),
        _course("符号理論", "Y000000006", "水", 3),
        _course("統計学", "Y000000011", "火", 3),
        _course("文学", "G000000003", "月", 4),
        _course("音楽", "G000000004", "木", 4),
    ]


@pytest.mark.asyncio
async def test_adjust_drops_a_course_left_over_by_a_course_assumed_passed():
    """合格する前提の科目が増えて要らなくなった科目を、adjust は外す(単位が余るだけになる)。"""
    ctx = await _ctx()
    conditions = Conditions(assume_passed=["画像処理"])
    assert len(check_timetable(ctx, _overfilled_courses(), conditions).surplus) == 1

    result = _build(ctx, conditions, _overfilled_courses(), mode="adjust")

    removed = [s.course.title for s in result.steps if s.kind == "remove"]
    assert len(removed) == 1
    assert removed[0] in {"情報理論", "符号理論", "統計学"}
    assert next(s for s in result.steps if s.kind == "remove").note == "単位が卒業要件に数えられず余るため"
    assert result.report.surplus == []
    # 外しても不足は増えない
    before = {s.slot: s.after for s in check_timetable(ctx, _overfilled_courses(), conditions).requirements}
    after = {s.slot: s.after for s in result.report.requirements}
    assert all(after[slot] >= value for slot, value in before.items())


@pytest.mark.asyncio
async def test_remove_and_broad_scope_keep_the_left_over_course():
    """remove は頼まれた科目だけを外し、広くは上限まで足すので、余る科目を外さない。"""
    ctx = await _ctx()
    for conditions, mode in [
        (Conditions(assume_passed=["画像処理"]), "remove"),
        (Conditions(assume_passed=["画像処理"], scope="広く"), "adjust"),
    ]:
        result = _build(ctx, conditions, _overfilled_courses(), mode=mode)
        assert not any(s.kind == "remove" for s in result.steps)


@pytest.mark.asyncio
async def test_requirements_tell_where_the_credits_of_an_assumed_course_go():
    """学生は単位の行き先で話す(「余剰分だからオールフリーゾーンに入る」)。その行き先を載せる。"""
    from app.timetable.facts import format_requirements

    ctx = (await _ctx(fx.course("情報理論"), fx.course("符号理論"))).assuming(["統計学"])

    lines = format_requirements(ctx.requirements, ctx.assumed_passes())

    assert (
        "合格する前提で数えた科目(成績がまだ出ていない)と、単位の入る要件枠: "
        "統計学(2単位: 学部フリーゾーンに2単位)"
    ) in lines


@pytest.mark.asyncio
async def test_assume_passed_skips_unknown_and_already_passed_courses():
    ctx = await _ctx(fx.course("情報理論"))

    assumed = ctx.assuming(["情報理論", "存在しない科目"])

    assert assumed.assumed == []
    assert assumed is ctx


# --- 組み立ての結果をモデルと学生に伝える ---


@pytest.mark.asyncio
async def test_changes_name_removed_added_and_moved_courses():
    from app.agents.timetable_assistant import timetable_changes

    before = [_course("符号理論", "Y000000006", "水", 3), _course("音楽", "G000000004", "木", 4)]
    after = [_course("音楽", "G000000004", "金", 4), _course("情報理論", "Y000000005", "月", 3)]

    changes = timetable_changes(before, after)

    assert changes.removed == ["符号理論"]
    assert changes.added == ["情報理論"]
    assert changes.moved == {"音楽": "木4→金4"}


def test_failures_skip_courses_that_were_already_excluded():
    """前から入れない科目は、時間割に無くても「外せなかった」にしない(もう外れている)。"""
    from app.agents.timetable_assistant import build_failures

    current = [_course("符号理論", "Y000000006", "水", 3)]
    failed = build_failures(
        current, [], mode="adjust", include=[], exclude=["音楽", "符号理論", "文学"],
        include_failures={}, previous_exclude=["音楽"],
    )

    assert failed == {"文学": "時間割に無い"}


@pytest.mark.asyncio
async def test_assume_passed_must_be_a_curriculum_course():
    """単位と要件枠は履修要項から採るので、履修要項に無い科目はモデルに書き直させる。"""
    from pydantic_ai import ModelRetry

    from app.agents.timetable_assistant import resolve_assumed

    ctx = await _ctx()

    assert resolve_assumed(ctx, ["統計学"]) == ["統計学"]
    with pytest.raises(ModelRetry):
        resolve_assumed(ctx, ["存在しない科目"])
