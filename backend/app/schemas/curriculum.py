"""履修要項 YAML(`curricula/`)の型定義。design.md §5.1.2 / §5.1.3 / §5.1.5。

課程ファイル(`Curriculum`)と教養教育科目ファイル(`LiberalArtsCurriculum`)の
**1ファイル単体**を型付けする。ファイル探索・ロードは `app/curricula/loader.py`、
教養教育科目ファイル・他課程ファイルとのマージは `app/curricula/merge.py` の責務であり、
マージ後にしか成立しない次の検査はここでは行わない(§4.4.3):

- `requirement_slots[].credits` の合計が `graduation.total_credits` に一致すること
- `overflow_to` の参照解決と循環検査(`liberal.elective → free.all` はファイルをまたぐ)
- マージ後の `requirement_slots[].key` / `courses[].title` の一意性
- `prerequisites[].title` / `all_of` / `any_of` / `credit_caps[].titles` /
  `tracks[].constraints[].slot` / `track_group` の参照解決
- `admission_year` とディレクトリ名の一致

YAML は snake_case のまま扱う(alias は付けない)。camelCase への変換は
API のレスポンスモデル側の責務である(§6.1)。全モデルで `extra="forbid"` とし、
転記時の typo キーを黙って捨てずに検出する。
"""

from collections import Counter
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

# --- 列挙値(§5.1.5) ---

CourseType = Literal["必修", "選択必修", "選択", "随意"]
Term = Literal["前期", "後期", "通年", "サ集"]
Quarter = Literal["1Q", "2Q", "3Q", "4Q"]
Category = Literal["教養教育科目", "専門基礎科目", "専門応用科目", "専門関連科目"]
Subcategory = Literal[
    "「仏教の思想」科目",
    "必修外国語科目",
    "選択外国語科目",
    "人文科学系科目",
    "社会科学系科目",
    "自然科学系科目",
    "スポーツ科学系科目",
    "教養特別講義科目",
    "学部・センター等提供科目",
]
# 2026年度入学の教養教育科目ファイルでのみ用いる軸(§5.1.3)。subcategory と直交する
CourseGroup = Literal["基礎教養", "発展教養"]
Subgroup = Literal[
    "スタートアップ科目群",
    "ベーシック教養科目群",
    "全学共通教育科目群",
    "アドバンスト教養科目群",
    "教養教育ゼミナール科目群",
    "アクティブ・ラーニング科目群",
    "融合型科目群",
    "学部等提供科目群",
]
LiberalArtsVersion = Literal["until-2025", "2026"]

# 課程コード2桁(§4.4.2)。教養教育科目ファイル対応版の "00" を含む
ProgramCode = Annotated[str, StringConstraints(pattern=r"^\d{2}$")]
# `curricula/` を起点とした複製元のパス(§5.1.5)
DuplicateOfPath = Annotated[
    str, StringConstraints(pattern=r"^admission-\d{4}/[^/]+\.yaml$")
]

# `前期` / `後期` に許されるクォーター(§5.1.5)
_TERM_QUARTERS: dict[str, frozenset[str]] = {
    "前期": frozenset({"1Q", "2Q"}),
    "後期": frozenset({"3Q", "4Q"}),
}
# 教養教育科目ファイルが定義するスロットの key の接頭辞(§5.1.2 / §5.1.3)
_LIBERAL_SLOT_PREFIX = "liberal."


class _YamlModel(BaseModel):
    """`curricula/` の YAML に対応するモデルの基底。

    未知のキーを拒否して転記ミスを検出する。alias は付けず snake_case のまま扱う。
    """

    model_config = ConfigDict(extra="forbid")


def _require_unique(values: list[str], label: str) -> None:
    """ファイル内で一意であるべき値の重複を検出する。"""
    counts = Counter(values)
    duplicated = sorted(v for v, n in counts.items() if n > 1)
    if duplicated:
        raise ValueError(f"{label} が重複しています: {', '.join(duplicated)}")


# --- 要件枠(§5.1.2 / §5.1.3) ---


class Accepts(_YamlModel):
    """要件枠・単位数閾値が受け入れる科目の条件(§5.1.5)。

    キーは `category` / `subcategory` / `type` / `kikan` の4つで、**複数キーは AND**。
    値が配列のときはそのいずれかに一致(OR)を表す。`category: "any"` は
    区分を問わないことを表す予約値であり、`any` という名前の区分は存在しない。
    """

    category: Category | Literal["any"] | list[Category] | None = None
    subcategory: Subcategory | list[Subcategory] | None = None
    type: CourseType | list[CourseType] | None = None
    kikan: bool | None = None

    @model_validator(mode="after")
    def check_not_empty(self) -> "Accepts":
        """条件を1つも持たない `accepts` は受け入れる科目が定まらない(§5.1.5)。"""
        if all(getattr(self, name) is None for name in type(self).model_fields):
            raise ValueError(
                "accepts が空です: category / subcategory / type / kikan の"
                "いずれかを指定してください(区分を問わない場合は category: any)"
            )
        return self


