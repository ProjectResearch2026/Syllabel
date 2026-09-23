"""課程ファイル・教養教育科目ファイル・他課程ファイルのマージ。design.md §4.4.3。

課程ファイル(`Curriculum`)を土台に、同一 `admission-<年度>/` ディレクトリの
教養教育科目ファイル(`LiberalArtsCurriculum`)と他課程ファイルを取り込み、
課程ごとに1つの完全なオブジェクト(`MergedCurriculum`)を組み立てる。
**参照はすべて同一ディレクトリ内で閉じ、他の入学年度のファイルを読まない**
(§4.4.3)。ディレクトリの走査とファイルの読み込みは `loader.py` の責務であり、
本モジュールは検証済みのモデルだけを受け取る。

単体ファイルでは成立せずマージ後にしか検査できない4件(§4.4.3)をここで行い、
違反は `CurriculumMergeError` として送出する。起動を止めるか否かは呼び出し側
(`loader.py`)の判断とする。
"""

from collections.abc import Sequence

from pydantic import BaseModel, ConfigDict

from app.curricula.titles import normalize_title
from app.schemas.curriculum import (
    CreditCap,
    Curriculum,
    CurriculumCourse,
    GradeUpRequirement,
    Graduation,
    LiberalArtsCurriculum,
    Prerequisite,
    Program,
    RegistrationLimits,
    RequirementSlot,
    Track,
)

# 教養教育科目ファイルの出典コード(§4.4.2 の課程コードに対応する予約値)
LIBERAL_ARTS_PROGRAM_CODE = "00"
# 他課程から導出した科目に付け替える区分(§4.4.1 / §4.4.3 手順2)
RELATED_CATEGORY = "専門関連科目"


class CurriculumMergeError(Exception):
    """マージ後の整合性検査に違反した(§4.4.3)。"""


class MergedCourse(CurriculumCourse):
    """マージ後の科目1件。出典と、当該課程の設置科目か否かを併せ持つ。

    `own` は当該課程の**設置科目**であることを表す。教養教育科目ファイル由来の
    教養教育科目(`not_available_to_programs` による除外後)と課程ファイルの
    専攻科目が `own=True`、他課程から導出した専門関連科目が `own=False` となる。
    `courses[].title` の重複検査の対象は前者に限る(§4.4.3)。

    `source_program_code` は出典のファイルを指す。教養教育科目は `"00"`、
    当該課程の専攻科目は当該課程のコード、導出した専門関連科目は導出元課程の
    コードである。同名の導出科目を課程ごとに区別する鍵であり(他課程どうしで
    同名の科目は全レコードを保持する)、`offerings` のどのファイルから
    シラバスコードを引くかの判定にも用いる(§5.1.4)。
    """

    own: bool
    source_program_code: str


class MergedCurriculum(BaseModel):
    """課程1つ分のマージ済み履修要項(§4.4.3)。

    `program` / `admission_year` / `curriculum_version` / `graduation` /
    `registration_limits` / `grade_up_requirements` / `tracks` は課程ファイル由来を
    そのまま持つ。`requirement_slots` / `credit_caps` / `prerequisites` /
    `courses` は課程ファイル由来のものに教養教育科目ファイル由来のものを続けた
    連結であり、`courses` にはさらに他課程から導出した専門関連科目が続く。
    """

    model_config = ConfigDict(extra="forbid")

    program: Program
    admission_year: int
    curriculum_version: str | None = None
    graduation: Graduation
    registration_limits: RegistrationLimits
    grade_up_requirements: list[GradeUpRequirement] = []
    tracks: list[Track] | None = None
    requirement_slots: list[RequirementSlot]
    credit_caps: list[CreditCap] = []
    prerequisites: list[Prerequisite] = []
    courses: list[MergedCourse]

    @property
    def own_courses(self) -> list[MergedCourse]:
        """当該課程の設置科目(教養教育科目 + 専攻科目)。導出した専門関連科目を含まない。"""
        return [c for c in self.courses if c.own]

    @property
    def slots_by_key(self) -> dict[str, RequirementSlot]:
        """`key` で引ける要件枠。`key` の一意性はマージ時に検査済み(§4.4.3)。"""
        return {slot.key: slot for slot in self.requirement_slots}


def _as_merged(course: CurriculumCourse, *, own: bool, source_program_code: str,
               category: str | None = None) -> MergedCourse:
    """`CurriculumCourse` に出典を付けて `MergedCourse` にする。

    `category` を与えたときはその区分に置き換える(導出した専門関連科目)。
    """
    fields = course.model_dump()
    if category is not None:
        fields["category"] = category
    return MergedCourse(**fields, own=own, source_program_code=source_program_code)


