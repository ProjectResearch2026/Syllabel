"""特別に扱う科目(`app/timetable/special.py`)とクラスの配当年次の絞り込み。design.md §7.2.1・§7.2.5。

合成の履修要項に、配当年次に必ず履修登録する科目(フレッシャーズセミナー・理工学のすすめ)と、
クラスごとに配当年次の違う必修を足して確かめる。表は科目名で照合するので、実データと同じ
科目名を使う。
"""

import dataclasses
import random

import pytest

from app.curricula.loader import LoadedCurriculum, get_curricula
from app.curricula.merge import merge
from app.curricula.requirements import normalize_title
from app.schemas.offering import Offering
from app.timetable import context as context_module
from app.timetable.builder import build_timetable
from app.timetable.conditions import Conditions
from app.timetable.context import build_student_context
from app.timetable.report import summarize_report
from app.timetable.special import MUST_REGISTER_REASON, SPECIAL_COURSES, special_lines
import timetable_fixtures as fx


def _graded(code, title, slots, term, grade_min=None, grade_max=None):
    return dataclasses.replace(
        fx._class(code, title, slots, term=term), grade_min=grade_min, grade_max=grade_max
    )


# フレッシャーズセミナー(1年前期・火2)、理工学のすすめ(1年後期・月3。シラバスの配当年次は1年次のみ)、
# 実験(必修・1年前期)は通常クラス(前期 金1・1〜4年次)、再履修クラス(後期 金5・3〜4年次)、
# 後期の通常クラス(後期 金4・1〜4年次)を持つ
_CLASSES = {
    c.syllabus_code: c
    for c in [
        *fx.CLASSES.values(),
        _graded("S000000001", "フレッシャーズセミナー", [("火", 2)], "前期", 1, 4),
        _graded("S000000002", "理工学のすすめ", [("月", 3)], "後期", 1, 1),
        _graded("S000000003", "実験", [("金", 1)], "前期", 1, 4),
        _graded("S000000004", "実験", [("金", 5)], "後期", 3, 4),
        _graded("S000000005", "実験", [("金", 4)], "後期", 1, 4),
    ]
}


_WITHOUT_S5 = {k: v for k, v in _CLASSES.items() if k != "S000000005"}


def _loaded():
    main = fx.program(
        "01",
        courses=[
            fx._major("微分積分", "専門基礎科目", "必修"),
            fx._major("フレッシャーズセミナー", "専門基礎科目", "選択", term="前期"),
            fx._major("理工学のすすめ", "専門基礎科目", "選択", term="後期"),
            fx._major("実験", "専門基礎科目", "必修", term="前期"),
        ],
    )
    resolved = {
        "00": fx.RESOLVED["00"],
        "01": {
            "微分積分": ["Y000000001"],
            "フレッシャーズセミナー": ["S000000001"],
            "理工学のすすめ": ["S000000002"],
            "実験": ["S000000003", "S000000004", "S000000005"],
        },
    }
    return LoadedCurriculum(
        curriculum=merge(main, fx.liberal_arts(), [main]),
        offerings={
            code: Offering.model_validate(
                {
                    "offering_year": fx.OFFERING_YEAR,
                    "admission_year": fx.ADMISSION_YEAR,
                    "program_code": code,
                    "resolved": codes,
                }
            )
            for code, codes in resolved.items()
        },
    )


@pytest.fixture(autouse=True)
def curricula(monkeypatch):
    monkeypatch.setattr(
        context_module, "get_curricula", lambda: {("01", fx.ADMISSION_YEAR): _loaded()}
    )


async def _ctx(*courses, term="前期", grade=1, classes=None):
    classes = _CLASSES if classes is None else classes
    # 検索のツールは対象学部のコードだけを見る。合成のクラス(S…)も対象学部に入れる
    catalog = dataclasses.replace(fx.catalog(classes), faculty_codes=frozenset(classes))
    return await build_student_context(
        fx.profile(*courses, grade=grade),
        "01",
        fx.ADMISSION_YEAR,
        fx.target(term, grade),
        catalog=catalog,
    )


def _build(ctx, conditions=None, seed=0):
    return build_timetable(ctx, conditions or Conditions(), rng=random.Random(seed))


def _placed(result):
    return {c.title: c for c in result.courses}


def _must_register_steps(result):
    return [s.course.title for s in result.steps if s.kind == "must_register"]


# --- 配当年次に必ず履修登録する科目 ---