class RequirementSlot(_YamlModel):
    """卒業要件の枠1つ(§5.1.2 / §5.1.3)。

    `credits: 0` は「卒業要件としての枠を持たず、修得単位は `overflow_to` 先に
    計上される」ことを表す。`overflow_to` の参照解決と循環検査、および
    `credits` の合計の検算はマージ後に行う(§4.4.3)。
    """

    key: str = Field(min_length=1)
    credits: int = Field(ge=0)
    accepts: Accepts
    overflow_to: str | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def check_no_self_overflow(self) -> "RequirementSlot":
        if self.overflow_to == self.key:
            raise ValueError(f"overflow_to が自分自身を指しています: {self.key}")
        return self


class CreditCap(_YamlModel):
    """特定科目群の卒業要件算入上限(§5.1.5)。

    `max_credits` を超えた分は `overflow_to` 先に計上し、`overflow_to: null` の
    ときはどこにも計上しない。`requirement_slots[].overflow_to` の省略
    (＝上位スロットへ流れない)とは意味が異なる。
    """

    titles: list[str] = Field(min_length=1)
    max_credits: int = Field(ge=0)
    overflow_to: str | None = None
    notes: str | None = None


# --- コース区分(§5.1.2) ---


class TrackConstraint(_YamlModel):
    """「コース毎の履修要件」別表の1セル(§5.1.5)。

    `slot` はどの要件枠の中での話かを、`track_group` はどの科目群かを指し、
    `pool` はその科目群に設置されている単位数(別表の母数)、`min` はコース
    選択者が最低限修得すべき単位数を表す。`pool` は原理的には `courses` から
    算出できるが、別表と設置科目一覧の齟齬を検出するため別表の値を転記する。
    """

    slot: str = Field(min_length=1)
    track_group: str = Field(min_length=1)
    pool: int = Field(ge=0)
    min: int = Field(ge=0)


class Track(_YamlModel):
    """課程内コース区分(§5.1.2)。下限を持たないコースの `constraints` は空リスト。"""

    key: str = Field(min_length=1)
    name: str = Field(min_length=1)
    constraints: list[TrackConstraint] = []


# --- 科目(§5.1.2 / §5.1.3 / §5.1.5) ---


class CurriculumCourse(_YamlModel):
    """設置科目1件。課程ファイルの専攻科目と教養教育科目ファイルの教養教育科目に共通。

    `category` / `type` / `track_groups` は直交する3軸として扱う(§5.1.2)。
    `subcategory` は教養教育科目のみが持ち、`course_group` / `subgroup` は
    2026年度入学の教養教育科目ファイルでのみ用いる(§5.1.3 / §5.1.5)。
    """

    title: str = Field(min_length=1)
    category: Category
    subcategory: Subcategory | None = None
    type: CourseType
    course_group: CourseGroup | None = None
    subgroup: Subgroup | None = None
    track_groups: list[str] | None = None
    kikan: bool = False
    credits: int = Field(ge=1)
    grade: int = Field(ge=1, le=4)
    term: Term
    quarters: list[Quarter] | None = None
    not_available_to_programs: list[ProgramCode] | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def check_subcategory(self) -> "CurriculumCourse":
        """`subcategory` は教養教育科目のみが持つ(§5.1.5)。"""
        if self.category == "教養教育科目":
            if self.subcategory is None:
                raise ValueError(f"教養教育科目には subcategory が必要です: {self.title}")
        elif self.subcategory is not None:
            raise ValueError(f"専攻科目は subcategory を持ちません: {self.title}")
        return self

    @model_validator(mode="after")
    def check_kikan_is_required_elective(self) -> "CurriculumCourse":
        """`kikan: true` の科目は `type: "選択必修"` であること(§5.1.5 / §4.4.3)。"""
        if self.kikan and self.type != "選択必修":
            raise ValueError(
                f"基幹科目は type: 選択必修 であること: {self.title}(type: {self.type})"
            )
        return self

    @model_validator(mode="after")
    def check_term_quarters(self) -> "CurriculumCourse":
        """`term` と `quarters` の整合(§5.1.5 / §4.4.3)。

        `quarters` は任意フィールドであり、クォーター制が適用される科目にのみ置く。
        持つ場合は `前期` ⇔ `quarters ⊆ {1Q, 2Q}`、`後期` ⇔ `quarters ⊆ {3Q, 4Q}`。
        `通年` / `サ集` は持たない。

        `前期` / `後期` でも `quarters` を持たないことがあり、これは「不明」ではなく
        「クォーターに分割されない開講形態である」ことを表す。教養教育科目は
        クォーター制の対象外であり、版を問わず `quarters` を持たない(§5.1.3)。
        """
        allowed = _TERM_QUARTERS.get(self.term)
        if allowed is None:
            if self.quarters:
                raise ValueError(
                    f"term: {self.term} の科目は quarters を持ちません: {self.title}"
                )
            return self
        if not self.quarters:
            return self
        outside = [q for q in self.quarters if q not in allowed]
        if outside:
            raise ValueError(
                f"term: {self.term} と quarters が矛盾しています: "
                f"{self.title}({', '.join(outside)})"
            )
        _require_unique(list(self.quarters), f"{self.title} の quarters")
        return self


