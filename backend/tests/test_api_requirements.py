"""`POST /api/requirements` のテスト。design.md §6.1 / §4.4.5。

判定そのものの検証は `test_curricula_requirements.py` が担う。ここでは HTTP の
口としての振る舞い(本文の受け取り、camelCase のレスポンス、404 / 400、
成績情報をキャッシュさせないヘッダ)を確かめる。最小構成の YAML を `tmp_path` に
組む経路と、リポジトリの実データで 02 / 2024 を引く経路の2本立てとする
(`test_api_curricula.py` と同じ構成)。
"""

from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

import app.api.curricula as curricula_api
from app.curricula.loader import get_curricula
from app.main import app
from app.settings import get_settings

client = TestClient(app)

REPO_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(autouse=True)
def clear_caches():
    """履修要項はプロセス内にキャッシュするためテストごとに捨てる。"""

    def _clear():
        get_curricula.cache_clear()
        get_settings.cache_clear()
        curricula_api.clear_payload_cache()

    _clear()
    yield
    _clear()


# --- 最小構成の YAML ---


def _liberal_arts() -> dict:
    return {
        "admission_year": 2024,
        "liberal_arts_version": "until-2025",
        "requirement_slots": [
            {
                "key": "liberal.elective", "name": "liberal.elective",
                "credits": 4,
                "accepts": {"category": "教養教育科目"},
                "overflow_to": "free.all",
            }
        ],
        "courses": [
            {
                "title": "哲学",
                "category": "教養教育科目",
                "subcategory": "人文科学系科目",
                "type": "選択",
                "credits": 2,
                "grade": 1,
                "term": "前期",
                "quarters": ["1Q", "2Q"],
            }
        ],
    }


def _program(code: str = "01") -> dict:
    return {
        "program": {"code": code, "name": f"テスト課程{code}"},
        "admission_year": 2024,
        "graduation": {"total_credits": 12, "excluded_types": ["随意"]},
        "tracks": [
            {
                "key": "math",
                "name": "数学系コース",
                "constraints": [
                    {
                        "slot": "applied.elective",
                        "track_group": "数学系",
                        "pool": 4,
                        "min": 4,
                    }
                ],
            }
        ],
        "requirement_slots": [
            {
                "key": "basic.required", "name": "basic.required",
                "credits": 4,
                "accepts": {"category": "専門基礎科目", "type": "必修"},
            },
            {
                "key": "applied.elective", "name": "applied.elective",
                "credits": 2,
                "accepts": {"category": "専門応用科目", "type": "選択"},
                "overflow_to": "free.all",
            },
            {"key": "free.all", "name": "free.all", "credits": 2, "accepts": {"category": "any"}},
        ],
        "registration_limits": {
            "by_semester": [{"semesters": [1, 2], "max_credits_per_semester": 22}]
        },
        "courses": [
            {
                "title": "微分積分",
                "category": "専門基礎科目",
                "type": "必修",
                "credits": 4,
                "grade": 1,
                "term": "通年",
            },
            {
                "title": "解析学",
                "category": "専門応用科目",
                "type": "選択",
                "track_groups": ["数学系"],
                "credits": 2,
                "grade": 2,
                "term": "前期",
                "quarters": ["1Q", "2Q"],
            },
            {
                "title": "教職実習",
                "category": "専門応用科目",
                "type": "随意",
                "credits": 2,
                "grade": 3,
                "term": "前期",
                "quarters": ["1Q", "2Q"],
            },
        ],
    }


@pytest.fixture
def minimal(tmp_path, monkeypatch):
    """最小構成の `curricula/` を `tmp_path` に組み、`Settings` を差し替える。"""
    cohort = tmp_path / "curricula" / "admission-2024"
    cohort.mkdir(parents=True)
    (cohort / "00-liberal-arts.yaml").write_text(
        yaml.safe_dump(_liberal_arts(), allow_unicode=True), encoding="utf-8"
    )
    (cohort / "01-test.yaml").write_text(
        yaml.safe_dump(_program(), allow_unicode=True), encoding="utf-8"
    )
    monkeypatch.setenv("CURRICULA_DIR", str(tmp_path / "curricula"))
    monkeypatch.setenv("OFFERINGS_DIR", str(tmp_path / "offerings"))
    get_settings.cache_clear()
    get_curricula.cache_clear()
    yield


def _body(courses: list[dict], *, program: str | None = "01", track: str | None = None) -> dict:
    return {
        "profile": {"grade": 2, "program": program, "completedCourses": courses},
        "admissionYear": 2024,
        "track": track,
    }


def _passed(title: str, credits: float = 2.0) -> dict:
    return {
        "title": title,
        "year": 2024,
        "term": "前期",
        "credits": credits,
        "status": "passed",
    }


# --- 最小構成の YAML を使う経路 ---


def test_returns_slot_status(minimal):
    response = client.post("/api/requirements", json=_body([_passed("微分積分", 4.0)]))
    assert response.status_code == 200
    body = response.json()
    assert body["programCode"] == "01"
    assert body["admissionYear"] == 2024
    assert body["totalCredits"] == 12
    assert body["earnedCredits"] == 4
    assert body["remainingCredits"] == 8
    assert body["satisfied"] is False
    slots = {s["key"]: s for s in body["slots"]}
    assert slots["basic.required"]["earned"] == 4
    assert slots["basic.required"]["shortfall"] == 0
    assert slots["basic.required"]["courses"] == [{"title": "微分積分", "credits": 4}]
    assert slots["applied.elective"]["shortfall"] == 2