@pytest.mark.asyncio
async def test_must_register_course_is_placed_in_its_grade_and_term():
    """1年前期はフレッシャーズセミナー、1年後期は理工学のすすめを、必修の後に必ず置く。"""
    early = _build(await _ctx())
    late = _build(await _ctx(fx.course("フレッシャーズセミナー"), term="後期"))

    assert _placed(early)["フレッシャーズセミナー"].reason == MUST_REGISTER_REASON
    assert _must_register_steps(early) == ["フレッシャーズセミナー"]
    assert _placed(late)["理工学のすすめ"].reason == MUST_REGISTER_REASON
    assert _must_register_steps(late) == ["理工学のすすめ"]
    # 必修ではない(学生にとっての履修区分は選択のまま)
    assert _placed(early)["フレッシャーズセミナー"].category == "選択"


@pytest.mark.asyncio
async def test_summary_explains_must_register_course_and_stays_short():
    """希望条件なしの説明は、必ず履修登録する科目を入れた理由を書き、上限・不足・候補を書かない。"""
    result = _build(await _ctx())
    message = summarize_report(result.report, result.courses)

    assert message.startswith(f"時間割を組みました。{len(result.courses)}科目・")
    assert (
        "- フレッシャーズセミナーは必修科目ではありませんが、"
        "必ず履修登録しなければならない科目のため入れています。"
    ) in message
    for word in ("登録できる単位", "不足", "候補", "コマまで"):
        assert word not in message

    # 曜日・時限が未定の科目は、表の下の欄に入れたことと日程の確認が要ることを1行で書く
    loose = result.courses[0].model_copy(update={"title": "集中の科目", "slots": [], "day": None, "period": None})
    assert not loose.occupied_slots()
    message = summarize_report(result.report, [*result.courses, loose])
    assert (
        "- 集中の科目はシラバスに曜日・時限が載っていないため、"
        "表の下の「曜日・時限未定」に入れています。日程は別途確認が必要です。"
    ) in message


@pytest.mark.asyncio
async def test_must_register_course_is_not_forced_outside_its_grade():
    """配当年次を過ぎた学年では、必ず置く対象にしない(不足を埋める候補としては残る)。"""
    result = _build(await _ctx(grade=2))

    assert _must_register_steps(result) == []
    placed = _placed(result).get("フレッシャーズセミナー")
    assert placed is None or placed.reason != MUST_REGISTER_REASON


@pytest.mark.asyncio
async def test_failed_must_register_course_is_not_placed_automatically():
    """不合格のあとの再履修は、必修でない科目と同じく自動では入れない。"""
    result = _build(
        await _ctx(fx.course("フレッシャーズセミナー"), fx.course("理工学のすすめ", status="failed"), term="後期")
    )

    assert "理工学のすすめ" not in _placed(result)


@pytest.mark.asyncio
async def test_must_register_course_gives_way_to_a_required_course():
    """必修とコマが重なるときは必修を優先し、置かなかったことを確かめることに載せる。"""
    classes = dict(_CLASSES)
    classes["Y000000001"] = fx._class("Y000000001", "微分積分", [("火", 2)])  # フレッシャーズセミナーと同じ火2
    result = _build(await _ctx(classes=classes))

    assert "微分積分" in _placed(result)
    assert "フレッシャーズセミナー" not in _placed(result)
    assert any(
        "フレッシャーズセミナー" in item and "重なる" in item
        for item in result.report.needs_confirmation
    )


@pytest.mark.asyncio
async def test_must_register_course_is_left_out_of_a_required_only_timetable():
    """必修だけで組むときは入れず、条件の「必修だけを入れる」を満たしたままにする。"""
    result = _build(await _ctx(), Conditions(scope="必修のみ"))

    assert "フレッシャーズセミナー" not in _placed(result)
    assert any("フレッシャーズセミナー" in item for item in result.report.needs_confirmation)
    status = next(c for c in result.report.conditions if c.condition == "必修だけを入れる")
    assert status.status == "met"


@pytest.mark.asyncio
async def test_must_register_course_is_removed_when_the_student_asks():
    """入れない科目に指定されたら外し、履修登録しなくてよいか確かめるよう書く。"""
    from app.agents.timetable_assistant import build_failures

    result = _build(await _ctx(), Conditions(exclude=["フレッシャーズセミナー"]))

    assert "フレッシャーズセミナー" not in _placed(result)
    assert any(
        "フレッシャーズセミナー" in item and "履修登録しなくてよいか" in item
        for item in result.report.needs_confirmation
    )
    failed = build_failures(
        [], result.courses, mode="rebuild", include=[], exclude=["フレッシャーズセミナー"],
        include_failures={},
    )
    assert failed == {}


