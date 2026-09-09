"""要件充足判定のテスト。design.md §4.4.5。

手組みの合成カリキュラム(実データと同じスロット構成・カスケード3系統を持つ
最小構成)に手組みの学生ケースを与え、期待どおりの不足単位が算出されることを
確かめる。完了条件の4ケース(必修未修得 / 教養選択の溢れ / `credit_caps` 超過 /
コース別制約)を個別のテストとして持ち、加えてリポジトリの実データ(2024年度
入学の全課程)で判定が成立することを確かめる。
"""

from functools import lru_cache
from pathlib import Path

import pytest
import yaml

from app.curricula.merge import merge
from app.curricula.requirements import (
    RequirementsError,
    accepts_course,
    judge,
    normalize_title,
)
from app.schemas.curriculum import (
    Accepts,
    Curriculum,
    CurriculumCourse,
    LiberalArtsCurriculum,
)
from app.schemas.student import Course as StudentCourse

REPO_ROOT = Path(__file__).resolve().parents[2]
CURRICULA_DIR = REPO_ROOT / "curricula"
LIBERAL_ARTS_FILENAME = "00-liberal-arts.yaml"


# --- 合成カリキュラム ---
#
# 実データの構成を保ったまま単位数だけ小さくする。要件枠の `credits` の合計が
# `graduation.total_credits` に一致することはマージ時に検査されるため(§4.4.3)、
# スロットを足したら `total_credits` も併せて直すこと。
#
#   liberal.buddhism 2 / liberal.language.required 2 → liberal.elective 4 → free.all 4
#   basic.required 4 / basic.elective 0 → free.faculty 2 → free.all
#   applied.required_elective 4 → applied.elective 2 → free.faculty
#   related 0 → free.faculty
#   合計 24


def _liberal_course(title: str, subcategory: str, type_: str, credits: int = 2, **kw) -> dict:
    return {
        "title": title,
        "category": "教養教育科目",
        "subcategory": subcategory,
        "type": type_,
        "credits": credits,
        "grade": 1,
        "term": "前期",
        "quarters": ["1Q", "2Q"],
        **kw,
    }


def _major_course(title: str, category: str, type_: str, credits: int = 2, **kw) -> dict:
    return {
        "title": title,
        "category": category,
        "type": type_,
        "credits": credits,
        "grade": 2,
        "term": "後期",
        "quarters": ["3Q", "4Q"],
        **kw,
    }


def _liberal_arts() -> LiberalArtsCurriculum:
    return LiberalArtsCurriculum.model_validate(
        {
            "admission_year": 2024,
            "liberal_arts_version": "until-2025",
            "requirement_slots": [
                {
                    "key": "liberal.buddhism",
                    "credits": 2,
                    "accepts": {"subcategory": "「仏教の思想」科目", "type": "必修"},
                },
                {
                    "key": "liberal.language.required",
                    "credits": 2,
                    "accepts": {"subcategory": "必修外国語科目"},
                    "overflow_to": "liberal.elective",  # 注記A
                },
                {
                    "key": "liberal.elective",
                    "credits": 4,
                    "accepts": {"category": "教養教育科目"},
                    "overflow_to": "free.all",
                },
            ],
            "credit_caps": [
                {
                    "titles": ["教養教育科目特別講義"],
                    "max_credits": 2,
                    "overflow_to": None,
                }
            ],
            "courses": [
                _liberal_course("仏教の思想A", "「仏教の思想」科目", "必修"),
                _liberal_course("仏教の思想B", "「仏教の思想」科目", "必修"),
                _liberal_course("英語総合1", "必修外国語科目", "必修"),
                _liberal_course("英語総合2", "必修外国語科目", "必修"),
                _liberal_course("英語総合3", "必修外国語科目", "必修"),
                _liberal_course("哲学", "人文科学系科目", "選択"),
                _liberal_course("経済学", "社会科学系科目", "選択"),
                _liberal_course("教養教育科目特別講義", "教養特別講義科目", "選択"),
                _liberal_course("教養教育科目特別講義B", "教養特別講義科目", "選択"),
                _liberal_course("教職概論", "人文科学系科目", "随意"),
                _liberal_course("応用化学課程では不可", "自然科学系科目", "選択",
                                not_available_to_programs=["02"]),
            ],
        }
    )


