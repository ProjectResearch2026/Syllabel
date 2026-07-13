"""schemas/proposal.py のテスト。"""

import pytest
from pydantic import ValidationError

from app.schemas.proposal import ProposedCourse, TimetableProposal


def make_course(**kwargs) -> dict:
    base = {
        "title": "情報理論",
        "day": "月",
        "period": 1,
        "term": "前期",
        "credits": 2.0,
        "reason": "必修科目のため。",
    }
    base.update(kwargs)
    return base


def make_proposal(*courses: dict, **kwargs) -> dict:
    base = {
        "courses": list(courses),
        "summary": "バランスの取れた時間割です。",
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
    """曜日が月〜金以外は ValidationError。"""
    with pytest.raises(ValidationError):
        ProposedCourse(**make_course(day="土"))


# --- TimetableProposal ---


def test_timetable_proposal_normal():
    """重複なし2科目で生成できる。"""
    p = TimetableProposal(**make_proposal(
        make_course(day="月", period=1, term="前期"),
        make_course(title="線形代数", day="火", period=2, term="前期", reason="基礎科目。"),
    ))
    assert len(p.courses) == 2


def test_timetable_proposal_total_credits():
    """total_credits を指定できる。"""
    p = TimetableProposal(**make_proposal(
        make_course(),
        total_credits=4.0,
    ))
    assert p.total_credits == 4.0


def test_timetable_proposal_total_credits_none():
    """credits が null の科目を含む場合は total_credits を null にできる。"""
    p = TimetableProposal(**make_proposal(
        make_course(credits=None),
        total_credits=None,
    ))
    assert p.total_credits is None


def test_timetable_proposal_conflict():
    """同じ曜日・時限・学期の科目が2つあると ValidationError。"""
    with pytest.raises(ValidationError, match="コマが重複"):
        TimetableProposal(**make_proposal(
            make_course(day="月", period=1, term="前期"),
            make_course(title="別の科目", day="月", period=1, term="前期", reason="理由。"),
        ))


def test_timetable_proposal_no_conflict_different_term():
    """同じ曜日・時限でも学期が異なれば重複にならない。"""
    p = TimetableProposal(**make_proposal(
        make_course(day="月", period=1, term="前期"),
        make_course(title="別の科目", day="月", period=1, term="後期", reason="理由。"),
    ))
    assert len(p.courses) == 2


def test_timetable_proposal_no_conflict_day_none():
    """day が None の科目は重複チェック対象外。"""
    p = TimetableProposal(**make_proposal(
        make_course(day=None, period=None, term=None),
        make_course(day=None, period=None, term=None, title="集中講義B", reason="理由。"),
    ))
    assert len(p.courses) == 2


def test_timetable_proposal_camel_alias():
    """camelCaseキーで入力できる。"""
    data = {
        "courses": [{"title": "統計学", "reason": "基礎。", "day": "水", "period": 3, "term": "前期"}],
        "totalCredits": 2.0,
        "summary": "1科目提案。",
    }
    p = TimetableProposal.model_validate(data)
    assert p.total_credits == 2.0