# --- 先修要件(§5.1.2 / §5.1.5) ---


class PrerequisiteAsOf(_YamlModel):
    """先修要件の判定時点。その学期末までに修得した単位で判定する(§5.1.5)。"""

    grade: int = Field(ge=1, le=4)
    term: Literal["前期", "後期"]


class MinCredits(_YamlModel):
    """先修要件の単位数閾値(§5.1.5)。

    `accepts` を省略した要素は**卒業要件総修得単位数**を指す。
    """

    credits: int = Field(ge=1)
    accepts: Accepts | None = None


class Prerequisite(_YamlModel):
    """先修制の表の1行(§5.1.5)。

    `title` は**要件が課される側の科目**。`min_credits` / `all_of` / `any_of` /
    `as_of` は任意で、複数あれば AND で結合する。`notes` は履修要項の
    「履修の要件」欄の原文であり必ず書く。構造化できない条件は `notes` のみで表す。
    参照(`title` / `all_of` / `any_of` が同一ファイルの `courses[].title` に
    存在すること)の解決はローダの責務(§4.4.3)。
    """

    title: str = Field(min_length=1)
    as_of: PrerequisiteAsOf | None = None
    min_credits: list[MinCredits] | None = Field(default=None, min_length=1)
    all_of: list[str] | None = Field(default=None, min_length=1)
    any_of: list[str] | None = Field(default=None, min_length=1)
    notes: str = Field(min_length=1)


# --- 課程固有の規定(§5.1.2) ---


class Graduation(_YamlModel):
    """卒業要件(§5.1.2)。`total_credits` との検算はマージ後に行う(§4.4.3)。"""

    total_credits: int = Field(ge=1)
    excluded_types: list[CourseType] = []
    notes: str | None = None


class GradeUpRequirement(_YamlModel):
    """進級要件(§5.1.2)。条件なしは `conditions: null`。"""

    to_grade: int = Field(ge=2, le=4)
    conditions: str | None = None
    notes: str | None = None


class SemesterLimit(_YamlModel):
    """履修登録制限単位数の1レンジ(§5.1.2)。

    `max_credits_per_semester` と `max_credits_per_year` は
    **どちらか一方のみ**を持つ(§4.4.3)。
    """

    semesters: list[int] = Field(min_length=1)
    max_credits_per_semester: int | None = Field(default=None, ge=1)
    max_credits_per_year: int | None = Field(default=None, ge=1)
    notes: str | None = None

    @model_validator(mode="after")
    def check_exactly_one_limit(self) -> "SemesterLimit":
        given = [
            self.max_credits_per_semester is not None,
            self.max_credits_per_year is not None,
        ]
        if sum(given) != 1:
            raise ValueError(
                "max_credits_per_semester と max_credits_per_year は"
                f"どちらか一方のみを持ちます: semesters={self.semesters}"
            )
        return self


class RegistrationLimits(_YamlModel):
    """履修登録制限単位数(CAP制)(§5.1.2)。"""

    by_semester: list[SemesterLimit] = []
    notes: str | None = None
    gpa_exception: str | None = None


class Program(_YamlModel):
    """課程の識別情報(§5.1.2)。`code` が一次識別子(§4.4.2)。"""

    code: ProgramCode
    name: str = Field(min_length=1)
    name_aliases: list[str] = []


# --- ファイル(§5.1.2 / §5.1.3) ---