def _program(code: str = "01") -> Curriculum:
    return Curriculum.model_validate(
        {
            "program": {"code": code, "name": f"テスト課程{code}"},
            "admission_year": 2024,
            "graduation": {"total_credits": 24, "excluded_types": ["随意"]},
            "tracks": [
                {
                    "key": "math",
                    "name": "数学系コース",
                    "constraints": [
                        {
                            "slot": "applied.required_elective",
                            "track_group": "数学系",
                            "pool": 4,
                            "min": 4,
                        }
                    ],
                },
                {"key": "sogo", "name": "総合コース", "constraints": []},
            ],
            "requirement_slots": [
                {
                    "key": "basic.required",
                    "credits": 4,
                    "accepts": {"category": "専門基礎科目", "type": "必修"},
                },
                {
                    "key": "basic.elective",
                    "credits": 0,
                    "accepts": {"category": "専門基礎科目", "type": "選択"},
                    "overflow_to": "free.faculty",  # 注記B
                },
                {
                    "key": "applied.required_elective",
                    "credits": 4,
                    "accepts": {"category": "専門応用科目", "type": "選択必修"},
                    "overflow_to": "applied.elective",  # 注記C
                },
                {
                    "key": "applied.elective",
                    "credits": 2,
                    "accepts": {"category": "専門応用科目", "type": "選択"},
                    "overflow_to": "free.faculty",
                },
                {
                    "key": "related",
                    "credits": 0,
                    "accepts": {"category": "専門関連科目"},
                    "overflow_to": "free.faculty",  # 注記D
                },
                {
                    "key": "free.faculty",
                    "credits": 2,
                    "accepts": {
                        "category": ["専門基礎科目", "専門応用科目", "専門関連科目"]
                    },
                    "overflow_to": "free.all",  # 注記E 教養教育科目は不可
                },
                {"key": "free.all", "credits": 4, "accepts": {"category": "any"}},
            ],
            "credit_caps": [
                {
                    "titles": ["キャリア実習"],
                    "max_credits": 2,
                    "overflow_to": None,
                }
            ],
            "registration_limits": {
                "by_semester": [{"semesters": [1, 2], "max_credits_per_semester": 22}]
            },
            "courses": [
                _major_course("微分積分", "専門基礎科目", "必修"),
                _major_course("線形代数", "専門基礎科目", "必修"),
                _major_course("物理学実験", "専門基礎科目", "選択"),
                _major_course("解析学", "専門応用科目", "選択必修", track_groups=["数学系"]),
                _major_course("代数学", "専門応用科目", "選択必修", track_groups=["数学系"]),
                _major_course("計算機科学", "専門応用科目", "選択必修", track_groups=["情報系"]),
                _major_course("知能情報学", "専門応用科目", "選択必修", track_groups=["情報系"]),
                _major_course("数値解析", "専門応用科目", "選択"),
                _major_course("キャリア実習", "専門応用科目", "選択"),
                _major_course("教職実習", "専門応用科目", "随意"),
            ],
        }
    )


def _other_program() -> Curriculum:
    """他課程。`courses` は専門関連科目として導出される(§4.4.3 手順2)。"""
    other = _program("02").model_dump()
    other["program"] = {"code": "02", "name": "テスト課程02", "name_aliases": []}
    other["tracks"] = None
    other["courses"] = [
        _major_course("有機化学", "専門応用科目", "選択"),
        _major_course("無機化学", "専門応用科目", "選択"),
    ]
    return Curriculum.model_validate(other)


@lru_cache
def _merged():
    program = _program()
    return merge(program, _liberal_arts(), [program, _other_program()])


def _passed(title: str, credits: float = 2.0) -> StudentCourse:
    return StudentCourse(
        title=title, year=2024, term="前期", credits=credits, status="passed"
    )


def _slot(result, key):
    return next(s for s in result.slots if s.key == key)


def _uncounted(result, reason):
    return [u for u in result.uncounted if u.reason == reason]


# --- accepts の記法(§5.1.5) ---


@pytest.mark.parametrize(
    "accepts,expected",
    [
        ({"category": "教養教育科目"}, True),
        ({"category": "専門基礎科目"}, False),
        ({"category": "any"}, True),
        ({"category": ["専門基礎科目", "教養教育科目"]}, True),
        ({"subcategory": "人文科学系科目"}, True),
        ({"subcategory": ["社会科学系科目"]}, False),
        ({"type": ["選択必修", "選択"]}, True),
        ({"kikan": True}, False),
        ({"subcategory": "人文科学系科目", "type": "選択"}, True),
        ({"subcategory": "人文科学系科目", "type": "必修"}, False),  # 複数キーは AND
    ],
)
def test_accepts_course(accepts, expected):
    course = CurriculumCourse.model_validate(
        _liberal_course("哲学", "人文科学系科目", "選択")
    )
    assert accepts_course(Accepts.model_validate(accepts), course) is expected


