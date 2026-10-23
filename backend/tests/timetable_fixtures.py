"""時間割の組み立てのテストで共有する、合成の履修要項と開講情報。

実データと同じ要件枠の流れ(選択必修 → 選択 → 学部フリー → オールフリー、
教養 → 教養(選択) → オールフリー)を、科目と単位を小さくして持つ。曜日・時限は
テストが読みやすいよう固定する。

| 科目 | 区分・履修区分 | 単位 | クラス(コード: コマ) |
|---|---|---|---|
| 仏教の思想A | 教養・必修 | 2 | G01: 木2 |
| 哲学 | 教養・選択必修(人文) | 2 | G02: 水2 |
| 文学 | 教養・選択 | 2 | G03: 月4 |
| 音楽 | 教養・選択 | 2 | G04: 木4 |
| 微分積分 | 専門基礎・必修 | 2 | Y01: 月1 |
| 線形代数 | 専門基礎・必修 | 2 | Y02: 火1 / Y03: 水1 |
| 数値解析 | 専門応用・選択必修 | 2 | Y04: 月2 |
| 情報理論 | 専門応用・選択 | 2 | Y05: 月3 |
| 符号理論 | 専門応用・選択 | 2 | Y06: 水3 |
| 画像処理 | 専門応用・選択 | 4 | Y07: 金3・金4 |
| 統計学 | 専門応用・選択 | 2 | Y11: 火3 |
| 有機化学 | 他課程(専門関連) | 2 | Y08: 木3 |
| 後期の科目 | 専門応用・選択 | 2 | Y09: 後期 月5 |
| 他課程指定 | 専門応用・選択 | 2 | Y10: 火2(他課程だけが対象) |
"""

from app.curricula.loader import LoadedCurriculum
from app.curricula.merge import merge
from app.schemas.curriculum import Curriculum, LiberalArtsCurriculum
from app.schemas.offering import Offering
from app.schemas.proposal import CourseSlot, TargetTerm
from app.schemas.student import Course as StudentCourse
from app.schemas.student import StudentProfile
from app.timetable.offerings import Catalog, OfferedClass

ADMISSION_YEAR = 2025
OFFERING_YEAR = 2026
PROGRAM = "テスト課程01"


def _liberal(title: str, subcategory: str, type_: str, **kw) -> dict:
    return {
        "title": title,
        "category": "教養教育科目",
        "subcategory": subcategory,
        "type": type_,
        "credits": 2,
        "grade": 1,
        "term": "前期",
        **kw,
    }


def _major(title: str, category: str, type_: str, credits: int = 2, **kw) -> dict:
    return {
        "title": title,
        "category": category,
        "type": type_,
        "credits": credits,
        "grade": 1,
        "term": "前期",
        **kw,
    }


def liberal_arts() -> LiberalArtsCurriculum:
    return LiberalArtsCurriculum.model_validate(
        {
            "admission_year": ADMISSION_YEAR,
            "liberal_arts_version": "until-2025",
            "requirement_slots": [
                {
                    "key": "liberal.buddhism", "name": "教養教育科目(必修・仏教)",
                    "credits": 2,
                    "accepts": {"subcategory": "「仏教の思想」科目", "type": "必修"},
                },
                {
                    "key": "liberal.humanities", "name": "教養教育科目(選択必修・人文)",
                    "credits": 2,
                    "accepts": {"subcategory": "人文科学系科目", "type": "選択必修"},
                    "overflow_to": "liberal.elective",
                },
                {
                    "key": "liberal.elective", "name": "教養教育科目(選択)",
                    "credits": 4,
                    "accepts": {"category": "教養教育科目"},
                    "overflow_to": "free.all",
                },
            ],
            "courses": [
                _liberal("仏教の思想A", "「仏教の思想」科目", "必修"),
                _liberal("哲学", "人文科学系科目", "選択必修"),
                _liberal("文学", "人文科学系科目", "選択"),
                _liberal("音楽", "人文科学系科目", "選択"),
            ],
        }
    )


def program(code: str = "01", courses: list[dict] | None = None) -> Curriculum:
    return Curriculum.model_validate(
        {
            "program": {"code": code, "name": f"テスト課程{code}"},
            "admission_year": ADMISSION_YEAR,
            "graduation": {"total_credits": 22, "excluded_types": ["随意"]},
            "requirement_slots": [
                {
                    "key": "basic.required", "name": "専門基礎科目(必修)",
                    "credits": 4,
                    "accepts": {"category": "専門基礎科目", "type": "必修"},
                },
                {
                    "key": "applied.selreq", "name": "専門応用科目(選択必修)",
                    "credits": 2,
                    "accepts": {"category": "専門応用科目", "type": "選択必修"},
                    "overflow_to": "applied.elective",
                },
                {
                    "key": "applied.elective", "name": "専門応用科目(選択)",
                    "credits": 4,
                    "accepts": {"category": "専門応用科目", "type": "選択"},
                    "overflow_to": "free.faculty",
                },
                {
                    "key": "related", "name": "専門関連科目",
                    "credits": 0,
                    "accepts": {"category": "専門関連科目"},
                    "overflow_to": "free.faculty",
                },
                {
                    "key": "free.faculty", "name": "学部フリーゾーン",
                    "credits": 2,
                    "accepts": {"category": ["専門基礎科目", "専門応用科目", "専門関連科目"]},
                    "overflow_to": "free.all",
                },
                {"key": "free.all", "name": "オールフリーゾーン", "credits": 2, "accepts": {"category": "any"}},
            ],
            "registration_limits": {
                "by_semester": [
                    {"semesters": [1, 2, 3, 4, 5, 6], "max_credits_per_semester": 22},
                    {"semesters": [7, 8], "max_credits_per_year": 48},
                ],
            },
            "courses": courses
            if courses is not None
            else [
                _major("微分積分", "専門基礎科目", "必修"),
                _major("線形代数", "専門基礎科目", "必修"),
                _major("数値解析", "専門応用科目", "選択必修"),
                _major("情報理論", "専門応用科目", "選択"),
                _major("符号理論", "専門応用科目", "選択"),
                _major("画像処理", "専門応用科目", "選択", credits=4),
                _major("統計学", "専門応用科目", "選択"),
                _major("後期の科目", "専門応用科目", "選択"),
                _major("他課程指定", "専門応用科目", "選択"),
            ],
        }
    )


