"""学生プロファイルスキーマのテスト。design.md §5.2.1。"""

import pytest
from pydantic import ValidationError

from app.schemas.student import Course, StudentProfile


# --- 正常系 ---

def test_student_profile_camel_case():
    """§5.2.1 形式の camelCase JSON を StudentProfile として受け取れること。"""
    data = {
        "grade": 2,
        "program": "情報工学科",
        "completedCourses": [
            {
                "code": "CS101",
                "title": "プログラミング基礎",
                "year": 2024,
                "term": "前期",
                "credits": 2.0,
                "status": "passed",
                "rawScore": "A",
            }
        ],
    }
    profile = StudentProfile.model_validate(data)
    assert profile.grade == 2
    assert profile.program == "情報工学科"
    assert len(profile.completed_courses) == 1
    course = profile.completed_courses[0]
    assert course.code == "CS101"
    assert course.raw_score == "A"


def test_optional_fields_omitted():
    """code / rawScore 省略のケースが valid であること。"""
    data = {
        "grade": 3,
        "program": None,
        "completedCourses": [
            {
                "title": "データ構造",
                "year": 2023,
                "term": "後期",
                "credits": 2.0,
                "status": "passed",
            }
        ],
    }
    profile = StudentProfile.model_validate(data)
    course = profile.completed_courses[0]
    assert course.code is None
    assert course.raw_score is None


def test_grade_null():
    """grade: null のケースが valid であること。"""
    data = {
        "grade": None,
        "program": None,
        "completedCourses": [],
    }
    profile = StudentProfile.model_validate(data)
    assert profile.grade is None


def test_empty_completed_courses():
    """completedCourses が空リストのケースが valid であること。"""
    data = {"completedCourses": []}
    profile = StudentProfile.model_validate(data)
    assert profile.completed_courses == []


def test_all_term_values():
    """term の全 Literal 値が valid であること。"""
    terms = ["前期", "後期", "通年", "1Q", "2Q", "3Q", "4Q", "サ集"]
    for term in terms:
        course = Course.model_validate(
            {"title": "x", "year": 2024, "term": term, "credits": 1.0, "status": "passed"}
        )
        assert course.term == term


# --- 異常系 ---

def test_invalid_term():
    """不正な term が ValidationError になること。"""
    with pytest.raises(ValidationError):
        Course.model_validate(
            {"title": "x", "year": 2024, "term": "夏季", "credits": 1.0, "status": "passed"}
        )


def test_invalid_status():
    """不正な status が ValidationError になること。"""
    with pytest.raises(ValidationError):
        Course.model_validate(
            {"title": "x", "year": 2024, "term": "前期", "credits": 1.0, "status": "enrolled"}
        )


def test_invalid_grade():
    """不正な grade(5)が ValidationError になること。"""
    with pytest.raises(ValidationError):
        StudentProfile.model_validate({"grade": 5, "completedCourses": []})