def test_normalize_title_absorbs_fullwidth_and_spaces():
    """成績表由来の全角英数字・空白混じりの表記を吸収する(§5.1.5)。"""
    assert normalize_title("英語総合３") == normalize_title("英語総合3")
    assert normalize_title("英語セミナーA 1") == normalize_title("英語セミナーA1")


def test_matches_completed_course_with_fullwidth_title():
    result = judge(_merged(), [_passed("英語総合１")])
    assert _slot(result, "liberal.language.required").earned == 2
    assert result.uncounted == []


# --- 完了条件1: 必修未修得 ---


def test_empty_profile_is_short_of_everything():
    """既修得科目が無ければ、各枠の不足単位は required そのものになる。"""
    result = judge(_merged(), [])
    assert result.total_credits == 24
    assert result.earned_credits == 0
    assert result.remaining_credits == 24
    assert result.satisfied is False
    for slot in result.slots:
        assert slot.earned == 0
        assert slot.shortfall == slot.required


def test_required_courses_short():
    """必修を一部しか修得していない場合の不足単位(完了条件)。"""
    result = judge(
        _merged(),
        [_passed("仏教の思想A"), _passed("微分積分")],
    )
    assert _slot(result, "liberal.buddhism").earned == 2
    assert _slot(result, "liberal.buddhism").shortfall == 0
    assert _slot(result, "basic.required").earned == 2
    assert _slot(result, "basic.required").shortfall == 2
    assert result.earned_credits == 4
    assert result.remaining_credits == 20


def test_failed_and_withdrawn_are_not_counted():
    """合格した科目の単位のみ加算する(要件§4.2)。"""
    completed = [
        StudentCourse(
            title="微分積分", year=2024, term="前期", credits=2, status="failed"
        ),
        StudentCourse(
            title="線形代数", year=2024, term="前期", credits=2, status="withdrawn"
        ),
    ]
    result = judge(_merged(), completed)
    assert result.earned_credits == 0
    assert _slot(result, "basic.required").shortfall == 4
    # 不合格・履修辞退は算入対象外の一覧にも現れない(判断材料は提案側のプロンプトへ)
    assert result.uncounted == []


def test_excluded_types_are_not_counted():
    """`graduation.excluded_types` の `随意` は卒業要件単位に算入しない。"""
    result = judge(_merged(), [_passed("教職実習"), _passed("教職概論")])
    assert result.earned_credits == 0
    assert {u.title for u in _uncounted(result, "excluded_type")} == {
        "教職実習",
        "教職概論",
    }


def test_unknown_course_is_reported():
    """履修要項に無い科目は算入せず、理由つきで返す。"""
    result = judge(_merged(), [_passed("他学部科目")])
    assert result.earned_credits == 0
    assert [u.title for u in _uncounted(result, "not_in_curriculum")] == ["他学部科目"]


def test_duplicate_titles_are_counted_once():
    """同一科目の単位は重ねて算入しない。"""
    result = judge(_merged(), [_passed("微分積分"), _passed("微分積分")])
    assert _slot(result, "basic.required").earned == 2
    assert [u.reason for u in result.uncounted] == ["duplicate"]


def test_course_excluded_by_not_available_to_programs_is_unknown():
    """`not_available_to_programs` で除外された科目はどのスロットの判定にも使わない。"""
    merged = merge(_program("02"), _liberal_arts(), [_program("02")])
    result = judge(merged, [_passed("応用化学課程では不可")])
    assert [u.reason for u in result.uncounted] == ["not_in_curriculum"]


# --- 完了条件2: 教養選択の溢れ(カスケード) ---