@pytest.mark.asyncio
async def test_must_register_course_breaks_a_free_day_like_a_required_course():
    """全休の曜日にしかクラスが無ければ、必修と同じく条件を破って置き、破ったことを残す。"""
    result = _build(await _ctx(), Conditions(free_days=["火"]))

    assert _placed(result)["フレッシャーズセミナー"].day == "火"
    status = next(c for c in result.report.conditions if c.condition == "火曜を全休にする")
    assert status.status == "unmet"
    assert "必ず履修登録するフレッシャーズセミナー" in status.detail


@pytest.mark.asyncio
async def test_must_register_course_is_not_displaced_by_an_include(monkeypatch):
    """入れたい科目のために外さない(外してよい科目に数えない)。"""
    classes = dict(_CLASSES)
    classes["Y000000006"] = fx._class("Y000000006", "符号理論", [("火", 2)])
    loaded = _loaded()
    loaded.offerings["01"].resolved["符号理論"] = ["Y000000006"]
    main = fx.program(
        "01",
        courses=[
            fx._major("微分積分", "専門基礎科目", "必修"),
            fx._major("フレッシャーズセミナー", "専門基礎科目", "選択", term="前期"),
            fx._major("符号理論", "専門応用科目", "選択"),
        ],
    )
    loaded = dataclasses.replace(loaded, curriculum=merge(main, fx.liberal_arts(), [main]))
    monkeypatch.setattr(context_module, "get_curricula", lambda: {("01", fx.ADMISSION_YEAR): loaded})
    result = _build(await _ctx(classes=classes), Conditions(include=["符号理論"]))

    assert _placed(result)["フレッシャーズセミナー"].reason == MUST_REGISTER_REASON
    assert "符号理論" not in _placed(result)
    assert "フレッシャーズセミナー" in result.include_failures["符号理論"]


# --- クラスの配当年次 ---


@pytest.mark.asyncio
async def test_retake_class_for_upper_grades_is_not_offered_to_second_years():
    """3〜4年次向けの再履修クラスは、2年生の再履修者には置かない。入れたいと言われても理由を返す。"""
    ctx = await _ctx(fx.course("実験", status="failed"), term="後期", grade=2, classes=_WITHOUT_S5)
    result = _build(ctx)
    asked = _build(ctx, Conditions(include=["S000000004"]))

    assert "実験" not in _placed(result)
    assert "実験" not in _placed(asked)
    assert "3年次～4年次" in asked.include_failures["S000000004"]


@pytest.mark.asyncio
async def test_retake_class_for_upper_grades_is_offered_to_third_years():
    result = _build(await _ctx(fx.course("実験", status="failed"), term="後期", grade=3, classes=_WITHOUT_S5))

    assert _placed(result)["実験"].syllabus_code == "S000000004"


@pytest.mark.asyncio
async def test_class_grade_is_ignored_for_courses_in_the_table():
    """理工学のすすめはシラバスの配当年次が1年次だけでも、2年次以降の再履修で入れられる。"""
    ctx = await _ctx(
        fx.course("フレッシャーズセミナー"), fx.course("理工学のすすめ", status="failed"),
        term="後期", grade=2,
    )
    result = _build(ctx, Conditions(include=["理工学のすすめ"]))

    assert _placed(result)["理工学のすすめ"].syllabus_code == "S000000002"


@pytest.mark.asyncio
async def test_class_without_grade_is_kept():
    """配当年次の分からないクラスは落とさない(合成データの既存の科目は配当年次を持たない)。"""
    result = _build(await _ctx(grade=4))

    assert "微分積分" in _placed(result)


# --- モデルに渡す節 ---


@pytest.mark.asyncio
async def test_special_lines_come_from_the_table_and_curriculum():
    ctx = await _ctx()
    builds = special_lines(ctx, builds=True)
    chat = special_lines(ctx, builds=False)

    assert builds[0].startswith("配当年次に必ず履修登録する科目:")
    assert "- フレッシャーズセミナー(1年前期)" in builds
    assert any(line.startswith("- 理工学のすすめ(1年後期): 不合格でも2年次以降に再履修できる") for line in builds)
    # シラバスのチャットは時間割を組まないので、別の画面の機能として書く
    assert "時間割の画面の、時間割を組む機能" in chat[0]
    assert "時間割の画面の" not in builds[0]
    # 置かない場合を、組み立ての動き(_place_must_register)と同じだけ挙げる
    for case in ("必修や学生が入れた科目とコマが重なる", "登録できる単位を超える", "必修だけで組む"):
        assert case in builds[0]


