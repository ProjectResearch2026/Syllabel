"""schemas/proposal.py のテスト。"""

import pytest
from pydantic import ValidationError

from app.schemas.proposal import ProposedCourse, TargetTerm, course_clash


def make_course(**kwargs) -> dict:
    base = {
        "title": "情報理論",
        "day": "月",
        "period": 1,
        "term": "前期",
        "credits": 2,
        "reason": "必修科目のため。",
    }
    base.update(kwargs)
    return base


# --- ProposedCourse ---


def test_proposed_course_minimal():
    """必須フィールドのみで生成できる。"""
    c = ProposedCourse(title="プログラミング演習", reason="興味に合致するため。")
    assert c.title == "プログラミング演習"
    assert c.syllabus_code is None
    assert c.day is None
    assert c.period is None


def test_proposed_course_full():
    """全フィールドを指定して生成できる。"""
    c = ProposedCourse(**make_course(syllabus_code="CS101", category="必修"))
    assert c.syllabus_code == "CS101"
    assert c.day == "月"
    assert c.period == 1
    assert c.credits == 2.0


def test_proposed_course_camel_alias():
    """camelCaseキーで入力できる。"""
    c = ProposedCourse.model_validate(
        {"title": "数学", "reason": "基礎科目。", "syllabusCode": "MA001"}
    )
    assert c.syllabus_code == "MA001"


def test_proposed_course_invalid_day():
    """曜日が月〜土以外は ValidationError(api-clean に日曜のクラスは無い)。"""
    with pytest.raises(ValidationError):
        ProposedCourse(**make_course(day="日"))


# --- コマ重複(course_clash)は開講期間(クォーター)の重なりで判定する ---


def clash(a: dict, b: dict) -> bool:
    return course_clash(ProposedCourse(**a), ProposedCourse(**b)) is not None


def test_same_slot_and_term_clash():
    assert clash(make_course(), make_course(title="別の科目"))


def test_different_term_does_not_clash():
    assert not clash(make_course(term="前期"), make_course(title="別の科目", term="後期"))


def test_course_without_day_does_not_clash():
    """曜日・時限の無い科目(集中講義など)は重複を判定しない。"""
    assert not clash(make_course(day=None, period=None), make_course(day=None, period=None))


@pytest.mark.parametrize(
    ("first", "second"),
    [
        ("前期", "1Q"),  # 前期は 1Q・2Q を占める
        ("通年", "後期"),  # 通年は全クォーターを占める
        ("4Q", "後期"),
        ("2Q", "前期"),
        ("１Ｑ", "1Q"),  # 全角の表記ゆれは寄せて比べる
        ("サ集", "サ集"),  # クォーターに属さない学期どうしは文字列が同じなら重複
    ],
)
def test_clash_when_terms_overlap(first, second):
    assert clash(make_course(term=first), make_course(title="別の科目", term=second))


@pytest.mark.parametrize(
    ("first", "second"),
    [("1Q", "2Q"), ("前期", "3Q"), ("前期", "後期"), ("サ集", "前期")],
)
def test_no_clash_when_terms_do_not_overlap(first, second):
    assert not clash(make_course(term=first), make_course(title="別の科目", term=second))


# --- 複数コマの科目は全コマで重複を判定する(slots。§5.3)---


def _slot(term: str, day: str, period: int) -> dict:
    return {"term": term, "day": day, "period": period}


def test_clash_in_second_slot():
    """「後期　金4・金5」の科目と金5の科目は重なる(2026-09-23 の実機で起きた重複)。"""
    network = make_course(
        title="ネットワークシステム・演習", day="金", period=4, term="後期",
        slots=[_slot("後期", "金", 4), _slot("後期", "金", 5)],
    )
    other = make_course(title="クリティカル・シンキング", day="金", period=5, term="後期")
    slot = course_clash(ProposedCourse(**network), ProposedCourse(**other))
    assert (slot.day, slot.period) == ("金", 5)


def test_clash_in_second_term():
    """「3Q　金3、4Q　金3」の科目は、1コマ目の学期(3Q)に無い4Qの金3とも重なる。"""
    assert clash(
        make_course(
            title="記号処理", day="金", period=3, term="3Q",
            slots=[_slot("3Q", "金", 3), _slot("4Q", "金", 3)],
        ),
        make_course(title="進化学", day="金", period=3, term="4Q"),
    )


def test_occupied_slots_falls_back_to_first_slot():
    """slots を持たない科目(旧い提案)は day / period / term の1コマを占める。"""
    course = ProposedCourse(**make_course(day="火", period=2, term="前期"))
    assert [(s.term, s.day, s.period) for s in course.occupied_slots()] == [("前期", "火", 2)]
    assert ProposedCourse(**make_course(day=None, period=None)).occupied_slots() == []


# --- TargetTerm ---


@pytest.mark.parametrize(
    ("grade", "term", "semester"),
    [(1, "前期", 1), (1, "後期", 2), (3, "後期", 6), (4, "前期", 7)],
)
def test_target_term_semester(grade, term, semester):
    """1年前期を1とするセメスター番号(§5.1.2)。"""
    assert TargetTerm(year=2026, term=term, grade=grade).semester == semester


def test_target_term_camel_alias():
    t = TargetTerm.model_validate({"year": 2026, "term": "後期", "grade": 3})
    assert t.term == "後期"
    with pytest.raises(ValidationError):
        TargetTerm.model_validate({"year": 2026, "term": "通年", "grade": 3})


def test_proposed_course_accepts_saturday():
    """土曜のクラス(教職・学芸員課程や教養の特別講義)も曜日を持てる。"""
    assert ProposedCourse(title="職業指導", day="土", period=2, reason="理由。").day == "土"