def test_liberal_required_language_overflows_to_elective_then_free_all():
    """必修外国語の超過分は教養選択へ、さらにその超過分はオールフリーへ(注記A)。

    英語総合1〜3 の 6 単位のうち `liberal.language.required` は 2 単位まで。
    残り 4 単位は `liberal.elective`(4単位)に収まる。
    """
    result = judge(
        _merged(),
        [_passed("英語総合1"), _passed("英語総合2"), _passed("英語総合3")],
    )
    assert _slot(result, "liberal.language.required").earned == 2
    assert _slot(result, "liberal.elective").earned == 4
    assert _slot(result, "free.all").earned == 0
    assert result.earned_credits == 6

    # さらに教養選択科目を積むとオールフリーへ流れる
    result = judge(
        _merged(),
        [
            _passed("英語総合1"),
            _passed("英語総合2"),
            _passed("英語総合3"),
            _passed("哲学"),
            _passed("経済学"),
        ],
    )
    assert _slot(result, "liberal.elective").earned == 4
    assert _slot(result, "free.all").earned == 4
    assert result.earned_credits == 10


def test_liberal_courses_never_reach_faculty_free_zone():
    """学部フリーゾーンは専攻科目のみを受け入れ、教養教育科目は受け入れない(注記E)。"""
    result = judge(
        _merged(),
        [_passed("哲学"), _passed("経済学"), _passed("英語総合1")],
    )
    assert _slot(result, "free.faculty").earned == 0
    assert _slot(result, "liberal.elective").earned == 4
    assert _slot(result, "free.all").earned == 0


def test_required_elective_overflows_into_elective_ignoring_accepts():
    """専門応用選択必修の超過分は `applied.elective` へ計上される(注記C)。

    送り先の `accepts` は `type: 選択` だが、カスケードは `overflow_to` を辿るだけで
    `accepts` を見ない。
    """
    result = judge(
        _merged(),
        [
            _passed("解析学"),
            _passed("代数学"),
            _passed("計算機科学"),
            _passed("知能情報学"),
        ],
    )
    assert _slot(result, "applied.required_elective").earned == 4
    assert _slot(result, "applied.elective").earned == 2
    assert _slot(result, "free.faculty").earned == 2
    assert result.earned_credits == 8


def test_related_courses_flow_to_faculty_free_zone():
    """他課程から導出した専門関連科目は `related` → `free.faculty` へ(注記D)。"""
    result = judge(_merged(), [_passed("有機化学"), _passed("無機化学")])
    assert _slot(result, "related").earned == 0  # credits: 0 の通過点
    assert _slot(result, "free.faculty").earned == 2
    assert _slot(result, "free.all").earned == 2
    assert result.earned_credits == 4


def test_zero_credit_slot_passes_through():
    """`credits: 0` の枠は受け皿を持たず、常に下流へ送る(`basic.elective`)。"""
    result = judge(_merged(), [_passed("物理学実験")])
    assert _slot(result, "basic.elective").earned == 0
    assert _slot(result, "free.faculty").earned == 2


def test_credits_dropped_when_cascade_ends_full():
    """`overflow_to` を持たない枠が埋まると、超過分はどこにも計上されない。

    「仏教の思想」科目の必修の起点は最も条件の多い `liberal.buddhism` であり、
    この枠は `overflow_to` を持たない。`requirement_slots[].overflow_to` の省略は
    上位スロットへ流れないことを意味する(§5.1.5)ため、超過分は落ちる。
    """
    result = judge(_merged(), [_passed("仏教の思想A"), _passed("仏教の思想B")])
    assert _slot(result, "liberal.buddhism").earned == 2
    assert _slot(result, "liberal.elective").earned == 0
    assert [u.reason for u in result.uncounted] == ["no_slot_capacity"]
    assert _uncounted(result, "no_slot_capacity")[0].credits == 2


# --- 完了条件3: credit_caps 超過 ---


def test_credit_cap_excess_is_not_counted_anywhere():
    """`max_credits` 超過分は `overflow_to: null` によりどこにも計上しない(§5.1.5)。"""
    result = judge(
        _merged(),
        [_passed("教養教育科目特別講義"), _passed("教養教育科目特別講義B")],
    )
    # 上限は「教養教育科目特別講義」1科目2単位のみ。別科目名の B は上限の対象外
    assert _slot(result, "liberal.elective").earned == 4
    assert result.earned_credits == 4
    assert result.uncounted == []

    # 4単位の1科目なら2単位ぶんが超過して落ちる
    result = judge(_merged(), [_passed("教養教育科目特別講義", credits=4.0)])
    assert _slot(result, "liberal.elective").earned == 2
    assert [(u.reason, u.credits) for u in result.uncounted] == [("over_credit_cap", 2.0)]
    assert result.earned_credits == 2


