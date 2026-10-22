"""展示用ダミー学生プロファイル(`frontend/lib/dummy/profiles.json`)の検査。

生成は `scripts/generate_dummy_profiles.py`(api-clean が要る)で、ここでは生成物が
履修要項と食い違っていないことだけを確かめる。"""

import json
from collections import defaultdict
from pathlib import Path

import pytest

from app.curricula.loader import get_curricula
from app.curricula.titles import normalize_title
from app.settings import get_settings

REPO_ROOT = Path(__file__).resolve().parents[2]
PROFILES = REPO_ROOT / "frontend" / "lib" / "dummy" / "profiles.json"
HALF_INDEX = {"前期": 0, "後期": 1}


@pytest.fixture(scope="module")
def curricula():
    get_curricula.cache_clear()
    get_settings.cache_clear()
    mp = pytest.MonkeyPatch()
    mp.setenv("CURRICULA_DIR", str(REPO_ROOT / "curricula"))
    mp.setenv("OFFERINGS_DIR", str(REPO_ROOT / "offerings"))
    loaded = get_curricula()
    yield loaded
    mp.undo()
    get_curricula.cache_clear()
    get_settings.cache_clear()


@pytest.fixture(scope="module")
def data():
    return json.loads(PROFILES.read_text(encoding="utf-8"))


def test_all_combinations_present(data):
    """課程6 × 学年4 × 学期2 の48件が1件ずつあること。"""
    keys = [(p["programCode"], p["grade"], p["term"]) for p in data["profiles"]]
    assert len(keys) == 48
    assert set(keys) == {
        (code, grade, half)
        for code in ["01", "02", "03", "04", "05", "06"]
        for grade in range(1, 5)
        for half in ("前期", "後期")
    }


def test_first_term_freshmen_have_no_grades(data):
    """1年前期は入学直後で、成績が1件も無いこと。"""
    for p in data["profiles"]:
        if p["grade"] == 1 and p["term"] == "前期":
            assert p["courses"] == []


def test_courses_match_curriculum(data, curricula):
    """科目名・単位が入学年度の履修要項の設置科目と一致し、提案する学期より前であること。"""
    target_year = data["targetYear"]
    for p in data["profiles"]:
        assert p["admissionYear"] == target_year - p["grade"] + 1
        curriculum = curricula[(p["programCode"], p["admissionYear"])].curriculum
        assert p["program"] == curriculum.program.name
        own = {normalize_title(c.title): c for c in curriculum.own_courses}
        target = (target_year, HALF_INDEX[p["term"]])
        for title, year, term, credits, _status in p["courses"]:
            course = own.get(normalize_title(title))
            assert course is not None, f"{p['programCode']} {title} は設置科目にない"
            assert course.credits == credits, title
            assert year >= p["admissionYear"], title
            end = (year, 1 if term == "通年" else HALF_INDEX[term])
            assert end < target, f"{title} {year}{term} は提案する学期より前でない"


def test_courses_carry_status_not_score(data):
    """科目は成績の評価ではなく履修状態で持つこと(design.md §5.2.1)。"""
    statuses = {row[4] for p in data["profiles"] for row in p["courses"]}
    assert statuses <= {"passed", "failed", "withdrawn", "registered"}
    assert "passed" in statuses


def test_registration_limits(data, curricula):
    """学期ごとの登録単位が履修登録制限単位数(CAP)に収まること。通年科目は半分ずつ数える。"""
    for p in data["profiles"]:
        curriculum = curricula[(p["programCode"], p["admissionYear"])].curriculum
        per_semester: dict[int, float] = defaultdict(float)
        for _title, year, term, credits, _status in p["courses"]:
            base = (year - p["admissionYear"]) * 2
            if term == "通年":
                per_semester[base + 1] += credits / 2
                per_semester[base + 2] += credits / 2
            else:
                per_semester[base + 1 + HALF_INDEX[term]] += credits
        for semester, total in per_semester.items():
            for limit in curriculum.registration_limits.by_semester:
                if semester in limit.semesters and limit.max_credits_per_semester:
                    assert total <= limit.max_credits_per_semester, (
                        f"{p['programCode']} {p['grade']}年{p['term']} 第{semester}学期 {total}単位"
                    )


def test_required_courses_taken(data, curricula):
    """修了した学期に配当された必修(前期・後期の科目)を、すべて履修していること。"""
    for p in data["profiles"]:
        curriculum = curricula[(p["programCode"], p["admissionYear"])].curriculum
        taken = {normalize_title(row[0]) for row in p["courses"]}
        done = (p["grade"] - 1) * 2 + HALF_INDEX[p["term"]]  # 修了した学期の数
        for c in curriculum.own_courses:
            if c.type != "必修" or c.term not in HALF_INDEX:
                continue
            semester = (c.grade - 1) * 2 + HALF_INDEX[c.term] + 1
            if semester <= done:
                assert normalize_title(c.title) in taken, (
                    f"{p['programCode']} {p['grade']}年{p['term']} {c.title} を履修していない"
                )