def other_program(code: str) -> Curriculum:
    """他課程。`courses` は専門関連科目として導出される(§4.4.3 手順2)。"""
    return program(code, courses=[_major("有機化学", "専門応用科目", "選択")])


RESOLVED = {
    "00": {
        "仏教の思想A": ["G000000001"],
        "哲学": ["G000000002"],
        "文学": ["G000000003"],
        "音楽": ["G000000004"],
    },
    "01": {
        "微分積分": ["Y000000001"],
        "線形代数": ["Y000000002", "Y000000003"],
        "数値解析": ["Y000000004"],
        "情報理論": ["Y000000005"],
        "符号理論": ["Y000000006"],
        "画像処理": ["Y000000007"],
        "統計学": ["Y000000011"],
        "後期の科目": ["Y000000009"],
        "他課程指定": ["Y000000010"],
    },
    "02": {"有機化学": ["Y000000008"]},
}


def loaded() -> LoadedCurriculum:
    """課程 01 の学生から見たロード結果。02 の科目は専門関連科目として入る。"""
    main = program("01")
    return LoadedCurriculum(
        curriculum=merge(main, liberal_arts(), [main, other_program("02")]),
        offerings={
            code: Offering.model_validate(
                {
                    "offering_year": OFFERING_YEAR,
                    "admission_year": ADMISSION_YEAR,
                    "program_code": code,
                    "resolved": resolved,
                }
            )
            for code, resolved in RESOLVED.items()
        },
    )


def _class(code: str, title: str, slots: list[tuple[str, int]], term: str = "前期", credits: int = 2) -> OfferedClass:
    first = slots[0] if slots else (None, None)
    return OfferedClass(
        syllabus_code=code,
        course_title=title,
        term=term,
        day_of_week=first[0],
        period=first[1],
        slots=tuple(CourseSlot(term=term, day=d, period=p) for d, p in slots),
        credits=credits,
    )


CLASSES = {
    c.syllabus_code: c
    for c in [
        _class("G000000001", "仏教の思想A", [("木", 2)]),
        _class("G000000002", "哲学", [("水", 2)]),
        _class("G000000003", "文学", [("月", 4)]),
        _class("G000000004", "音楽", [("木", 4)]),
        _class("Y000000001", "微分積分", [("月", 1)]),
        _class("Y000000002", "線形代数", [("火", 1)]),
        _class("Y000000003", "線形代数", [("水", 1)]),
        _class("Y000000004", "数値解析", [("月", 2)]),
        _class("Y000000005", "情報理論", [("月", 3)]),
        _class("Y000000006", "符号理論", [("水", 3)]),
        _class("Y000000007", "画像処理", [("金", 3), ("金", 4)], credits=4),
        _class("Y000000008", "有機化学", [("木", 3)]),
        _class("Y000000009", "後期の科目", [("月", 5)], term="後期"),
        _class("Y000000010", "他課程指定", [("火", 2)]),
        _class("Y000000011", "統計学", [("火", 3)]),
        _class("X000000001", "他学部の科目", [("火", 3)]),
    ]
}


def catalog(classes: dict[str, OfferedClass] | None = None) -> Catalog:
    """課程 01 は Y01〜Y09 が対象、課程 02 は Y08・Y10 が対象。教養は課程指定なし。"""
    return Catalog(
        year=OFFERING_YEAR,
        classes=dict(CLASSES if classes is None else classes),
        program_codes={
            "テスト課程01": frozenset({*(f"Y00000000{i}" for i in range(1, 10)), "Y000000011"}),
            "テスト課程02": frozenset({"Y000000008", "Y000000010"}),
        },
        programs_known=True,
        faculty_codes=frozenset(c for c in CLASSES if not c.startswith("X")),
    )


def target(term: str = "前期", grade: int = 1) -> TargetTerm:
    return TargetTerm(year=OFFERING_YEAR, term=term, grade=grade)


def course(title: str, status: str = "passed", credits: int = 2, year: int = 2025) -> StudentCourse:
    return StudentCourse(title=title, year=year, term="前期", credits=credits, status=status)


def profile(*courses: StudentCourse, grade: int = 1) -> StudentProfile:
    return StudentProfile(grade=grade, program=PROGRAM, completed_courses=list(courses))