def test_credit_cap_on_major_course():
    """課程ファイル側の `credit_caps` も同様に効く。"""
    result = judge(_merged(), [_passed("キャリア実習", credits=3.0)])
    assert _slot(result, "applied.elective").earned == 2
    assert [(u.reason, u.credits) for u in result.uncounted] == [("over_credit_cap", 1.0)]


# --- 完了条件4: コース別制約 ---


def test_track_constraint_shortfall():
    """コース別下限の不足単位(§5.1.5 `tracks[].constraints`)。"""
    result = judge(_merged(), [_passed("解析学")], track="math")
    assert result.track == "math"
    constraint = result.track_constraints[0]
    assert constraint.slot == "applied.required_elective"
    assert constraint.track_group == "数学系"
    assert constraint.pool == 4
    assert constraint.required == 4
    assert constraint.earned == 2
    assert constraint.shortfall == 2
    assert result.satisfied is False


def test_track_constraint_ignores_cascade_destination():
    """下限は科目群からの修得単位を問い、どの枠へ計上されたかは問わない。

    情報系の選択必修が先に枠を埋めても、数学系の修得単位は変わらない。
    """
    completed = [
        _passed("計算機科学"),
        _passed("知能情報学"),
        _passed("解析学"),
        _passed("代数学"),
    ]
    result = judge(_merged(), completed, track="math")
    assert _slot(result, "applied.required_elective").earned == 4
    assert result.track_constraints[0].earned == 4
    assert result.track_constraints[0].shortfall == 0


def test_track_without_constraints():
    result = judge(_merged(), [], track="sogo")
    assert result.track_constraints == []


def test_track_is_optional():
    """コース未選択のときはコース別下限を判定しない。"""
    result = judge(_merged(), [_passed("解析学")])
    assert result.track is None
    assert result.track_constraints == []
    assert [t.key for t in result.available_tracks] == ["math", "sogo"]


def test_unknown_track_raises():
    with pytest.raises(RequirementsError, match="コースが存在しません"):
        judge(_merged(), [], track="unknown")


# --- 充足 ---


def test_satisfied_when_all_slots_filled():
    """全枠を満たすと `satisfied` が真になる。"""
    completed = [
        _passed("仏教の思想A"),  # liberal.buddhism 2
        _passed("英語総合1"),  # liberal.language.required 2
        _passed("哲学"),  # liberal.elective 2
        _passed("経済学"),  # liberal.elective 2
        _passed("微分積分"),  # basic.required 2
        _passed("線形代数"),  # basic.required 2
        _passed("解析学"),  # applied.required_elective 2
        _passed("代数学"),  # applied.required_elective 2
        _passed("数値解析"),  # applied.elective 2
        _passed("物理学実験"),  # basic.elective → free.faculty 2
        _passed("有機化学"),  # related → free.faculty(満) → free.all 2
        _passed("無機化学"),  # free.all 2
    ]
    result = judge(_merged(), completed, track="math")
    assert result.earned_credits == 24
    assert result.remaining_credits == 0
    assert [s.key for s in result.slots if s.shortfall > 0] == []
    assert result.satisfied is True


def test_assigned_courses_are_reported_per_slot():
    """枠ごとの内訳を返す(履修提案のプロンプトへ渡す材料。§7.2)。"""
    result = judge(
        _merged(), [_passed("英語総合1"), _passed("英語総合2"), _passed("英語総合3")]
    )
    assert [c.title for c in _slot(result, "liberal.language.required").courses] == [
        "英語総合1"
    ]
    assert [
        (c.title, c.credits) for c in _slot(result, "liberal.elective").courses
    ] == [("英語総合2", 2.0), ("英語総合3", 2.0)]


def test_result_is_independent_of_input_order():
    """要件枠ごとの earned は既修得科目の並び順に依らない。"""
    completed = [
        _passed("解析学"),
        _passed("代数学"),
        _passed("計算機科学"),
        _passed("数値解析"),
        _passed("物理学実験"),
    ]
    forward = judge(_merged(), completed)
    backward = judge(_merged(), list(reversed(completed)))
    assert {s.key: s.earned for s in forward.slots} == {
        s.key: s.earned for s in backward.slots
    }