def test_special_titles_exist_in_every_curriculum():
    """表の科目名が全コホート・全課程の履修要項にあること(科目名が変わると黙って効かなくなる)。"""
    titles = {normalize_title(c.title) for c in SPECIAL_COURSES}
    for (code, year), loaded in get_curricula().items():
        own = {normalize_title(c.title) for c in loaded.curriculum.courses if c.own}
        assert titles <= own, f"{code}/{year}: {titles - own}"


@pytest.mark.asyncio
async def test_include_of_a_class_outside_the_grade_uses_another_class_of_the_course():
    """学年の対象外のクラスのコードを渡されても、同じ科目の学年に合うクラスで入れる。
    必修で既に別のクラスが入っているときは、入れられなかったことにしない。"""
    from app.agents.timetable_assistant import build_failures

    ctx = await _ctx(fx.course("実験", status="failed"), term="後期", grade=2)
    result = _build(ctx, Conditions(include=["S000000004"]))

    assert _placed(result)["実験"].syllabus_code == "S000000005"
    assert result.include_failures == {}
    failed = build_failures(
        [], result.courses, mode="rebuild", include=["S000000004"], exclude=[],
        include_failures=result.include_failures, include_placed=result.include_placed,
    )
    assert failed == {}


@pytest.mark.asyncio
async def test_search_prefers_a_class_the_student_can_register_for():
    """検索の代表のクラスは学年に合うクラスにし、学年の対象外のクラスは registrable を偽にする。"""
    from app.agents.course_tools import search_courses

    # 学年の対象外のクラス(3〜4年次)を曜日の最も早いコマに置き、並べ替えだけでは後ろに来ないようにする
    classes = dict(_CLASSES)
    classes["S000000004"] = _graded("S000000004", "実験", [("月", 1)], "後期", 3, 4)
    ctx = await _ctx(fx.course("実験", status="failed"), term="後期", grade=2, classes=classes)
    result = await search_courses(ctx, keyword="実験", include_taken=True)
    entry = next(c for c in result["courses"] if c["title"] == "実験")

    assert entry["registrable"] is True
    assert entry["code"] in ("S000000003", "S000000005")
    assert entry["code"] != "S000000004"

    only_upper = await _ctx(
        fx.course("実験", status="failed"), term="後期", grade=2,
        classes={k: v for k, v in _CLASSES.items() if k not in ("S000000003", "S000000005")},
    )
    hidden = await search_courses(only_upper, keyword="実験", include_taken=True)
    shown = await search_courses(only_upper, keyword="実験", include_taken=True, only_registrable=False)
    assert all(c["title"] != "実験" for c in hidden["courses"])
    assert next(c for c in shown["courses"] if c["title"] == "実験")["registrable"] is False


@pytest.mark.asyncio
async def test_retake_blocked_only_by_class_grade_is_reported():
    """再履修の必修が配当年次だけで入らないときは、確かめることと【再履修する必修】に書く。"""
    from app.timetable.facts import retake_lines

    ctx = await _ctx(fx.course("実験", status="failed"), term="後期", grade=2, classes=_WITHOUT_S5)
    result = _build(ctx)

    assert any(
        "再履修の必修の「実験」" in item and "3年次～4年次" in item
        for item in result.report.needs_confirmation
    )
    assert any("実験" in line and "3年次～4年次が対象" in line for line in retake_lines(ctx))


@pytest.mark.asyncio
async def test_must_register_course_placed_by_an_older_build_is_kept_on_adjust():
    """前の組み立てで不足を埋める科目として入った理工学のすすめも、調整で外してよい科目にしない。"""
    from app.schemas.proposal import CourseSlot, ProposedCourse

    ctx = await _ctx(fx.course("フレッシャーズセミナー"), term="後期")
    old = ProposedCourse(
        syllabus_code="S000000002", title="理工学のすすめ", day="月", period=3, term="後期",
        slots=[CourseSlot(term="後期", day="月", period=3)], credits=2, category="選択",
        reason="専門基礎科目(選択)の不足を埋める", source="assistant",
    )
    result = build_timetable(ctx, Conditions(), [old], mode="adjust", rng=random.Random(0))

    placed = _placed(result)["理工学のすすめ"]
    assert placed.reason == MUST_REGISTER_REASON
    assert "理工学のすすめ" not in {e.course for e in result.report.removal_effects}
