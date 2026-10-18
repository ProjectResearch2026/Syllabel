"""履修要項 YAML スキーマのテスト。design.md §5.1.2 / §5.1.3 / §5.1.5。

実データ(`curricula/`)が `model_validate` を通ることと、§5.1.5 の規約から
外れた YAML が弾かれることの2点を確かめる。マージ後にしか成立しない検査
(スロット合計 = `total_credits`、`overflow_to` の解決と循環、参照解決)は
ローダ・マージ側の責務であり、ここでは扱わない(§4.4.3)。
"""

from copy import deepcopy
from pathlib import Path

import pytest
import yaml
from pydantic import ValidationError

from app.schemas.curriculum import (
    Accepts,
    Curriculum,
    CurriculumCourse,
    LiberalArtsCurriculum,
    RequirementSlot,
    SemesterLimit,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
CURRICULA_DIR = REPO_ROOT / "curricula"
LIBERAL_ARTS_FILENAME = "00-liberal-arts.yaml"


def _load(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _cohort_files(cohort: str) -> list[Path]:
    return sorted((CURRICULA_DIR / cohort).glob("*.yaml"))


def _all_files() -> list[Path]:
    return sorted(CURRICULA_DIR.glob("admission-*/*.yaml"))


def _id(path: Path) -> str:
    return f"{path.parent.name}/{path.name}"


# --- 実データ(§5.1.2 / §5.1.3) ---


def test_admission_2024_has_seven_files():
    """2024年度入学コホートは教養1 + 課程6の7ファイルからなる(§4.4.2)。"""
    files = _cohort_files("admission-2024")
    assert [f.name for f in files] == [
        "00-liberal-arts.yaml",
        "01-suri-joho-kagaku.yaml",
        "02-chinou-joho-media.yaml",
        "03-denshi-joho-tsushin.yaml",
        "04-kikai-kogaku-robotics.yaml",
        "05-oyo-kagaku.yaml",
        "06-kankyo-seitai-kogaku.yaml",
    ]


def test_every_cohort_has_exactly_one_liberal_arts_file():
    """各 `admission-<年度>/` に `00-liberal-arts.yaml` がちょうど1つある(§4.4.3)。"""
    cohorts = sorted(p for p in CURRICULA_DIR.glob("admission-*") if p.is_dir())
    assert cohorts
    for cohort in cohorts:
        assert (cohort / LIBERAL_ARTS_FILENAME).is_file(), cohort


@pytest.mark.parametrize("path", _all_files(), ids=_id)
def test_real_yaml_validates(path: Path):
    """`curricula/` の全ファイルが `model_validate` を通ること。"""
    model = LiberalArtsCurriculum if path.name == LIBERAL_ARTS_FILENAME else Curriculum
    model.model_validate(_load(path))


def test_program_file_content():
    """課程ファイルの代表的な値が読み取れること(数理・情報科学課程 2024年度入学)。"""
    curriculum = Curriculum.model_validate(
        _load(CURRICULA_DIR / "admission-2024" / "01-suri-joho-kagaku.yaml")
    )
    assert curriculum.program.code == "01"
    assert curriculum.admission_year == 2024
    assert curriculum.graduation.total_credits == 124
    assert curriculum.graduation.excluded_types == ["随意"]

    slots = {slot.key: slot for slot in curriculum.requirement_slots}
    # 課程ファイルは liberal.* を持たず、専攻科目・フリーゾーンの8枠のみを定義する(§5.1.2)
    assert not any(key.startswith("liberal.") for key in slots)
    assert slots["free.all"].accepts.category == "any"
    assert slots["basic.elective"].credits == 0
    assert slots["basic.elective"].overflow_to == "free.faculty"

    # tracks は「コース毎の履修要件」別表の1セルをそのまま転記する(§5.1.5)
    assert curriculum.tracks is not None
    tracks = {track.key: track for track in curriculum.tracks}
    assert [(c.slot, c.track_group, c.pool, c.min) for c in tracks["math"].constraints] == [
        ("applied.required_elective", "数学系", 18, 13),
        ("applied.elective", "数学系", 21, 14),
    ]
    # 総合コースは両群から浅く取る。1コースが複数の科目群に制約を持つ形
    assert {c.track_group for c in tracks["sogo"].constraints} == {"数学系", "情報系"}

    # 課程ファイルの courses は専攻科目のみ(§5.1.2)
    assert {course.category for course in curriculum.courses} <= {
        "専門基礎科目",
        "専門応用科目",
    }
    assert all(course.subcategory is None for course in curriculum.courses)


def test_liberal_arts_file_content():
    """教養教育科目ファイルの代表的な値が読み取れること(2024年度入学)。"""
    liberal = LiberalArtsCurriculum.model_validate(
        _load(CURRICULA_DIR / "admission-2024" / LIBERAL_ARTS_FILENAME)
    )
    assert liberal.admission_year == 2024
    assert liberal.liberal_arts_version == "until-2025"
    assert liberal.duplicate_of is None

    # liberal.* の唯一の定義元(§5.1.3)
    assert {slot.key for slot in liberal.requirement_slots} == {
        "liberal.buddhism",
        "liberal.language.required",
        "liberal.general.humanities",
        "liberal.general.social",
        "liberal.general.sports",
        "liberal.elective",
    }

    courses = {course.title: course for course in liberal.courses}
    assert courses["仏教の思想A"].subcategory == "「仏教の思想」科目"
    # 基幹科目(設置科目表の●印)は type: 選択必修 で表す(§5.1.5)
    assert courses["倫理学入門"].type == "選択必修"
    slots = {slot.key: slot for slot in liberal.requirement_slots}
    assert slots["liberal.general.humanities"].accepts.model_dump(exclude_none=True) == {
        "subcategory": "人文科学系科目",
        "type": "選択必修",
    }
    # 応用化学課程では履修不可(設置科目表 備考。§5.1.5)
    assert courses["生活の中の化学"].not_available_to_programs == ["05"]

    # credit_caps: 超過分をどこにも計上しない overflow_to: null(§5.1.5)
    caps = {tuple(cap.titles): cap for cap in liberal.credit_caps}
    assert caps[("教養教育科目特別講義",)].max_credits == 2
    assert caps[("教養教育科目特別講義",)].overflow_to is None

    # 選択外国語科目の先修制。原文の notes を必ず持つ(§5.1.5)
    german = next(p for p in liberal.prerequisites if p.title == "ドイツ語セミナーⅠA")
    assert german.any_of == ["ドイツ語ⅠA", "ドイツ語ⅠB", "ドイツ語ⅡA", "ドイツ語ⅡB"]
    assert german.notes


def test_duplicate_of_records_source_path():
    """複製ファイルは `duplicate_of` に複製元の curricula/ 起点パスを持つ(§5.1.5)。"""
    path = CURRICULA_DIR / "admission-2025" / LIBERAL_ARTS_FILENAME
    if not path.is_file():
        pytest.skip("admission-2025 は未追加")
    liberal = LiberalArtsCurriculum.model_validate(_load(path))
    assert liberal.duplicate_of == "admission-2024/00-liberal-arts.yaml"


def test_prerequisite_structures():
    """先修要件が min_credits / as_of / all_of に構造化されていること(§5.1.5)。"""
    curriculum = Curriculum.model_validate(
        _load(CURRICULA_DIR / "admission-2024" / "01-suri-joho-kagaku.yaml")
    )
    prerequisites = {p.title: p for p in curriculum.prerequisites}

    # accepts 省略 = 卒業要件総修得単位数
    enshu = prerequisites["数理情報演習"]
    assert enshu.min_credits is not None
    assert enshu.min_credits[0].credits == 52
    assert enshu.min_credits[0].accepts is None

    # 「履修の前年度終了時点」は前年次の後期
    semi = prerequisites["セミナーⅠ"]
    assert semi.as_of is not None
    assert (semi.as_of.grade, semi.as_of.term) == (2, "後期")

    assert prerequisites["特別研究Ⅱ"].all_of == ["特別研究Ⅰ", "セミナーⅡ"]


def test_registration_limits_hold_one_kind_of_cap_each():
    """`by_semester` の各要素が学期上限・年間上限のどちらか一方のみを持つ(§4.4.3)。"""
    for path in _all_files():
        if path.name == LIBERAL_ARTS_FILENAME:
            continue
        curriculum = Curriculum.model_validate(_load(path))
        for limit in curriculum.registration_limits.by_semester:
            assert (limit.max_credits_per_semester is None) != (
                limit.max_credits_per_year is None
            ), _id(path)


# --- 最小構成の生成(異常系のベースライン) ---


def _minimal_course(**overrides) -> dict:
    course = {
        "title": "微積分及び演習Ⅱ",
        "category": "専門応用科目",
        "type": "選択必修",
        "credits": 3,
        "grade": 1,
        "term": "後期",
        "quarters": ["3Q", "4Q"],
    }
    course.update(overrides)
    return course


def _minimal_liberal_course(**overrides) -> dict:
    course = {
        "title": "仏教の思想A",
        "category": "教養教育科目",
        "subcategory": "「仏教の思想」科目",
        "type": "必修",
        "credits": 2,
        "grade": 1,
        "term": "前期",
        "quarters": ["1Q", "2Q"],
    }
    course.update(overrides)
    return course


def _minimal_curriculum(**overrides) -> dict:
    data = {
        "program": {"code": "01", "name": "数理・情報科学課程", "name_aliases": []},
        "admission_year": 2024,
        "curriculum_version": "2020年度以降入学生",
        "duplicate_of": None,
        "graduation": {"total_credits": 124, "excluded_types": ["随意"]},
        "requirement_slots": [
            {
                "key": "applied.required_elective", "name": "applied.required_elective",
                "credits": 22,
                "accepts": {"category": "専門応用科目", "type": "選択必修"},
                "overflow_to": "applied.elective",
            },
            {
                "key": "applied.elective", "name": "applied.elective",
                "credits": 31,
                "accepts": {"category": "専門応用科目", "type": ["選択必修", "選択"]},
            },
        ],
        "registration_limits": {
            "by_semester": [{"semesters": [1, 2], "max_credits_per_semester": 22}]
        },
        "courses": [_minimal_course()],
    }
    data.update(overrides)
    return data


def _minimal_liberal_arts(**overrides) -> dict:
    data = {
        "admission_year": 2024,
        "liberal_arts_version": "until-2025",
        "applies_to": ["先端理工学部"],
        "duplicate_of": None,
        "requirement_slots": [
            {
                "key": "liberal.buddhism", "name": "liberal.buddhism",
                "credits": 4,
                "accepts": {"subcategory": "「仏教の思想」科目", "type": "必修"},
            }
        ],
        "courses": [_minimal_liberal_course()],
    }
    data.update(overrides)
    return data


def test_minimal_documents_validate():
    """異常系のベースラインとなる最小構成が valid であること。"""
    Curriculum.model_validate(_minimal_curriculum())
    LiberalArtsCurriculum.model_validate(_minimal_liberal_arts())


# --- extra="forbid"(転記時の typo キー検出) ---


@pytest.mark.parametrize(
    "make, key",
    [
        (_minimal_curriculum, "total_credits"),
        (_minimal_curriculum, "graduation_requirements"),
    ],
)
def test_unknown_top_level_key_is_rejected(make, key):
    with pytest.raises(ValidationError, match="extra_forbidden|Extra inputs"):
        Curriculum.model_validate(make(**{key: 124}))


def test_unknown_course_key_is_rejected():
    """`credit` のような typo を黙って捨てない。"""
    data = _minimal_curriculum(courses=[_minimal_course(credit=3)])
    with pytest.raises(ValidationError, match="extra_forbidden|Extra inputs"):
        Curriculum.model_validate(data)


def test_unknown_accepts_key_is_rejected():
    with pytest.raises(ValidationError, match="extra_forbidden|Extra inputs"):
        Accepts.model_validate({"categoly": "専門応用科目"})


# --- 列挙値(§5.1.5) ---


@pytest.mark.parametrize(
    "field, value",
    [
        ("type", "必須"),
        ("term", "前"),
        ("category", "教養科目"),
        ("credits", "三"),
        ("credits", 0),
        ("grade", 5),
        ("grade", 0),
    ],
)
def test_invalid_course_field_is_rejected(field, value):
    with pytest.raises(ValidationError):
        CurriculumCourse.model_validate(_minimal_course(**{field: value}))


def test_invalid_quarter_is_rejected():
    with pytest.raises(ValidationError):
        CurriculumCourse.model_validate(_minimal_course(term="後期", quarters=["5Q"]))


def test_faculty_provided_subcategory_is_accepted():
    """`学部・センター等提供科目` は2026年度入学版で加わった9番目の区分(§5.1.5)。"""
    parsed = CurriculumCourse.model_validate(
        _minimal_liberal_course(subcategory="学部・センター等提供科目")
    )
    assert parsed.subcategory == "学部・センター等提供科目"


def test_invalid_subcategory_is_rejected():
    with pytest.raises(ValidationError):
        CurriculumCourse.model_validate(
            _minimal_liberal_course(subcategory="言語科目")  # 旧スキーマの値(§5.1.5)
        )


def test_credits_is_required_for_every_course():
    """`credits` は全科目必須(§5.1.5)。旧スキーマの `float | None` は許さない。"""
    course = _minimal_course()
    del course["credits"]
    with pytest.raises(ValidationError, match="credits"):
        CurriculumCourse.model_validate(course)

    with pytest.raises(ValidationError, match="credits"):
        CurriculumCourse.model_validate(_minimal_course(credits=None))


# --- 科目レベルの整合(§5.1.5) ---


def test_subcategory_belongs_to_liberal_arts_courses_only():
    with pytest.raises(ValidationError, match="専攻科目は subcategory を持ちません"):
        CurriculumCourse.model_validate(_minimal_course(subcategory="人文科学系科目"))

    course = _minimal_liberal_course()
    del course["subcategory"]
    with pytest.raises(ValidationError, match="subcategory が必要"):
        CurriculumCourse.model_validate(course)


def test_kikan_is_no_longer_a_field():
    """`kikan` は廃止した。基幹科目は `type: 選択必修` で表す(§5.1.5)。

    未知のキーを拒否するため、古い書き方の YAML はロード時に止まる。
    """
    with pytest.raises(ValidationError, match="kikan"):
        CurriculumCourse.model_validate(
            _minimal_liberal_course(subcategory="人文科学系科目", type="選択必修", kikan=True)
        )
    with pytest.raises(ValidationError, match="kikan"):
        Accepts.model_validate({"subcategory": "人文科学系科目", "kikan": True})


def test_liberal_arts_2026_has_no_kikan_in_slot_names():
    """2026年度入学版は基幹科目の指定が無い。人文・社会の全科目が選択必修であり、
    枠の名前に〈基幹〉を付けない(§5.1.3)。"""
    liberal = LiberalArtsCurriculum.model_validate(
        _load(CURRICULA_DIR / "admission-2026" / LIBERAL_ARTS_FILENAME)
    )
    slots = {slot.key: slot for slot in liberal.requirement_slots}
    assert slots["liberal.general.humanities"].name == "教養教育科目(選択必修・人文)"
    assert slots["liberal.general.social"].name == "教養教育科目(選択必修・社会)"
    for sub in ("人文科学系科目", "社会科学系科目"):
        assert all(c.type == "選択必修" for c in liberal.courses if c.subcategory == sub)


@pytest.mark.parametrize(
    "term, quarters",
    [
        ("前期", ["3Q"]),
        ("後期", ["2Q", "3Q"]),
        ("通年", ["1Q", "2Q", "3Q", "4Q"]),
        ("サ集", ["1Q"]),
    ],
)
def test_term_and_quarters_must_agree(term, quarters):
    """`term` と `quarters` の整合(§5.1.5)。"""
    with pytest.raises(ValidationError):
        CurriculumCourse.model_validate(_minimal_course(term=term, quarters=quarters))


@pytest.mark.parametrize("term", ["前期", "後期"])
def test_semester_course_may_omit_quarters(term):
    """`前期` / `後期` でも `quarters` は任意(§5.1.5)。

    教養教育科目はクォーター制の対象外であり、`term` が `前期` / `後期` でも
    `quarters` を持たない(§5.1.3)。`quarters` の欠落は「不明」ではなく
    「クォーターに分割されない開講形態である」ことを表す。
    """
    course = _minimal_course(term=term)
    del course["quarters"]
    parsed = CurriculumCourse.model_validate(course)
    assert parsed.quarters is None


@pytest.mark.parametrize("term", ["通年", "サ集"])
def test_year_long_and_summer_courses_have_no_quarters(term):
    course = _minimal_course(term=term)
    del course["quarters"]
    parsed = CurriculumCourse.model_validate(course)
    assert parsed.quarters is None


def test_duplicated_quarters_are_rejected():
    with pytest.raises(ValidationError, match="quarters が重複"):
        CurriculumCourse.model_validate(_minimal_course(term="後期", quarters=["3Q", "3Q"]))


# --- accepts の記法(§5.1.5) ---


def test_accepts_accepts_scalar_list_and_any():
    assert Accepts.model_validate({"category": "専門応用科目"}).category == "専門応用科目"
    assert Accepts.model_validate({"type": ["選択必修", "選択"]}).type == ["選択必修", "選択"]
    assert Accepts.model_validate({"category": "any"}).category == "any"
    # 複数キーは AND
    parsed = Accepts.model_validate({"subcategory": "人文科学系科目", "type": "選択必修"})
    assert (parsed.subcategory, parsed.type) == ("人文科学系科目", "選択必修")


def test_any_is_reserved_for_category_only():
    """`any` という名前の区分は存在しない(§5.1.5)。"""
    with pytest.raises(ValidationError):
        Accepts.model_validate({"type": "any"})
    with pytest.raises(ValidationError):
        Accepts.model_validate({"category": ["any", "専門応用科目"]})


def test_empty_accepts_is_rejected():
    with pytest.raises(ValidationError, match="accepts が空"):
        Accepts.model_validate({})


# --- 要件枠(§5.1.2 / §5.1.3) ---


def test_slot_credits_zero_is_valid():
    """`credits: 0` は「枠を持たず overflow_to 先に計上する」を表す(§5.1.2)。"""
    slot = RequirementSlot.model_validate(
        {
            "key": "related", "name": "related",
            "credits": 0,
            "accepts": {"category": "専門関連科目"},
            "overflow_to": "free.faculty",
        }
    )
    assert slot.credits == 0


def test_slot_cannot_overflow_to_itself():
    with pytest.raises(ValidationError, match="自分自身"):
        RequirementSlot.model_validate(
            {
                "key": "free.all", "name": "free.all",
                "credits": 10,
                "accepts": {"category": "any"},
                "overflow_to": "free.all",
            }
        )


def test_program_file_must_not_define_liberal_slots():
    """`liberal.*` の定義元は教養教育科目ファイルのみ(§5.1.2)。"""
    data = _minimal_curriculum()
    data["requirement_slots"].append(
        {"key": "liberal.elective", "name": "liberal.elective", "credits": 12, "accepts": {"category": "教養教育科目"}}
    )
    with pytest.raises(ValidationError, match="liberal.\\* の要件枠を持ちません"):
        Curriculum.model_validate(data)


def test_liberal_arts_file_must_only_define_liberal_slots():
    data = _minimal_liberal_arts()
    data["requirement_slots"].append(
        {"key": "free.all", "name": "free.all", "credits": 10, "accepts": {"category": "any"}}
    )
    with pytest.raises(ValidationError, match="liberal.\\* の要件枠のみ"):
        LiberalArtsCurriculum.model_validate(data)


def test_duplicated_slot_key_in_one_file_is_rejected():
    data = _minimal_curriculum()
    data["requirement_slots"].append(deepcopy(data["requirement_slots"][0]))
    with pytest.raises(ValidationError, match="requirement_slots\\[\\].key が重複"):
        Curriculum.model_validate(data)


def test_duplicated_course_title_in_one_file_is_rejected():
    data = _minimal_curriculum(courses=[_minimal_course(), _minimal_course()])
    with pytest.raises(ValidationError, match="courses\\[\\].title が重複"):
        Curriculum.model_validate(data)


# --- ファイルの役割分担(§5.1.2 / §5.1.3) ---


def test_program_file_rejects_liberal_arts_courses():
    """教養教育科目は 00-liberal-arts.yaml が唯一の定義元(§5.1.2)。"""
    data = _minimal_curriculum(courses=[_minimal_liberal_course()])
    with pytest.raises(ValidationError, match="専攻科目"):
        Curriculum.model_validate(data)


def test_program_file_rejects_transcribed_related_courses():
    """`専門関連科目` は転記せず他課程ファイルから導出する(§5.1.5)。"""
    data = _minimal_curriculum(courses=[_minimal_course(category="専門関連科目")])
    with pytest.raises(ValidationError, match="専攻科目"):
        Curriculum.model_validate(data)


def test_liberal_arts_file_rejects_major_courses():
    data = _minimal_liberal_arts(courses=[_minimal_course()])
    with pytest.raises(ValidationError, match="教養教育科目のみ"):
        LiberalArtsCurriculum.model_validate(data)


def test_track_without_constraints_is_valid():
    """別表で下限が示されていないコースの `constraints` は空リスト(§5.1.5)。"""
    data = _minimal_curriculum(
        tracks=[{"key": "sogo", "name": "総合コース", "constraints": []}]
    )
    curriculum = Curriculum.model_validate(data)
    assert curriculum.tracks is not None
    assert curriculum.tracks[0].constraints == []


def test_duplicated_track_key_is_rejected():
    data = _minimal_curriculum(
        tracks=[
            {"key": "math", "name": "数学系コース", "constraints": []},
            {"key": "math", "name": "情報系コース", "constraints": []},
        ]
    )
    with pytest.raises(ValidationError, match="tracks\\[\\].key が重複"):
        Curriculum.model_validate(data)


def test_track_groups_belong_to_program_files():
    data = _minimal_liberal_arts(
        courses=[_minimal_liberal_course(track_groups=["数学系"])]
    )
    with pytest.raises(ValidationError, match="track_groups は課程ファイル専用"):
        LiberalArtsCurriculum.model_validate(data)


def test_not_available_to_programs_belongs_to_liberal_arts_file():
    """出典が教養教育科目の設置科目表の備考欄であるため(§5.1.5)。"""
    data = _minimal_curriculum(courses=[_minimal_course(not_available_to_programs=["05"])])
    with pytest.raises(ValidationError, match="not_available_to_programs"):
        Curriculum.model_validate(data)


def test_course_group_requires_2026_liberal_arts_version():
    """`course_group` / `subgroup` は2026年度入学版でのみ用いる(§5.1.3 / §5.1.5)。"""
    course = _minimal_liberal_course(
        course_group="基礎教養", subgroup="スタートアップ科目群"
    )
    with pytest.raises(ValidationError, match="liberal_arts_version: 2026"):
        LiberalArtsCurriculum.model_validate(_minimal_liberal_arts(courses=[course]))

    LiberalArtsCurriculum.model_validate(
        _minimal_liberal_arts(liberal_arts_version="2026", courses=[course])
    )


def test_invalid_subgroup_is_rejected():
    with pytest.raises(ValidationError):
        LiberalArtsCurriculum.model_validate(
            _minimal_liberal_arts(
                liberal_arts_version="2026",
                courses=[_minimal_liberal_course(subgroup="教養科目群")],
            )
        )


# --- 課程固有の規定(§5.1.2) ---


def test_semester_limit_requires_exactly_one_kind_of_cap():
    """§4.4.3 の起動時バリデーション。"""
    SemesterLimit.model_validate({"semesters": [1, 2], "max_credits_per_semester": 22})
    SemesterLimit.model_validate({"semesters": [7, 8], "max_credits_per_year": 48})

    with pytest.raises(ValidationError, match="どちらか一方のみ"):
        SemesterLimit.model_validate(
            {"semesters": [1], "max_credits_per_semester": 22, "max_credits_per_year": 48}
        )
    with pytest.raises(ValidationError, match="どちらか一方のみ"):
        SemesterLimit.model_validate({"semesters": [1]})


def test_prerequisite_notes_is_required():
    """`notes` は履修要項の原文であり必ず書く(§5.1.5)。"""
    data = _minimal_curriculum(
        prerequisites=[{"title": "微積分及び演習Ⅱ", "min_credits": [{"credits": 52}]}]
    )
    with pytest.raises(ValidationError, match="notes"):
        Curriculum.model_validate(data)


def test_prerequisite_min_credits_rejects_accepts_with_from():
    """`accepts` と `from` は同時に書けない(どちらで数えるか曖昧になる)。"""
    data = _minimal_curriculum(
        prerequisites=[
            {
                "title": "微積分及び演習Ⅱ",
                "min_credits": [
                    {"credits": 2, "accepts": {"type": "必修"}, "from": ["微積分及び演習Ⅰ"]}
                ],
                "notes": "原文。",
            }
        ]
    )
    with pytest.raises(ValidationError, match="accepts と from"):
        Curriculum.model_validate(data)


@pytest.mark.parametrize(
    "one_of, message",
    [
        ([{"all_of": ["A"]}], "at least 2"),
        ([{"all_of": ["A"]}, {"as_of": {"grade": 1, "term": "前期"}}], "選択肢が空"),
    ],
)
def test_prerequisite_one_of_needs_two_non_empty_alternatives(one_of, message):
    """`one_of` は選択肢2つ以上、各選択肢は判定できる条件を持つ。"""
    data = _minimal_curriculum(
        prerequisites=[{"title": "微積分及び演習Ⅱ", "one_of": one_of, "notes": "原文。"}]
    )
    with pytest.raises(ValidationError, match=message):
        Curriculum.model_validate(data)


def test_prerequisite_from_is_read_from_yaml_key():
    """YAML のキーは `from`(Python の予約語なので属性は `from_`)。"""
    data = _minimal_curriculum(
        prerequisites=[
            {
                "title": "微積分及び演習Ⅱ",
                "min_credits": [{"credits": 2, "from": ["微積分及び演習Ⅰ"]}],
                "notes": "原文。",
            }
        ]
    )
    rule = Curriculum.model_validate(data).prerequisites[0]
    assert rule.min_credits[0].from_ == ["微積分及び演習Ⅰ"]
    assert rule.referenced_titles() == ["微積分及び演習Ⅱ", "微積分及び演習Ⅰ"]


def test_old_prerequisite_format_is_rejected():
    """旧形式 `course_title` / `conditions` は廃止(§5.1.5)。"""
    data = _minimal_curriculum(
        prerequisites=[
            {
                "course_title": "数理情報演習",
                "grade": 3,
                "term": "前期",
                "conditions": "卒業要件総修得単位数52単位以上",
            }
        ]
    )
    with pytest.raises(ValidationError):
        Curriculum.model_validate(data)


@pytest.mark.parametrize("code", ["1", "001", "AA", ""])
def test_program_code_must_be_two_digits(code):
    """課程コードは2桁(§4.4.2)。"""
    data = _minimal_curriculum()
    data["program"]["code"] = code
    with pytest.raises(ValidationError):
        Curriculum.model_validate(data)


@pytest.mark.parametrize(
    "value",
    ["00-liberal-arts.yaml", "curricula/admission-2024/00-liberal-arts.yaml", "admission-2024"],
)
def test_duplicate_of_must_be_a_curricula_relative_path(value):
    """`duplicate_of` は `curricula/` を起点とした複製元のパス(§5.1.5)。"""
    with pytest.raises(ValidationError):
        LiberalArtsCurriculum.model_validate(_minimal_liberal_arts(duplicate_of=value))


def test_optional_fields_may_be_omitted():
    """任意フィールドは省略・null を許容する(§4.4.3)。"""
    data = _minimal_curriculum()
    for key in ("curriculum_version", "duplicate_of"):
        del data[key]
    curriculum = Curriculum.model_validate(data)
    assert curriculum.curriculum_version is None
    assert curriculum.duplicate_of is None
    assert curriculum.tracks is None
    assert curriculum.prerequisites == []
    assert curriculum.grade_up_requirements == []
    assert curriculum.credit_caps == []


def test_no_camel_case_alias():
    """YAML は snake_case のまま。camelCase 化は API のレスポンスモデル側(§6.1)。"""
    data = _minimal_curriculum()
    data["admissionYear"] = data.pop("admission_year")
    with pytest.raises(ValidationError):
        Curriculum.model_validate(data)