class Curriculum(_YamlModel):
    """課程ファイル `curricula/admission-<年度>/<課程コード>-<課程名>.yaml`(§5.1.2)。

    `courses` は専攻科目のみを持つ。教養教育科目は同一ディレクトリの
    `00-liberal-arts.yaml` が、専門関連科目は他課程ファイルが定義元であり、
    どちらもロード時にマージで取り込む(§4.4.1 / §4.4.3)。
    同様に `liberal.*` の要件枠もこのファイルには現れない(§5.1.2)。
    """

    program: Program
    admission_year: int = Field(ge=2000)
    curriculum_version: str | None = None
    duplicate_of: DuplicateOfPath | None = None
    graduation: Graduation
    requirement_slots: list[RequirementSlot] = Field(min_length=1)
    prerequisites: list[Prerequisite] = []
    grade_up_requirements: list[GradeUpRequirement] = []
    registration_limits: RegistrationLimits
    credit_caps: list[CreditCap] = []
    courses: list[CurriculumCourse] = Field(min_length=1)
    tracks: list[Track] | None = None

    @model_validator(mode="after")
    def check_slots(self) -> "Curriculum":
        """`liberal.*` を持たないこと、ファイル内で `key` が一意であること(§5.1.2)。"""
        liberal = [s.key for s in self.requirement_slots if s.key.startswith(_LIBERAL_SLOT_PREFIX)]
        if liberal:
            raise ValueError(
                "課程ファイルは liberal.* の要件枠を持ちません"
                f"(00-liberal-arts.yaml が唯一の定義元): {', '.join(liberal)}"
            )
        _require_unique([s.key for s in self.requirement_slots], "requirement_slots[].key")
        return self

    @model_validator(mode="after")
    def check_courses(self) -> "Curriculum":
        """専攻科目のみを持つこと(§5.1.2 / §5.1.5)。"""
        for course in self.courses:
            if course.category not in ("専門基礎科目", "専門応用科目"):
                raise ValueError(
                    "課程ファイルの courses は専攻科目(専門基礎科目 / 専門応用科目)のみです"
                    f": {course.title}(category: {course.category})"
                )
            if course.course_group is not None or course.subgroup is not None:
                raise ValueError(
                    "course_group / subgroup は教養教育科目ファイル専用です: "
                    f"{course.title}"
                )
            if course.not_available_to_programs is not None:
                raise ValueError(
                    "not_available_to_programs は教養教育科目ファイル専用です: "
                    f"{course.title}"
                )
        _require_unique([c.title for c in self.courses], "courses[].title")
        return self

    @model_validator(mode="after")
    def check_tracks(self) -> "Curriculum":
        _require_unique([t.key for t in self.tracks or []], "tracks[].key")
        return self


class LiberalArtsCurriculum(_YamlModel):
    """教養教育科目ファイル `curricula/admission-<年度>/00-liberal-arts.yaml`(§5.1.3)。

    `liberal.*` の要件枠とその入学年度の全課程共通の設置科目一覧の唯一の定義元。
    課程ファイルと違い `graduation` / `registration_limits` / `tracks` は持たない。
    """

    admission_year: int = Field(ge=2000)
    liberal_arts_version: LiberalArtsVersion
    applies_to: list[str] = []
    duplicate_of: DuplicateOfPath | None = None
    requirement_slots: list[RequirementSlot] = Field(min_length=1)
    prerequisites: list[Prerequisite] = []
    credit_caps: list[CreditCap] = []
    courses: list[CurriculumCourse] = Field(min_length=1)

    @model_validator(mode="after")
    def check_slots(self) -> "LiberalArtsCurriculum":
        """`liberal.*` のみを持つこと、ファイル内で `key` が一意であること(§5.1.3)。"""
        others = [
            s.key for s in self.requirement_slots if not s.key.startswith(_LIBERAL_SLOT_PREFIX)
        ]
        if others:
            raise ValueError(
                "教養教育科目ファイルは liberal.* の要件枠のみを持ちます: "
                f"{', '.join(others)}"
            )
        _require_unique([s.key for s in self.requirement_slots], "requirement_slots[].key")
        return self

    @model_validator(mode="after")
    def check_courses(self) -> "LiberalArtsCurriculum":
        """教養教育科目のみを持つこと。`course_group` / `subgroup` は2026年度入学版のみ(§5.1.3)。"""
        for course in self.courses:
            if course.category != "教養教育科目":
                raise ValueError(
                    "教養教育科目ファイルの courses は教養教育科目のみです: "
                    f"{course.title}(category: {course.category})"
                )
            if course.track_groups is not None:
                raise ValueError(f"track_groups は課程ファイル専用です: {course.title}")
            if self.liberal_arts_version != "2026" and (
                course.course_group is not None or course.subgroup is not None
            ):
                raise ValueError(
                    "course_group / subgroup は liberal_arts_version: 2026 でのみ"
                    f"用います: {course.title}"
                )
        _require_unique([c.title for c in self.courses], "courses[].title")
        return self
