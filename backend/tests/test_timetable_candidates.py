"""候補の科目・開講クラスの結び付け・履修可否・先修条件のテスト。design.md §6.1 / §7.2。

実サーバ(api-clean)には接続しない。手組みの合成カリキュラム
(`test_curricula_requirements.py` と同じ構成を小さくしたもの)に手組みの学生ケースを
与えて確かめる。
"""

from functools import lru_cache

import pytest

from app.curricula.loader import LoadedCurriculum
from app.curricula.merge import MergedCurriculum, merge
from app.schemas.curriculum import Curriculum, LiberalArtsCurriculum, Prerequisite
from app.schemas.offering import Offering
from app.schemas.proposal import TargetTerm
from app.schemas.student import Course as StudentCourse
from app.schemas.student import StudentProfile
from app.timetable.candidates import (
    Candidate,
    attach_offerings,
    check_prerequisite,
    check_prerequisites,
    retake_titles,
    select_candidates,
)
from app.timetable.errors import ContextError
from app.timetable.offerings import Eligibility, OfferedClass, registration_half

ADMISSION_YEAR = 2024
OFFERING_YEAR = 2026



# --- 合成カリキュラム ---
#
# `test_curricula_requirements.py` と同じスロット構成(カスケード3系統)を保ったまま
# 単位数を小さくする。要件枠の `credits` の合計は `graduation.total_credits` に
# 一致させること(マージ時に検査される。§4.4.3)。


def _liberal_course(title: str, subcategory: str, type_: str, **kw) -> dict:
    return {
        "title": title,
        "category": "教養教育科目",
        "subcategory": subcategory,
        "type": type_,
        "credits": 2,
        "grade": 1,
        "term": "前期",
        "quarters": ["1Q", "2Q"],
        **kw,
    }


def _major_course(title: str, category: str, type_: str, grade: int = 1, **kw) -> dict:
    return {
        "title": title,
        "category": category,
        "type": type_,
        "credits": 2,
        "grade": grade,
        "term": "前期",
        "quarters": ["1Q", "2Q"],
        **kw,
    }


def _liberal_arts() -> LiberalArtsCurriculum:
    return LiberalArtsCurriculum.model_validate(
        {
            "admission_year": ADMISSION_YEAR,
            "liberal_arts_version": "until-2025",
            "requirement_slots": [
                {
                    "key": "liberal.buddhism", "name": "liberal.buddhism",
                    "credits": 2,
                    "accepts": {"subcategory": "「仏教の思想」科目", "type": "必修"},
                },
                {
                    "key": "liberal.elective", "name": "liberal.elective",
                    "credits": 4,
                    "accepts": {"category": "教養教育科目"},
                    "overflow_to": "free.all",
                },
            ],
            "courses": [
                _liberal_course("仏教の思想A", "「仏教の思想」科目", "必修"),
                _liberal_course("哲学", "人文科学系科目", "選択"),
                _liberal_course("英語総合1", "必修外国語科目", "必修"),
                _liberal_course("教職概論", "人文科学系科目", "随意"),
                _liberal_course("不開講の教養", "自然科学系科目", "選択"),
            ],
        }
    )