def test_half_credit_courses():
    """0.5 刻みの単位数でも浮動小数の誤差を出さない。"""
    completed = [_passed("英語総合1", 0.5), _passed("英語総合2", 0.5)]
    result = judge(_merged(), completed)
    assert _slot(result, "liberal.language.required").earned == 1.0
    assert _slot(result, "liberal.language.required").shortfall == 1.0


# --- 参照の検査 ---


def test_dangling_credit_cap_overflow_raises():
    program = _program().model_dump()
    program["credit_caps"][0]["overflow_to"] = "no.such.slot"
    merged = merge(
        Curriculum.model_validate(program), _liberal_arts(), [_other_program()]
    )
    with pytest.raises(RequirementsError, match="credit_caps"):
        judge(merged, [])


def test_dangling_track_constraint_slot_raises():
    program = _program().model_dump()
    program["tracks"][0]["constraints"][0]["slot"] = "no.such.slot"
    merged = merge(
        Curriculum.model_validate(program), _liberal_arts(), [_other_program()]
    )
    with pytest.raises(RequirementsError, match="constraints"):
        judge(merged, [])


# --- 実データ(§6 完了条件) ---


def _load(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


@lru_cache
def _real_cohort(cohort: str) -> dict:
    directory = CURRICULA_DIR / cohort
    liberal = LiberalArtsCurriculum.model_validate(_load(directory / LIBERAL_ARTS_FILENAME))
    programs = {}
    for path in sorted(directory.glob("*.yaml")):
        if path.name == LIBERAL_ARTS_FILENAME:
            continue
        program = Curriculum.model_validate(_load(path))
        programs[program.program.code] = program
    others = list(programs.values())
    return {code: merge(p, liberal, others) for code, p in programs.items()}


REAL_CASES = [
    (cohort, code)
    for cohort in sorted(p.name for p in CURRICULA_DIR.glob("admission-*") if p.is_dir())
    for code in sorted(_real_cohort(cohort))
]


@pytest.mark.parametrize("cohort,code", REAL_CASES)
def test_real_curriculum_with_empty_profile(cohort, code):
    """実データの全課程で、既修得科目が空なら不足単位が卒業必要単位数に等しい。"""
    merged = _real_cohort(cohort)[code]
    result = judge(merged, [])
    assert result.total_credits == merged.graduation.total_credits
    assert result.earned_credits == 0
    assert result.remaining_credits == merged.graduation.total_credits
    assert sum(s.shortfall for s in result.slots) == merged.graduation.total_credits


@pytest.mark.parametrize("cohort,code", REAL_CASES)
def test_real_curriculum_assigns_every_own_course(cohort, code):
    """実データの設置科目はいずれかの要件枠に受け入れられる(§5.1.5)。

    「どのスロットにも受け入れられない科目が生じないよう、区分ごとに必ず受け皿と
    なるスロットを用意する」ことの検算。`随意` は算入対象外なので除く。
    """
    merged = _real_cohort(cohort)[code]
    excluded = set(merged.graduation.excluded_types)
    countable = [c for c in merged.own_courses if c.type not in excluded]
    result = judge(merged, [_passed(c.title, c.credits) for c in countable])
    assert _uncounted(result, "no_matching_slot") == []
    assert _uncounted(result, "not_in_curriculum") == []


@pytest.mark.parametrize("cohort,code", REAL_CASES)
def test_real_curriculum_required_courses_fill_required_slots(cohort, code):
    """実データで必修科目だけを修得したとき、必修枠が過不足なく埋まる。

    必修の設置単位が必修枠の単位数を満たすこと(=履修要項の転記と要件枠の整合)を
    判定の側から確かめる。
    """
    merged = _real_cohort(cohort)[code]
    required = [c for c in merged.own_courses if c.type == "必修"]
    result = judge(merged, [_passed(c.title, c.credits) for c in required])
    for slot in result.slots:
        if slot.required > 0 and slot.key.endswith(".required"):
            assert slot.shortfall == 0, f"{code}: {slot.key} が必修だけで埋まらない"


def test_real_curriculum_track_constraints():
    """実データのコース別制約(2024年度入学 課程01 数学系コース)。"""
    merged = _real_cohort("admission-2024")["01"]
    result = judge(merged, [], track="math")
    assert [c.slot for c in result.track_constraints] == [
        "applied.required_elective",
        "applied.elective",
    ]
    assert [c.required for c in result.track_constraints] == [13, 14]
    assert [c.shortfall for c in result.track_constraints] == [13, 14]