def test_response_is_camel_case(minimal):
    body = client.post("/api/requirements", json=_body([])).json()
    assert set(body) == {
        "programCode",
        "admissionYear",
        "totalCredits",
        "earnedCredits",
        "remainingCredits",
        "satisfied",
        "slots",
        "track",
        "trackConstraints",
        "availableTracks",
        "uncounted",
    }
    assert body["availableTracks"] == [{"key": "math", "name": "数学系コース"}]
    assert set(body["slots"][0]) == {
        "key",
        "required",
        "earned",
        "shortfall",
        "notes",
        "courses",
    }


def test_only_passed_courses_are_counted(minimal):
    courses = [
        _passed("微分積分", 4.0),
        {
            "title": "解析学",
            "year": 2024,
            "term": "前期",
            "credits": 2,
            "status": "failed",
        },
    ]
    body = client.post("/api/requirements", json=_body(courses)).json()
    assert body["earnedCredits"] == 4
    assert body["uncounted"] == []


def test_excluded_type_is_reported(minimal):
    body = client.post("/api/requirements", json=_body([_passed("教職実習")])).json()
    assert body["earnedCredits"] == 0
    assert body["uncounted"] == [
        {"title": "教職実習", "credits": 2, "reason": "excluded_type"}
    ]


def test_track_constraints(minimal):
    body = client.post(
        "/api/requirements", json=_body([_passed("解析学")], track="math")
    ).json()
    assert body["track"] == "math"
    assert body["trackConstraints"] == [
        {
            "slot": "applied.elective",
            "trackGroup": "数学系",
            "pool": 4,
            "required": 4,
            "earned": 2,
            "shortfall": 2,
        }
    ]


def test_unknown_track_is_400(minimal):
    response = client.post(
        "/api/requirements", json=_body([], track="no-such-track")
    )
    assert response.status_code == 400
    assert "no-such-track" in response.json()["detail"]


def test_unknown_program_is_404(minimal):
    response = client.post("/api/requirements", json=_body([], program="99"))
    assert response.status_code == 404
    assert "99" in response.json()["detail"]


def test_missing_program_is_400(minimal):
    response = client.post("/api/requirements", json=_body([], program=None))
    assert response.status_code == 400


def test_invalid_body_is_422(minimal):
    assert client.post("/api/requirements", json={"profile": {}}).status_code == 422
    bad_status = _body([{**_passed("微分積分"), "status": "unknown"}])
    assert client.post("/api/requirements", json=bad_status).status_code == 422


def test_response_is_not_cacheable(minimal):
    """成績情報を含むため、ブラウザにも中間経路にも残させない(§4.2.3)。"""
    response = client.post("/api/requirements", json=_body([]))
    assert response.headers["cache-control"] == "no-store"
    assert "etag" not in response.headers


def test_grade_report_is_not_logged(minimal, caplog):
    """学生プロファイルをログに記録しない(§4.2.3)。"""
    with caplog.at_level("DEBUG"):
        client.post("/api/requirements", json=_body([_passed("微分積分", 4.0)]))
    assert "微分積分" not in caplog.text


def test_get_is_not_allowed(minimal):
    """成績情報を URL に載せないため `GET` は生やさない(§4.4.5)。"""
    assert client.get("/api/requirements").status_code == 405


# --- 実データ(完了条件) ---


@pytest.fixture
def real_data(monkeypatch):
    monkeypatch.setenv("CURRICULA_DIR", str(REPO_ROOT / "curricula"))
    monkeypatch.setenv("OFFERINGS_DIR", str(REPO_ROOT / "offerings"))
    get_settings.cache_clear()
    get_curricula.cache_clear()
    yield


def test_real_data_program_02_2024(real_data):
    """知能情報メディア課程 2024年度入学に手組みの学生ケースを与える。"""
    courses = [
        _passed("仏教の思想A"),
        _passed("仏教の思想B"),
        _passed("英語総合1（A）", 1.0),
        _passed("哲学入門"),  # 人文科学系の基幹科目(選択必修)
        _passed("歎異抄の思想Ⅰ"),  # 「仏教の思想」科目の選択 → 教養選択へ
        _passed("情報基礎"),  # 専門基礎科目の必修
        _passed("他学部の科目"),
    ]
    response = client.post("/api/requirements", json=_body(courses, program="02"))
    assert response.status_code == 200
    body = response.json()
    assert body["programCode"] == "02"
    assert body["totalCredits"] == 124
    slots = {s["key"]: s for s in body["slots"]}
    assert slots["liberal.buddhism"]["earned"] == 4
    assert slots["liberal.buddhism"]["shortfall"] == 0
    assert slots["liberal.language.required"]["earned"] == 1
    assert slots["liberal.language.required"]["shortfall"] == 5
    assert slots["liberal.general.humanities"]["earned"] == 2
    assert slots["liberal.general.humanities"]["shortfall"] == 0
    assert slots["liberal.elective"]["earned"] == 2  # 歎異抄の思想Ⅰ
    assert slots["basic.required"]["earned"] == 2
    assert body["earnedCredits"] == pytest.approx(11.0)
    assert body["remainingCredits"] == pytest.approx(113.0)
    assert body["uncounted"] == [
        {"title": "他学部の科目", "credits": 2, "reason": "not_in_curriculum"}
    ]