def merge(
    program: Curriculum,
    liberal: LiberalArtsCurriculum,
    others: Sequence[Curriculum],
) -> MergedCurriculum:
    """課程ファイルに教養教育科目ファイルと他課程ファイルを取り込む(§4.4.3)。

    引数はいずれも**同一の `admission-<年度>/` ディレクトリ**のファイルであること。
    `others` に `program` 自身が含まれていても差し支えない(課程コードで除外する)。

    Raises:
        CurriculumMergeError: マージ後の整合性検査に違反した場合。
    """
    code = program.program.code

    slots = [*program.requirement_slots, *liberal.requirement_slots]
    credit_caps = [*program.credit_caps, *liberal.credit_caps]
    # 決定事項: 先修制は課程ファイルと教養教育科目ファイルの双方が同じ形で持ち(§5.1.5)、
    # いずれも規則レイヤとして履修提案の先修条件の判定(§7.2.1)に用いるため、
    # 1つのリストに保持する(§4.4.3)
    prerequisites = [*program.prerequisites, *liberal.prerequisites]

    courses = [
        _as_merged(c, own=True, source_program_code=code) for c in program.courses
    ]
    # 手順1: 教養教育科目。`not_available_to_programs` に当該課程を含む科目は取り込まない
    courses += [
        _as_merged(c, own=True, source_program_code=LIBERAL_ARTS_PROGRAM_CODE)
        for c in liberal.courses
        if code not in (c.not_available_to_programs or [])
    ]
    # 手順2: 他課程の専攻科目を専門関連科目として導出する。
    # 自課程が開講している科目は専門関連科目の定義(§4.4.1)から外れるため導出しない。
    # 他課程どうしで同名のものは属性が食い違い得るが、単位数を決め打ちする根拠が
    # ないため全レコードを保持し、`source_program_code` で区別する
    own_titles = {c.title for c in program.courses}
    for other in others:
        other_code = other.program.code
        if other_code == code:
            continue
        courses += [
            _as_merged(c, own=False, source_program_code=other_code,
                       category=RELATED_CATEGORY)
            for c in other.courses
            if c.title not in own_titles
        ]

    merged = MergedCurriculum(
        program=program.program,
        admission_year=program.admission_year,
        curriculum_version=program.curriculum_version,
        graduation=program.graduation,
        registration_limits=program.registration_limits,
        grade_up_requirements=program.grade_up_requirements,
        tracks=program.tracks,
        requirement_slots=slots,
        credit_caps=credit_caps,
        prerequisites=prerequisites,
        courses=courses,
    )
    # 先修要件の科目名は、当該課程に取り込まなかった教養教育科目(履修不可の科目)も
    # 指し得る。転記ミスの検出が目的なので、同じ年度のファイルに在る全科目名と照らす
    known_titles = [
        c.title for c in [*program.courses, *liberal.courses, *(c for o in others for c in o.courses)]
    ]
    _validate(merged, known_titles)
    return merged


# --- マージ後の整合性検査(§4.4.3) ---


def _validate(merged: MergedCurriculum, known_titles: Sequence[str]) -> None:
    """マージ後にしか成立しない5件を検査する。違反は `CurriculumMergeError`。"""
    where = f"{merged.program.code}({merged.program.name}) / {merged.admission_year}年度入学"
    try:
        _check_slot_keys_unique(merged)
        _check_slot_credits_total(merged)
        _check_overflow_to(merged)
        _check_own_course_titles_unique(merged)
        _check_prerequisite_titles(merged, known_titles)
    except CurriculumMergeError as exc:
        raise CurriculumMergeError(f"{where}: {exc}") from exc


def _duplicates(values: list[str]) -> list[str]:
    seen: set[str] = set()
    duplicated: set[str] = set()
    for value in values:
        if value in seen:
            duplicated.add(value)
        seen.add(value)
    return sorted(duplicated)


def _check_slot_keys_unique(merged: MergedCurriculum) -> None:
    duplicated = _duplicates([s.key for s in merged.requirement_slots])
    if duplicated:
        raise CurriculumMergeError(
            f"requirement_slots[].key が重複しています: {', '.join(duplicated)}"
        )


def _check_slot_credits_total(merged: MergedCurriculum) -> None:
    total = sum(s.credits for s in merged.requirement_slots)
    expected = merged.graduation.total_credits
    if total != expected:
        raise CurriculumMergeError(
            f"requirement_slots[].credits の合計が graduation.total_credits と "
            f"一致しません: 合計 {total} / total_credits {expected}"
        )


def _check_overflow_to(merged: MergedCurriculum) -> None:
    """`overflow_to` の参照先が存在し、循環しないこと。

    カスケードは教養 / 専門応用 / 学部フリーの3系統に分かれるため、
    起点ごとに終端まで辿って再訪を検出する。
    """
    slots = merged.slots_by_key
    for slot in merged.requirement_slots:
        visited = [slot.key]
        current = slot.overflow_to
        while current is not None:
            if current not in slots:
                raise CurriculumMergeError(
                    f"overflow_to の参照先が requirement_slots に存在しません: "
                    f"{visited[-1]} -> {current}"
                )
            if current in visited:
                raise CurriculumMergeError(
                    f"overflow_to が循環しています: {' -> '.join([*visited, current])}"
                )
            visited.append(current)
            current = slots[current].overflow_to


def _check_own_course_titles_unique(merged: MergedCurriculum) -> None:
    """設置科目の科目名に重複がないこと。導出した専門関連科目は対象外(§4.4.3)。"""
    duplicated = _duplicates([c.title for c in merged.own_courses])
    if duplicated:
        raise CurriculumMergeError(
            f"設置科目の courses[].title が重複しています: {', '.join(duplicated)}"
        )


def _check_prerequisite_titles(merged: MergedCurriculum, known_titles: Sequence[str]) -> None:
    """先修要件に書いた科目名が、同じ年度の履修要項の科目一覧に存在すること(§4.4.3)。

    判定は科目名で修得科目と突き合わせるため、表記の違う科目名は黙って「未修得」と
    判定されてしまう。転記ミスをロード時に止める。表記の揺れ(全角・半角、空白)は
    判定と同じ規則(`normalize_title()`)で吸収する。
    """
    titles = {normalize_title(t) for t in known_titles}
    missing = sorted(
        {
            f"{p.title} → {title}"
            for p in merged.prerequisites
            for title in p.referenced_titles()
            if normalize_title(title) not in titles
        }
    )
    if missing:
        raise CurriculumMergeError(
            f"prerequisites の科目名が courses[].title に存在しません: {', '.join(missing)}"
        )
