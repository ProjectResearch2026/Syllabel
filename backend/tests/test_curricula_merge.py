"""マージのテスト。design.md §4.4.3。

実データ(`curricula/`)の全課程・全コホートでマージ後の4検査が通ることと、
教養教育科目の課程別除外・専門関連科目の導出・同名科目の扱いが §4.4.3 の
規定どおりであることを確かめる。異常系は合成データで組む(実データが健全な
かぎり実データからは作れないため)。
"""

from copy import deepcopy
from functools import lru_cache
from pathlib import Path

import pytest
import yaml

from app.curricula.merge import (
    CurriculumMergeError,
    MergedCurriculum,
    merge,
)
from app.schemas.curriculum import Curriculum, LiberalArtsCurriculum

REPO_ROOT = Path(__file__).resolve().parents[2]
CURRICULA_DIR = REPO_ROOT / "curricula"
LIBERAL_ARTS_FILENAME = "00-liberal-arts.yaml"

COHORTS = sorted(p.name for p in CURRICULA_DIR.glob("admission-*") if p.is_dir())


def _load(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


@lru_cache
def _cohort(cohort: str) -> tuple[LiberalArtsCurriculum, dict[str, Curriculum]]:
    """1コホートの教養教育科目ファイルと課程ファイルを課程コード順に読む。

    課程ごとにパラメタライズしたテストから何度も呼ばれるため結果を使い回す。
    書き換える異常系は `deepcopy` してから触ること。
    """
    directory = CURRICULA_DIR / cohort
    liberal = LiberalArtsCurriculum.model_validate(_load(directory / LIBERAL_ARTS_FILENAME))
    programs = {}
    for path in sorted(directory.glob("*.yaml")):
        if path.name == LIBERAL_ARTS_FILENAME:
            continue
        program = Curriculum.model_validate(_load(path))
        programs[program.program.code] = program
    return liberal, programs


@lru_cache
def _merge_cohort(cohort: str) -> dict[str, MergedCurriculum]:
    liberal, programs = _cohort(cohort)
    others = list(programs.values())
    return {code: merge(p, liberal, others) for code, p in programs.items()}


def _program_codes(cohort: str) -> list[str]:
    return sorted(_cohort(cohort)[1])


REAL_CASES = [(cohort, code) for cohort in COHORTS for code in _program_codes(cohort)]


# --- 実データ(§6 完了条件) ---


@pytest.mark.parametrize("cohort", COHORTS)
def test_real_data_merges(cohort):
    """全課程がマージでき、マージ後の4検査を通ること。

    `merge()` は検査に違反すると `CurriculumMergeError` を送出するため、
    例外なく返ること自体が4検査を通ったことを表す。
    """
    merged = _merge_cohort(cohort)
    assert merged, f"{cohort} に課程ファイルがない"


@pytest.mark.parametrize("cohort,code", REAL_CASES)
def test_slot_credits_sum_matches_total_credits(cohort, code):
    """要件枠の単位数の合計が `graduation.total_credits` に一致すること。"""
    merged = _merge_cohort(cohort)[code]
    assert sum(s.credits for s in merged.requirement_slots) == merged.graduation.total_credits


@pytest.mark.parametrize("cohort,code", REAL_CASES)
def test_slot_keys_are_unique(cohort, code):
    """教養教育科目ファイル由来と課程ファイル由来の `key` が衝突しないこと。"""
    slots = _merge_cohort(cohort)[code].requirement_slots
    assert slots, "要件枠が空"
    keys = [s.key for s in slots]
    assert len(keys) == len(set(keys))


@pytest.mark.parametrize("cohort,code", REAL_CASES)
def test_liberal_arts_slots_are_merged_in(cohort, code):
    """教養教育科目ファイルの `liberal.*` が課程側の要件枠に加わること。"""
    liberal, _ = _cohort(cohort)
    merged = _merge_cohort(cohort)[code]
    for slot in liberal.requirement_slots:
        assert slot.key in merged.slots_by_key


@pytest.mark.parametrize("cohort,code", REAL_CASES)
def test_prerequisites_are_merged_in(cohort, code):
    """教養教育科目ファイルの `prerequisites` が取り込まれること(§4.4.3 手順1)。

    選択外国語セミナーの先修要件を落とすと教養教育科目の先修判定ができない。
    """
    liberal, programs = _cohort(cohort)
    merged = _merge_cohort(cohort)[code]
    assert len(merged.prerequisites) == len(programs[code].prerequisites) + len(
        liberal.prerequisites
    )
    titles = {p.title for p in merged.prerequisites}
    for prerequisite in liberal.prerequisites:
        assert prerequisite.title in titles


@pytest.mark.parametrize("cohort,code", REAL_CASES)
def test_credit_caps_are_merged_in(cohort, code):
    """`credit_caps` は教養教育科目ファイル由来と課程ファイル由来の双方を持つこと。"""
    liberal, programs = _cohort(cohort)
    merged = _merge_cohort(cohort)[code]
    assert len(merged.credit_caps) == len(programs[code].credit_caps) + len(
        liberal.credit_caps
    )


@pytest.mark.parametrize("cohort,code", REAL_CASES)
def test_own_course_titles_are_unique(cohort, code):
    """設置科目の科目名が一意であること。導出した専門関連科目は対象外(§4.4.3)。"""
    titles = [c.title for c in _merge_cohort(cohort)[code].own_courses]
    assert len(titles) == len(set(titles))


@pytest.mark.parametrize("cohort", COHORTS)
def test_course_not_available_to_program_is_excluded(cohort):
    """`not_available_to_programs` の課程では当該教養教育科目を取り込まないこと。

    2024・2025年度入学コホートでは「生活の中の化学」→ 応用化学課程(05)の1件のみ。
    2026年度入学版は履修不可の指定が学部単位に変わったため0件になる(§5.1.3)。
    """
    liberal, programs = _cohort(cohort)
    excluded = [c for c in liberal.courses if c.not_available_to_programs]
    if liberal.liberal_arts_version == "2026":
        # 履修不可が学部単位になり、【先端理工学部履修不可】の科目は転記しない(§5.1.3)
        assert not excluded
        return

    # 0件のまま以降のループが素通りしないことの番兵。転記漏れを検出する
    assert excluded, f"{cohort} に not_available_to_programs を持つ科目がない"
    merged = _merge_cohort(cohort)
    for course in excluded:
        for code in programs:
            own_titles = {c.title for c in merged[code].own_courses}
            if code in course.not_available_to_programs:
                assert course.title not in own_titles
            else:
                assert course.title in own_titles


@pytest.mark.parametrize("cohort,code", REAL_CASES)
def test_related_courses_are_derived_from_other_programs(cohort, code):
    """他の全課程から専門関連科目が導出され `own=False` が付くこと(§4.4.3 手順2)。"""
    merged = _merge_cohort(cohort)[code]
    programs = _cohort(cohort)[1]
    derived = [c for c in merged.courses if not c.own]
    assert {c.source_program_code for c in derived} == set(programs) - {code}
    assert all(c.category == "専門関連科目" for c in derived)


@pytest.mark.parametrize("cohort,code", REAL_CASES)
def test_own_courses_carry_their_source(cohort, code):
    """設置科目の出典は教養教育科目ファイル("00")か当該課程のみであること。"""
    merged = _merge_cohort(cohort)[code]
    assert {c.source_program_code for c in merged.own_courses} == {"00", code}


@pytest.mark.parametrize("cohort,code", REAL_CASES)
def test_own_courses_are_not_derived_again(cohort, code):
    """自課程が開講している科目は他課程から導出しないこと(§4.4.1 の定義)。

    導出すると、たとえば課程01の「セミナーⅠ」が4単位と2単位の2件になる。
    """
    merged = _merge_cohort(cohort)[code]
    own_titles = {c.title for c in _cohort(cohort)[1][code].courses}
    assert not [c for c in merged.courses if not c.own and c.title in own_titles]


def test_seminar_1_is_not_derived_for_program_01():
    """課程01の「セミナーⅠ」は自課程の4単位1件のみであること。"""
    merged = _merge_cohort("admission-2024")["01"]
    seminars = [c for c in merged.courses if c.title == "セミナーⅠ"]
    assert [(c.source_program_code, c.credits, c.own) for c in seminars] == [("01", 4, True)]


def test_special_research_is_derived_for_program_01():
    """課程01の「特別研究」は他5課程から導出され `source_program_code` で区別できること。

    課程01は「特別研究Ⅰ / Ⅱ」であり自課程同名では落ちない。単位数は
    課程05のみ10単位で、他は6単位である。
    """
    merged = _merge_cohort("admission-2024")["01"]
    derived = sorted(
        (c.source_program_code, c.credits)
        for c in merged.courses
        if c.title == "特別研究"
    )
    assert derived == [("02", 6), ("03", 6), ("04", 6), ("05", 10), ("06", 6)]
    assert all(not c.own for c in merged.courses if c.title == "特別研究")


def test_program_fields_are_taken_from_the_program_file():
    """課程ファイル由来のフィールドはそのまま持つこと。"""
    programs = _cohort("admission-2024")[1]
    merged = _merge_cohort("admission-2024")["01"]
    program = programs["01"]
    assert merged.program == program.program
    assert merged.admission_year == program.admission_year
    assert merged.graduation == program.graduation
    assert merged.registration_limits == program.registration_limits
    assert merged.grade_up_requirements == program.grade_up_requirements
    assert merged.tracks == program.tracks


def test_slots_by_key_indexes_every_slot():
    merged = _merge_cohort("admission-2024")["01"]
    assert set(merged.slots_by_key) == {s.key for s in merged.requirement_slots}
    assert merged.slots_by_key["liberal.elective"].overflow_to == "free.all"


def test_program_itself_may_appear_in_others():
    """`others` に自分自身が含まれても結果が変わらないこと。"""
    liberal, programs = _cohort("admission-2024")
    with_self = merge(programs["01"], liberal, list(programs.values()))
    without_self = merge(
        programs["01"], liberal, [p for c, p in programs.items() if c != "01"]
    )
    assert with_self == without_self


# --- 異常系(合成データ) ---


@pytest.fixture
def synthetic() -> tuple[Curriculum, LiberalArtsCurriculum]:
    """マージ後検査だけを外せる最小の課程 + 教養教育科目の組。

    単体ファイルの検査(§4.4.3)は通り、マージ後の検査のみが問題になる形にする。
    """
    program = Curriculum.model_validate(
        {
            "program": {"code": "01", "name": "テスト課程"},
            "admission_year": 2024,
            "graduation": {"total_credits": 10},
            "requirement_slots": [
                {"key": "basic.required", "credits": 6, "accepts": {"type": "必修"}},
                {
                    "key": "free.all",
                    "credits": 0,
                    "accepts": {"category": "any"},
                },
            ],
            "registration_limits": {},
            "courses": [
                {
                    "title": "専門科目A",
                    "category": "専門基礎科目",
                    "type": "必修",
                    "credits": 2,
                    "grade": 1,
                    "term": "通年",
                }
            ],
        }
    )
    liberal = LiberalArtsCurriculum.model_validate(
        {
            "admission_year": 2024,
            "liberal_arts_version": "until-2025",
            "requirement_slots": [
                {
                    "key": "liberal.elective",
                    "credits": 4,
                    "accepts": {"category": "教養教育科目"},
                    "overflow_to": "free.all",
                }
            ],
            "courses": [
                {
                    "title": "教養科目A",
                    "category": "教養教育科目",
                    "subcategory": "人文科学系科目",
                    "type": "選択",
                    "credits": 2,
                    "grade": 1,
                    "term": "通年",
                }
            ],
        }
    )
    return program, liberal


def test_synthetic_baseline_merges(synthetic):
    """合成データがそのままでは4検査を通ること(以下の異常系の対照)。"""
    program, liberal = synthetic
    merged = merge(program, liberal, [])
    assert sum(s.credits for s in merged.requirement_slots) == 10
    assert [c.title for c in merged.own_courses] == ["専門科目A", "教養科目A"]


def test_duplicate_slot_key_is_rejected(synthetic):
    """課程側と教養側で `requirement_slots[].key` が衝突したら失敗すること。"""
    program, liberal = synthetic
    clashing = deepcopy(program)
    clashing.requirement_slots[0].key = "liberal.elective"
    clashing.requirement_slots[0].credits = 6
    with pytest.raises(CurriculumMergeError, match="key が重複"):
        merge(clashing, liberal, [])


def test_slot_credits_total_mismatch_is_rejected(synthetic):
    """要件枠の合計が `graduation.total_credits` と食い違ったら失敗すること。"""
    program, liberal = synthetic
    mismatched = deepcopy(program)
    mismatched.graduation.total_credits = 11
    with pytest.raises(CurriculumMergeError, match="total_credits"):
        merge(mismatched, liberal, [])


def test_unresolved_overflow_to_is_rejected(synthetic):
    """`overflow_to` の参照先が要件枠に無ければ失敗すること。"""
    program, liberal = synthetic
    dangling = deepcopy(liberal)
    dangling.requirement_slots[0].overflow_to = "free.nonexistent"
    with pytest.raises(CurriculumMergeError, match="存在しません"):
        merge(program, dangling, [])


def test_circular_overflow_to_is_rejected(synthetic):
    """`overflow_to` が循環していたら失敗すること。"""
    program, liberal = synthetic
    looping = deepcopy(program)
    looping.requirement_slots[0].overflow_to = "free.all"
    looping.requirement_slots[1].overflow_to = "basic.required"
    with pytest.raises(CurriculumMergeError, match="循環"):
        merge(looping, liberal, [])


def test_duplicate_own_course_title_is_rejected(synthetic):
    """教養教育科目と専攻科目で科目名が衝突したら失敗すること。"""
    program, liberal = synthetic
    clashing = deepcopy(liberal)
    clashing.courses[0].title = "専門科目A"
    with pytest.raises(CurriculumMergeError, match="title が重複"):
        merge(program, clashing, [])


def test_duplicate_derived_course_title_is_kept(synthetic):
    """他課程どうしで同名の導出科目は全レコードを保持すること(重複検査の対象外)。"""
    program, liberal = synthetic
    other_a = deepcopy(program)
    other_a.program.code = "02"
    other_a.courses[0].title = "他課程科目"
    other_a.courses[0].credits = 6
    other_b = deepcopy(program)
    other_b.program.code = "03"
    other_b.courses[0].title = "他課程科目"
    other_b.courses[0].credits = 10
    merged = merge(program, liberal, [other_a, other_b])
    derived = [c for c in merged.courses if c.title == "他課程科目"]
    assert sorted((c.source_program_code, c.credits) for c in derived) == [
        ("02", 6),
        ("03", 10),
    ]


def test_merge_error_names_the_program(synthetic):
    """例外メッセージにどの課程・入学年度かが出ること(転記ミスの特定のため)。"""
    program, liberal = synthetic
    mismatched = deepcopy(program)
    mismatched.graduation.total_credits = 11
    with pytest.raises(CurriculumMergeError, match=r"01\(テスト課程\) / 2024年度入学"):
        merge(mismatched, liberal, [])