def _program(code: str = "01") -> Curriculum:
    return Curriculum.model_validate(
        {
            "program": {"code": code, "name": f"テスト課程{code}"},
            "admission_year": ADMISSION_YEAR,
            "graduation": {"total_credits": 16, "excluded_types": ["随意"]},
            "tracks": [
                {
                    "key": "info",
                    "name": "情報コース",
                    "constraints": [
                        {
                            "slot": "applied.elective",
                            "track_group": "情報系",
                            "pool": 2,
                            "min": 2,
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
                    "overflow_to": "free.faculty",
                },
                {
                    "key": "related", "name": "related",
                    "credits": 0,
                    "accepts": {"category": "専門関連科目"},
                    "overflow_to": "free.faculty",
                },
                {
                    "key": "free.faculty", "name": "free.faculty",
                    "credits": 2,
                    "accepts": {
                        "category": ["専門基礎科目", "専門応用科目", "専門関連科目"]
                    },
                    "overflow_to": "free.all",
                },
                {"key": "free.all", "name": "free.all", "credits": 2, "accepts": {"category": "any"}},
            ],
            "registration_limits": {
                "by_semester": [
                    {"semesters": [1, 2], "max_credits_per_semester": 22},
                    {"semesters": [7, 8], "max_credits_per_year": 48},
                ],
                "notes": "通年科目は前期・後期で2分割して計算する。",
                "gpa_exception": "累積GPA3.5以上は申請により2単位まで拡大できる。",
            },
            "courses": [
                _major_course("微分積分", "専門基礎科目", "必修"),
                _major_course("線形代数", "専門基礎科目", "必修"),
                _major_course("数値解析", "専門応用科目", "選択", grade=2,
                              track_groups=["情報系"]),
                _major_course("教職実習", "専門応用科目", "随意"),
                _major_course("不開講の専門", "専門応用科目", "選択"),
            ],
        }
    )


def _other_program(code: str) -> Curriculum:
    """他課程。`courses` は専門関連科目として導出される(§4.4.3 手順2)。"""
    other = _program(code).model_dump()
    other["tracks"] = None
    other["courses"] = [_major_course("有機化学", "専門応用科目", "選択")]
    return Curriculum.model_validate(other)


def _offering(program_code: str, resolved: dict[str, list[str]]) -> Offering:
    return Offering.model_validate(
        {
            "offering_year": OFFERING_YEAR,
            "admission_year": ADMISSION_YEAR,
            "program_code": program_code,
            "resolved": resolved,
            # 不開講・名寄せ未解決の科目はコードを持たない(§5.1.4)
            "not_offered": [{"title": "不開講の専門", "reason": "2026年度は開講しない"}],
        }
    )


@lru_cache
def _loaded() -> LoadedCurriculum:
    """課程 01 の学生から見たロード結果。02・03 の科目は専門関連科目として入る。"""
    program = _program("01")
    others = [program, _other_program("02"), _other_program("03")]
    return LoadedCurriculum(
        curriculum=merge(program, _liberal_arts(), others),
        offerings={
            "00": _offering(
                "00",
                {
                    "仏教の思想A": ["G000000001", "G000000002"],
                    "哲学": ["G000000003"],
                    "英語総合1": ["G000000004"],
                    "教職概論": ["G000000005"],
                },
            ),
            "01": _offering(
                "01",
                {
                    "微分積分": ["Y000000001"],
                    "線形代数": ["Y000000002"],
                    "数値解析": ["Y000000003"],
                    "教職実習": ["Y000000004"],
                },
            ),
            "02": _offering("02", {"有機化学": ["Y000000005"]}),
            "03": _offering("03", {"有機化学": ["Y000000006"]}),
        },
    )


def _profile(grade: int = 1, **kw) -> StudentProfile:
    return StudentProfile(grade=grade, program="01", **kw)


def _passed(title: str) -> StudentCourse:
    return StudentCourse(
        title=title, year=2024, term="前期", credits=2, status="passed"
    )


def _offered(code: str, day: str | None = "月", period: int | None = 1) -> OfferedClass:
    return OfferedClass(
        syllabus_code=code,
        course_title="テスト科目",
        term="前期",
        day_of_week=day,
        period=period,
        room="1-101",
    )


def _titles(candidates) -> list[str]:
    return [c.course.title for c in candidates]




def _registered(title: str) -> StudentCourse:
    return StudentCourse(title=title, year=2026, term="後期", credits=2, status="registered")


def _offered_in(code: str, term: str | None, day: str = "月", period: int = 1) -> OfferedClass:
    return OfferedClass(
        syllabus_code=code, course_title="テスト科目", term=term, day_of_week=day, period=period
    )


# ---------------------------------------------------------------------------
# 候補の科目(§7.2)
# ---------------------------------------------------------------------------


def test_select_candidates_excludes_zui_i_and_higher_grade():
    """`随意` と配当年次が学年を超える科目は候補にしない(§5.1.5)。"""
    titles = _titles(select_candidates(_loaded(), _profile(grade=1)))

    assert "教職実習" not in titles  # 随意(専攻科目)
    assert "教職概論" not in titles  # 随意(教養教育科目)
    assert "数値解析" not in titles  # 配当2年
    assert "微分積分" in titles


def test_select_candidates_includes_courses_from_allocation_grade_onward():
    """配当年次は「この年次から履修可能」であり、上級生にも候補として残る(§5.1.5)。"""
    titles = _titles(select_candidates(_loaded(), _profile(grade=2)))

    assert "数値解析" in titles
    assert "微分積分" in titles


def test_select_candidates_excludes_completed_courses():
    """既修得(合格)の科目は候補から外す。表記ゆれは正規化して突合する(§5.1.5)。"""
    profile = _profile(completed_courses=[_passed("微分積分"), _passed("英語総合１")])
    titles = _titles(select_candidates(_loaded(), profile))

    assert "微分積分" not in titles
    assert "英語総合1" not in titles  # 全角の「１」で突合できる
    assert "線形代数" in titles


def test_select_candidates_keeps_failed_courses_as_retakes():
    """不合格・履修辞退は未修得であり、再履修の候補として残す(要件§4.2)。"""
    completed = [
        StudentCourse(title="微分積分", year=2024, term="前期", credits=2, status="failed"),
        StudentCourse(title="線形代数", year=2024, term="前期", credits=2, status="withdrawn"),
    ]
    titles = _titles(select_candidates(_loaded(), _profile(completed_courses=completed)))

    assert "微分積分" in titles
    assert "線形代数" in titles
    assert retake_titles(completed) == {"微分積分", "線形代数"}


def test_retake_titles_ignore_courses_passed_later():
    completed = [
        StudentCourse(title="微分積分", year=2024, term="前期", credits=2, status="failed"),
        StudentCourse(title="微分積分", year=2025, term="前期", credits=2, status="passed"),
    ]
    assert retake_titles(completed) == set()


def test_select_candidates_excludes_registered_courses():
    """登録済み(成績未確定)の科目は入れない。再履修の候補にもしない(§5.2.1)。"""
    titles = _titles(select_candidates(_loaded(), _profile(completed_courses=[_registered("微分積分")])))

    assert "微分積分" not in titles
    assert "線形代数" in titles


def test_select_candidates_uses_grade_of_target_term():
    """配当年次は対象学期の学年で絞る(年度をまたぐと成績表の学年より1つ上)。"""
    profile = _profile(grade=1)

    assert "数値解析" not in _titles(select_candidates(_loaded(), profile))
    assert "数値解析" in _titles(select_candidates(_loaded(), profile, grade=2))


def test_select_candidates_excludes_courses_without_syllabus_code():
    """`not_offered` / `unresolved` の科目は候補から外す(§5.1.4)。"""
    titles = _titles(select_candidates(_loaded(), _profile()))

    assert "不開講の専門" not in titles  # not_offered
    assert "不開講の教養" not in titles  # offerings に載っていない(unresolved 相当)


def test_select_candidates_carries_syllabus_codes_from_offerings():
    """シラバスコードは開講年度ファイルの `resolved` から採る(§4.4.2)。"""
    candidates = {c.course.title: c for c in select_candidates(_loaded(), _profile())}

    assert candidates["仏教の思想A"].codes == ("G000000001", "G000000002")
    assert candidates["微分積分"].codes == ("Y000000001",)


def test_select_candidates_dedupes_derived_related_courses():
    """他課程から同名で導出された専門関連科目は1件に寄せ、課程コードの小さい方を採る。"""
    candidates = [c for c in select_candidates(_loaded(), _profile()) if c.course.title == "有機化学"]

    assert len(candidates) == 1
    assert candidates[0].course.own is False
    assert candidates[0].course.source_program_code == "02"
    assert candidates[0].codes == ("Y000000005",)


def test_select_candidates_requires_grade():
    with pytest.raises(ContextError):
        select_candidates(_loaded(), StudentProfile(program="01"))


# ---------------------------------------------------------------------------
# 開講クラスの結び付け(§7.2)と履修可否(§6.1)
# ---------------------------------------------------------------------------


def test_attach_offerings_drops_courses_without_offering():
    """開講情報が引けない科目は時間割に置けないため候補から外す。"""
    candidates = [
        Candidate(course=_loaded().curriculum.courses[0], codes=("Y000000001",)),
        Candidate(course=_loaded().curriculum.courses[1], codes=("Y999999999",)),
    ]
    attached = attach_offerings(candidates, {"Y000000001": _offered("Y000000001")})

    assert len(attached) == 1
    assert attached[0].classes[0].syllabus_code == "Y000000001"


def test_attach_offerings_keeps_every_class_in_slot_order():
    """クラスの数は絞らない(条件に合うクラスを選べるように)。曜日・時限の順に並べる。"""
    codes = tuple(f"A00000000{i}" for i in range(1, 5))
    index = {
        "A000000001": _offered("A000000001", day="水", period=3),
        "A000000002": _offered("A000000002", day="月", period=2),
        "A000000003": _offered("A000000003", day="月", period=1),
        "A000000004": _offered("A000000004", day=None, period=None),
    }
    attached = attach_offerings([Candidate(course=_loaded().curriculum.courses[0], codes=codes)], index)

    assert [c.syllabus_code for c in attached[0].classes] == [
        "A000000003",
        "A000000002",
        "A000000001",
        "A000000004",
    ]


def test_eligibility_rules():
    """自課程は可、他課程だけは不可、どの課程にも無いコード(課程指定なし)は可。"""
    e = Eligibility(mine=frozenset({"A1"}), any_program=frozenset({"A1", "B1"}))

    assert e.allows("A1") is True
    assert e.allows("B1") is False
    assert e.allows("G1") is True


def test_attach_offerings_drops_ineligible_classes():
    """履修登録できないクラスは候補から落とす(§6.1)。"""
    index = {
        "A000000001": _offered("A000000001", day="月", period=1),
        "A000000002": _offered("A000000002", day="火", period=2),
    }
    candidate = Candidate(course=_loaded().curriculum.courses[0], codes=("A000000001", "A000000002"))
    eligibility = Eligibility(
        mine=frozenset({"A000000002"}), any_program=frozenset({"A000000001", "A000000002"})
    )

    attached = attach_offerings([candidate], index, eligibility=eligibility)

    assert [c.syllabus_code for c in attached[0].classes] == ["A000000002"]


def test_attach_offerings_keeps_classes_without_program():
    """課程指定なしのクラスは残す(全学向けの教養教育科目・学部名義のクラス)。"""
    index = {"G000000001": _offered("G000000001")}
    candidate = Candidate(course=_loaded().curriculum.courses[0], codes=("G000000001",))
    eligibility = Eligibility(mine=frozenset(), any_program=frozenset({"Y000000009"}))

    attached = attach_offerings([candidate], index, eligibility=eligibility)

    assert [c.syllabus_code for c in attached[0].classes] == ["G000000001"]


def test_attach_offerings_drops_course_with_no_eligible_class():
    index = {"OTHER00001": _offered("OTHER00001")}
    candidate = Candidate(course=_loaded().curriculum.courses[0], codes=("OTHER00001",))
    eligibility = Eligibility(mine=frozenset(), any_program=frozenset({"OTHER00001"}))

    assert attach_offerings([candidate], index, eligibility=eligibility) == []


@pytest.mark.parametrize(
    ("term", "half"),
    [
        ("前期", "前期"),
        ("1Q", "前期"),
        ("２Ｑ", "前期"),
        ("通年", "前期"),  # 通年科目は前期に登録する
        ("サ集", "前期"),  # 夏期集中。後期より前に終わる
        ("後期", "後期"),
        ("3Q", "後期"),
        ("4Q", "後期"),
        ("集中", None),  # マスタに無い表記は判定しない
        (None, None),
    ],
)
def test_registration_half(term, half):
    assert registration_half(term) == half


def test_attach_offerings_keeps_only_classes_of_target_term():
    """対象学期の履修登録で登録するクラスだけを残す。学期不明のクラスは残す。"""
    codes = ("A000000001", "A000000002", "A000000003", "A000000004")
    index = {
        "A000000001": _offered_in("A000000001", "前期"),
        "A000000002": _offered_in("A000000002", "後期", period=2),
        "A000000003": _offered_in("A000000003", "通年", period=3),
        "A000000004": _offered_in("A000000004", None, period=4),
    }
    candidate = Candidate(course=_loaded().curriculum.courses[0], codes=codes)

    fall = attach_offerings([candidate], index, term="後期")
    spring = attach_offerings([candidate], index, term="前期")

    assert [c.syllabus_code for c in fall[0].classes] == ["A000000002", "A000000004"]
    assert [c.syllabus_code for c in spring[0].classes] == ["A000000001", "A000000003", "A000000004"]


def test_attach_offerings_drops_course_without_class_in_target_term():
    candidate = Candidate(course=_loaded().curriculum.courses[0], codes=("A000000001",))
    index = {"A000000001": _offered_in("A000000001", "前期")}

    assert attach_offerings([candidate], index, term="後期") == []
# ---------------------------------------------------------------------------
# 8. 先修条件(§5.1.5 `prerequisites`)
# ---------------------------------------------------------------------------



def _rule(**kw) -> Prerequisite:
    return Prerequisite.model_validate({"title": "数値解析", "notes": "原文。", **kw})


def _taken(title: str, year: int = 2024, term: str = "前期", status: str = "passed", credits: float = 2) -> StudentCourse:
    return StudentCourse(title=title, year=year, term=term, credits=credits, status=status)


def test_prerequisite_any_of_and_all_of():
    curriculum = _loaded().curriculum
    done = [_taken("微分積分")]

    assert check_prerequisite(_rule(any_of=["微分積分", "線形代数"]), curriculum, done) == "met"
    assert check_prerequisite(_rule(any_of=["線形代数"]), curriculum, done) == "unmet"
    assert check_prerequisite(_rule(all_of=["微分積分", "線形代数"]), curriculum, done) == "unmet"
    # 不合格は修得ではない
    failed = [_taken("線形代数", status="failed")]
    assert check_prerequisite(_rule(any_of=["線形代数"]), curriculum, failed) == "unmet"


def test_prerequisite_min_credits_total_and_by_category():
    curriculum = _loaded().curriculum
    done = [_taken("微分積分"), _taken("線形代数")]

    # accepts 省略は卒業要件総修得単位数
    assert check_prerequisite(_rule(min_credits=[{"credits": 4}]), curriculum, done) == "met"
    assert check_prerequisite(_rule(min_credits=[{"credits": 5}]), curriculum, done) == "unmet"
    by_category = {"credits": 4, "accepts": {"category": "専門基礎科目", "type": "必修"}}
    assert check_prerequisite(_rule(min_credits=[by_category]), curriculum, done) == "met"
    other = {"credits": 2, "accepts": {"category": "専門応用科目"}}
    assert check_prerequisite(_rule(min_credits=[other]), curriculum, done) == "unmet"


def test_prerequisite_as_of_counts_only_courses_until_then():
    """判定時点(as_of)の学期末までに修得した科目だけで数える。"""
    curriculum = _loaded().curriculum  # 2024年度入学
    done = [_taken("微分積分", 2024, "前期"), _taken("線形代数", 2025, "前期")]
    rule = _rule(as_of={"grade": 1, "term": "後期"}, min_credits=[{"credits": 4}])

    # 1年後期(2024年度後期)末までに修得したのは微分積分の2単位だけ
    assert check_prerequisite(rule, curriculum, done) == "unmet"
    later = _rule(as_of={"grade": 2, "term": "前期"}, min_credits=[{"credits": 4}])
    assert check_prerequisite(later, curriculum, done) == "met"


def test_prerequisite_is_unknown_when_not_decidable():
    curriculum = _loaded().curriculum
    # 原文しか無い条件
    assert check_prerequisite(_rule(), curriculum, []) == "unknown"
    # 判定時点が提案する学期以降(まだ成績が出ていない)
    rule = _rule(as_of={"grade": 2, "term": "前期"}, min_credits=[{"credits": 2}])
    target = TargetTerm(year=2025, term="前期", grade=2)
    assert check_prerequisite(rule, curriculum, [], target=target) == "unknown"


def test_prerequisite_min_credits_from_listed_courses():
    """`from` は列挙した科目の単位だけを数える(英語総合のうち4単位以上など)。"""
    curriculum = _loaded().curriculum
    done = [_taken("微分積分"), _taken("線形代数"), _taken("プログラミング演習")]
    listed = {"credits": 4, "from": ["微分積分", "線形代数"]}

    assert check_prerequisite(_rule(min_credits=[listed]), curriculum, done) == "met"
    # 列挙していない科目の単位は数えない(総単位は6あっても、列挙分は2)
    narrow = {"credits": 4, "from": ["微分積分", "確率統計"]}
    assert check_prerequisite(_rule(min_credits=[narrow]), curriculum, done) == "unmet"
    # 表記の揺れは突合の規則(NFKC・空白除去)で吸収する
    spaced = {"credits": 2, "from": ["微分 積分"]}
    assert check_prerequisite(_rule(min_credits=[spaced]), curriculum, done) == "met"


def test_prerequisite_one_of_is_or_and_combines_with_and():
    """`one_of` はどれか1つを満たせばよく、行に直接書いた条件とは AND で結ぶ。"""
    curriculum = _loaded().curriculum
    one_of = [
        {"min_credits": [{"credits": 4, "from": ["微分積分", "線形代数"]}]},
        {"all_of": ["確率統計"]},
    ]

    assert check_prerequisite(_rule(one_of=one_of), curriculum, [_taken("確率統計")]) == "met"
    both = [_taken("微分積分"), _taken("線形代数")]
    assert check_prerequisite(_rule(one_of=one_of), curriculum, both) == "met"
    assert check_prerequisite(_rule(one_of=one_of), curriculum, [_taken("微分積分")]) == "unmet"

    # 行の条件(any_of)と AND: one_of を満たしても行の条件が欠ければ満たさない
    rule = _rule(any_of=["プログラミング演習"], one_of=one_of)
    assert check_prerequisite(rule, curriculum, [_taken("確率統計")]) == "unmet"
    done = [_taken("確率統計"), _taken("プログラミング演習")]
    assert check_prerequisite(rule, curriculum, done) == "met"


def test_prerequisite_one_of_unknown_and_as_of_inheritance():
    """選択肢の判定時点が未到来なら、他が満たさない限り unknown。as_of は行から継ぐ。"""
    curriculum = _loaded().curriculum  # 2024年度入学
    target = TargetTerm(year=2025, term="前期", grade=2)
    one_of = [
        {"as_of": {"grade": 2, "term": "前期"}, "min_credits": [{"credits": 2}]},
        {"all_of": ["確率統計"]},
    ]
    rule = _rule(one_of=one_of)
    assert check_prerequisite(rule, curriculum, [], target=target) == "unknown"
    assert check_prerequisite(rule, curriculum, [_taken("確率統計")], target=target) == "met"

    # 行の as_of(1年前期末)を選択肢が継ぐ: 2024年度後期の修得は数えない
    inherited = _rule(
        as_of={"grade": 1, "term": "前期"},
        one_of=[{"all_of": ["確率統計"]}, {"all_of": ["線形代数"]}],
    )
    late = [_taken("確率統計", 2024, "後期")]
    assert check_prerequisite(inherited, curriculum, late) == "unmet"


def test_english_prerequisites_on_2026_data():
    """2026年度入学の英語3科目は原文だけでなく判定できる(英語総合は各1単位)。"""
    from pathlib import Path

    from app.curricula.loader import load_curricula
    from app.settings import Settings

    root = Path(__file__).resolve().parents[2]
    loaded = load_curricula(
        Settings(curricula_dir=root / "curricula", offerings_dir=root / "offerings")
    )[("02", 2026)]
    rules = {p.title: p for p in loaded.curriculum.prerequisites}

    def english(*titles):
        return [_taken(t, 2026, "前期", credits=1) for t in titles]

    comm2 = rules["英語コミュニケーションⅡ"]
    check = lambda rule, done: check_prerequisite(rule, loaded.curriculum, done)  # noqa: E731
    assert check(comm2, english("英語総合1（Ａ）", "英語総合1（Ｂ）")) == "met"
    assert check(comm2, english("英語総合1（Ａ）")) == "unmet"
    assert check(comm2, [_taken("英語コミュニケーションⅠ", 2026, "前期")]) == "met"

    gue = rules["Global Understanding in English"]
    assert check(gue, english("英語総合1（Ａ）", "英語総合1（Ｂ）", "英語総合2（Ａ）")) == "unmet"
    four = english("英語総合1（Ａ）", "英語総合1（Ｂ）", "英語総合2（Ａ）", "英語総合3")
    assert check(gue, four) == "met"
    assert check(rules["Forum"], four) == "met"


def test_check_prerequisites_drops_unmet_and_reports_all():
    loaded = _loaded()
    rules = [
        _rule(title="微分積分", any_of=["線形代数"], notes="線形代数を修得していること。"),
        _rule(title="線形代数", notes="原文のみの条件。"),
    ]
    curriculum = loaded.curriculum.model_copy(update={"prerequisites": rules})
    candidates = select_candidates(loaded, _profile())

    kept, results = check_prerequisites(candidates, curriculum, [])

    assert "微分積分" not in _titles(kept)
    assert "線形代数" in _titles(kept)
    assert {(r.title, r.status) for r in results} == {("微分積分", "unmet"), ("線形代数", "unknown")}
    notes = {r.title: r.notes for r in results}
    assert notes == {"微分積分": "線形代数を修得していること。", "線形代数": "原文のみの条件。"}


def test_seminar_prerequisite_on_real_data():
    """知能情報メディアセミナー(3年前期終了時点で80単位以上、専門基礎科目(必修)20単位以上)。

    スモークの合成プロファイル(83単位・専門基礎科目(必修)28単位)は満たし、
    3年前期の科目を落として78単位にすると満たさない。
    """
    from pathlib import Path

    import importlib.util

    from app.curricula.loader import load_curricula
    from app.settings import Settings

    root = Path(__file__).resolve().parents[2]
    spec = importlib.util.spec_from_file_location(
        "smoke_timetable", root / "backend" / "scripts" / "smoke_timetable.py"
    )
    smoke = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(smoke)
    _default_completed = smoke._default_completed
    loaded = load_curricula(
        Settings(curricula_dir=root / "curricula", offerings_dir=root / "offerings")
    )[("02", 2024)]
    seminar = next(p for p in loaded.curriculum.prerequisites if p.title == "知能情報メディアセミナー")
    target = TargetTerm(year=2026, term="後期", grade=3)
    completed = [StudentCourse.model_validate(c) for c in _default_completed()]

    assert check_prerequisite(seminar, loaded.curriculum, completed, target=target) == "met"

    fewer = [c for c in completed if not (c.year == 2026 and c.status == "passed")]
    assert check_prerequisite(seminar, loaded.curriculum, fewer, target=target) == "unmet"


