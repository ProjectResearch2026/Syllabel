"""卒業要件の充足判定。design.md §4.4.5。

マージ済みの履修要項(`merge.py`)と既修得科目リストから、要件枠ごとの修得済み
単位・不足単位を算出する**純関数**。HTTP に依存させない(§4.4.5)。`POST
/api/requirements`(§6.1)からも履修提案(§7.2)からも同じ関数を呼ぶ。

判定に用いる規則は §5.1.5 の次の5つで、いずれも規則レイヤに属しクライアントへは
渡さない(§4.4.3):

- `requirement_slots[].accepts` による科目の割り当て(キーは `category` /
  `subcategory` / `type` の AND、配列は OR、`category: "any"` は予約値)
- `requirement_slots[].overflow_to` のカスケード3系統(教養選択必修→教養選択→
  オールフリー / 専門応用選択必修→専門応用選択→学部フリー / 専門基礎選択・
  専門関連→学部フリー→オールフリー)
- `credit_caps` の算入上限と溢れ先(`overflow_to: null` はどこにも計上しない)
- `graduation.excluded_types`(`随意` は卒業要件単位に算入しない)
- `tracks[].constraints` のコース別下限(`slot` / `track_group` / `min`)

**合格した科目の単位のみ加算する**(要件§4.2)。不合格・履修辞退は単位計算に
含めない。本モジュールは学生データをログに出さない(§4.2.3)。
"""

from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Literal

from pydantic import BaseModel

from app.curricula.merge import MergedCourse, MergedCurriculum
from app.curricula.titles import normalize_title  # noqa: F401 - 従来の import 先を保つ
from app.schemas.curriculum import Accepts, CurriculumCourse, RequirementSlot
from app.schemas.student import Course as StudentCourse


class RequirementsError(ValueError):
    """判定の入力が履修要項と噛み合わない(未知のコース、参照先の無い要件枠)。"""


UncountedReason = Literal[
    # 履修要項の設置科目に無い科目(他学部科目・単位互換科目など)
    "not_in_curriculum",
    # `graduation.excluded_types`(`随意`)
    "excluded_type",
    # 同一科目名の重複。同じ科目の単位は重ねて算入しない
    "duplicate",
    # `credit_caps` の上限超過分で `overflow_to: null` のもの
    "over_credit_cap",
    # `accepts` がどの要件枠にも一致しなかった
    "no_matching_slot",
    # カスケードの終端まで辿っても空き枠が無かった
    "no_slot_capacity",
]


class AssignedCourse(BaseModel):
    """要件枠に計上した科目1件。`credits` はその枠へ計上した分だけを表す。

    カスケードで複数の枠に分かれた科目は、枠ごとに分割された単位数で現れる。
    """

    title: str
    credits: int


class SlotStatus(BaseModel):
    """要件枠1つの充足状況。

    `earned` は当該枠に計上された単位数で、`required` を超えることはない
    (超過分はカスケードで下流の枠へ送る)。`required: 0` の枠
    (`basic.elective` / `related` など)は受け皿を持たず、常に `earned: 0` で
    通過点として働く。
    """

    key: str
    name: str
    required: int
    earned: int
    shortfall: int
    notes: str | None = None
    courses: list[AssignedCourse] = []


class TrackConstraintStatus(BaseModel):
    """コース別下限1件の充足状況(§5.1.5 `tracks[].constraints`)。

    `earned` は「当該要件枠の `accepts` に一致し、かつ `track_groups` に当該科目群を
    含む科目」の修得単位数であり、カスケードでどの枠へ計上されたかは問わない。
    別表が問うのは科目群からの修得単位数であって計上先ではなく、この読みなら
    上流の枠が先に埋まったか否かで結果が変わることもない。
    """

    slot: str
    track_group: str
    pool: int
    required: int
    earned: int
    shortfall: int


class UncountedCourse(BaseModel):
    """卒業要件単位に算入しなかった科目(またはその一部)と、その理由。"""

    title: str
    credits: int
    reason: UncountedReason


class TrackInfo(BaseModel):
    """課程内コース区分の識別情報(§5.1.2)。"""

    key: str
    name: str


class RequirementsResult(BaseModel):
    """要件充足判定の結果(§4.4.5)。

    `earned_credits` は要件枠へ計上できた単位の合計であり、`remaining_credits` は
    `total_credits` との差、すなわち各枠の不足単位の合計に等しい(要件枠の
    `credits` の合計が `total_credits` に一致することはマージ時に検査済み。§4.4.3)。

    `satisfied` は全要件枠の不足が 0 で、かつ選択コースの下限をすべて満たすことを
    表す。コースを選んでいない場合、コース別下限は判定していない
    (`track_constraints` が空になる)。
    """

    program_code: str
    admission_year: int
    total_credits: int
    earned_credits: int
    remaining_credits: int
    satisfied: bool
    slots: list[SlotStatus]
    track: str | None = None
    track_constraints: list[TrackConstraintStatus] = []
    available_tracks: list[TrackInfo] = []
    uncounted: list[UncountedCourse] = []


# --- 科目名の突合(§5.1.5) ---


def accepts_course(accepts: Accepts, course: CurriculumCourse) -> bool:
    """`accepts` が科目を受け入れるか(§5.1.5)。

    キーは `category` / `subcategory` / `type` で**複数キーは AND**、
    値が配列のときはそのいずれかに一致(OR)。`category: "any"` は区分を問わない
    ことを表す予約値であり、`any` という名前の区分は存在しない。
    """
    if accepts.category is not None and accepts.category != "any":
        if course.category not in _as_list(accepts.category):
            return False
    if accepts.subcategory is not None:
        if course.subcategory not in _as_list(accepts.subcategory):
            return False
    if accepts.type is not None:
        if course.type not in _as_list(accepts.type):
            return False
    return True


def _as_list(value: str | list[str]) -> list[str]:
    return value if isinstance(value, list) else [value]


def _specificity(accepts: Accepts) -> int:
    """`accepts` が課している条件の数。`category: "any"` は条件に数えない。

    同じ科目を受け入れる枠が複数あるとき、条件の多い枠から先に埋める
    (`basic.required` は `free.faculty` より具体的、という順序づけ)。
    """
    keys = ("category", "subcategory", "type")
    given = [getattr(accepts, key) for key in keys]
    count = sum(1 for value in given if value is not None)
    return count - 1 if accepts.category == "any" else count


# --- 判定 ---


@dataclass
class _Unit:
    """判定に用いる既修得科目1件。`credits` は `credit_caps` 適用後の算入対象単位。"""

    title: str
    course: MergedCourse
    credits: int
    # `credit_caps` の超過分を `overflow_to` 先へ直接送る指定(枠の `accepts` は見ない)
    forced: list[tuple[str, int]] = field(default_factory=list)


def judge(
    curriculum: MergedCurriculum,
    completed: Sequence[StudentCourse],
    *,
    track: str | None = None,
) -> RequirementsResult:
    """要件枠ごとの修得済み単位・不足単位を算出する(§4.4.5)。

    Args:
        curriculum: マージ済みの履修要項(`merge.merge()` の戻り値)。
        completed: 既修得科目リスト(§5.2.1)。`status` が `passed` のもののみ
            単位計算に用いる(要件§4.2)。不合格・履修辞退は結果に現れない。
        track: 選択したコースの `tracks[].key`。指定するとコース別下限を判定する。
            省略すると履修要項の `default_track`(あれば)で判定する。

    Raises:
        RequirementsError: `track` が当該課程に存在しない場合、または
            `credit_caps[].overflow_to` / `constraints[].slot` の参照先が
            `requirement_slots` に無い場合。

    要件枠ごとの `earned` はカスケードが線形であるため既修得科目の並び順に
    依らない。並び順が影響するのは `slots[].courses` の内訳と、`credit_caps` の
    上限にどの科目が収まるかだけである。
    """
    slots = curriculum.slots_by_key
    _check_references(curriculum, slots)
    if track is None:
        track = curriculum.default_track

    units, uncounted = _collect(curriculum, completed)
    _apply_credit_caps(curriculum, units, uncounted)

    earned, assigned = _assign(curriculum, slots, units, uncounted)
    slot_statuses = [
        SlotStatus(
            key=slot.key,
            name=slot.name,
            required=slot.credits,
            earned=earned[slot.key],
            shortfall=max(0, slot.credits - earned[slot.key]),
            notes=slot.notes,
            courses=assigned[slot.key],
        )
        for slot in curriculum.requirement_slots
    ]

    constraints = _track_constraints(curriculum, slots, units, track)
    total_earned = sum(status.earned for status in slot_statuses)
    satisfied = all(s.shortfall == 0 for s in slot_statuses) and all(
        c.shortfall == 0 for c in constraints
    )

    return RequirementsResult(
        program_code=curriculum.program.code,
        admission_year=curriculum.admission_year,
        total_credits=curriculum.graduation.total_credits,
        earned_credits=total_earned,
        remaining_credits=max(0, curriculum.graduation.total_credits - total_earned),
        satisfied=satisfied,
        slots=slot_statuses,
        track=track,
        track_constraints=constraints,
        available_tracks=[
            TrackInfo(key=t.key, name=t.name) for t in curriculum.tracks or []
        ],
        uncounted=uncounted,
    )


def _check_references(
    curriculum: MergedCurriculum, slots: dict[str, RequirementSlot]
) -> None:
    """判定で辿る参照先が要件枠に存在すること。

    `requirement_slots[].overflow_to` はマージ時に検査済み(§4.4.3)だが、
    `credit_caps[].overflow_to` と `tracks[].constraints[].slot` は
    マージ後のオブジェクトに対する検査を持たないため、ここで確かめる。
    """
    for cap in curriculum.credit_caps:
        if cap.overflow_to is not None and cap.overflow_to not in slots:
            raise RequirementsError(
                f"credit_caps[].overflow_to の参照先が requirement_slots に"
                f"存在しません: {cap.overflow_to}"
            )
    for track in curriculum.tracks or []:
        for constraint in track.constraints:
            if constraint.slot not in slots:
                raise RequirementsError(
                    f"tracks[{track.key}].constraints[].slot の参照先が "
                    f"requirement_slots に存在しません: {constraint.slot}"
                )


def _course_index(curriculum: MergedCurriculum) -> dict[str, MergedCourse]:
    """科目名から設置科目を引く索引。原表記と正規化後の双方を鍵にする。

    当該課程の設置科目(`own`)を優先し、同名の科目が他課程から専門関連科目として
    複数導出されている場合は課程コードの小さい方を採る。マージは同名の導出科目を
    全レコード保持し、どの出典を採るかの判断を判定側へ委ねている(§4.4.3)。
    導出科目の `category` は一律 `専門関連科目` であり、`related` / `free.faculty`
    の判定に必要な属性は出典によらないため、単位数は成績表側の値を用いる。
    """
    index: dict[str, MergedCourse] = {}
    for course in sorted(
        curriculum.courses, key=lambda c: (not c.own, c.source_program_code)
    ):
        index.setdefault(course.title, course)
        index.setdefault(normalize_title(course.title), course)
    return index


def _collect(
    curriculum: MergedCurriculum, completed: Sequence[StudentCourse]
) -> tuple[list[_Unit], list[UncountedCourse]]:
    """既修得科目を設置科目に対応づけ、算入対象と対象外に振り分ける。

    合格(`passed`)以外は単位計算に用いない(要件§4.2)ため、ここで落とす。
    """
    index = _course_index(curriculum)
    excluded_types = set(curriculum.graduation.excluded_types)

    units: list[_Unit] = []
    uncounted: list[UncountedCourse] = []
    seen: set[str] = set()

    for entry in completed:
        if entry.status != "passed":
            continue
        credits = entry.credits
        normalized = normalize_title(entry.title)
        course = index.get(entry.title) or index.get(normalized)
        if course is None:
            uncounted.append(
                UncountedCourse(
                    title=entry.title, credits=credits, reason="not_in_curriculum"
                )
            )
            continue
        if course.type in excluded_types:
            uncounted.append(
                UncountedCourse(
                    title=entry.title, credits=credits, reason="excluded_type"
                )
            )
            continue
        if normalized in seen:
            uncounted.append(
                UncountedCourse(title=entry.title, credits=credits, reason="duplicate")
            )
            continue
        seen.add(normalized)
        units.append(_Unit(title=entry.title, course=course, credits=credits))

    return units, uncounted


def _apply_credit_caps(
    curriculum: MergedCurriculum, units: list[_Unit], uncounted: list[UncountedCourse]
) -> None:
    """`credit_caps` の算入上限を適用する(§5.1.5)。

    `max_credits` を超えた分は `overflow_to` 先へ送り、`overflow_to: null` の
    ときはどこにも計上しない。上限に収まる分は通常どおり `accepts` で割り当てる。
    """
    for cap in curriculum.credit_caps:
        titles = {normalize_title(t) for t in cap.titles}
        allowance = cap.max_credits
        for unit in units:
            if normalize_title(unit.title) not in titles:
                continue
            countable = min(unit.credits, allowance)
            excess = unit.credits - countable
            allowance -= countable
            unit.credits = countable
            if excess <= 0:
                continue
            if cap.overflow_to is None:
                uncounted.append(
                    UncountedCourse(
                        title=unit.title, credits=excess, reason="over_credit_cap"
                    )
                )
            else:
                unit.forced.append((cap.overflow_to, excess))


def _downstream(slots: dict[str, RequirementSlot], key: str) -> set[str]:
    """`overflow_to` を辿って到達できる要件枠(自分自身を含まない)。

    参照解決と循環の不在はマージ時に検査済み(§4.4.3)。
    """
    reached: set[str] = set()
    current = slots[key].overflow_to
    while current is not None and current not in reached:
        reached.add(current)
        current = slots[current].overflow_to
    return reached


def _entry_slot(
    curriculum: MergedCurriculum,
    course: CurriculumCourse,
    order: dict[str, int],
    downstream: dict[str, set[str]],
) -> RequirementSlot | None:
    """科目の単位を最初に計上する要件枠。受け入れる枠が無ければ None。

    受け入れる枠のうち**最も条件の多いもの**とし、同数のときは他の候補を下流に持つ枠
    (カスケードの上流)を先にする(`_assign()` の規則)。
    """
    candidates = [
        slot for slot in curriculum.requirement_slots if accepts_course(slot.accepts, course)
    ]
    if not candidates:
        return None
    keys = {c.key for c in candidates}
    return min(
        candidates,
        key=lambda s: (-_specificity(s.accepts), -len(downstream[s.key] & keys), order[s.key]),
    )


def entry_slot_keys(curriculum: MergedCurriculum) -> "EntrySlots":
    """科目 → 単位を最初に計上する要件枠の key を引く関数と、溢れの段を返す。

    履修提案の組み立て(`app/timetable/builder.py`)が、科目を1つ足したときに単位が
    どの枠に入るかを判定し直さずに見積もるのに使う。起点の決め方は `judge()` と
    同じ関数(`_entry_slot()`)であり、規則を二重に持たない。
    """
    slots = curriculum.slots_by_key
    order = {slot.key: i for i, slot in enumerate(curriculum.requirement_slots)}
    downstream = {
        slot.key: _downstream(slots, slot.key) for slot in curriculum.requirement_slots
    }

    def entry(course: CurriculumCourse) -> str | None:
        slot = _entry_slot(curriculum, course, order, downstream)
        return slot.key if slot is not None else None

    return EntrySlots(entry=entry, levels=_overflow_levels(curriculum))


@dataclass(frozen=True)
class EntrySlots:
    """`entry_slot_keys()` の戻り値。

    `levels` は要件枠の溢れの段で、どこからも溢れを受けない枠が 0、溢れを受ける枠は
    送り元の段の最大 + 1 である(受け皿ほど大きい)。
    """

    entry: Callable[[CurriculumCourse], str | None]
    levels: dict[str, int]


def _overflow_levels(curriculum: MergedCurriculum) -> dict[str, int]:
    """要件枠ごとの溢れの段。循環はマージ時に検査済み(§4.4.3)。"""
    sources: dict[str, list[str]] = {slot.key: [] for slot in curriculum.requirement_slots}
    for slot in curriculum.requirement_slots:
        if slot.overflow_to is not None and slot.overflow_to in sources:
            sources[slot.overflow_to].append(slot.key)
    levels: dict[str, int] = {}

    def level(key: str) -> int:
        if key not in levels:
            levels[key] = 1 + max((level(s) for s in sources[key]), default=-1)
        return levels[key]

    for key in sources:
        level(key)
    return levels


def _assign(
    curriculum: MergedCurriculum,
    slots: dict[str, RequirementSlot],
    units: list[_Unit],
    uncounted: list[UncountedCourse],
) -> tuple[dict[str, int], dict[str, list[AssignedCourse]]]:
    """各科目を要件枠へ割り当て、埋まった分は `overflow_to` 先へ送る。

    割り当ての起点は、その科目を受け入れる枠のうち**最も条件の多いもの**とし、
    同数のときは他の候補を下流に持つ枠(カスケードの上流)を先にする。
    `必修外国語科目` は `liberal.language.required` と `liberal.elective` の
    どちらの `accepts` にも一致するが、注記A の規定は前者を起点として超過分を
    後者へ送ることであり、条件数だけでは前者を選べないためこの順序づけを要する。

    カスケードは `overflow_to` の指す先を辿るだけで、送り先の `accepts` は
    見ない。専門応用選択必修の超過分が `applied.elective`(`accepts` は
    `type: 選択`)へ計上される注記C の規定が、`accepts` では表せないためである。
    """
    order = {slot.key: i for i, slot in enumerate(curriculum.requirement_slots)}
    downstream = {
        slot.key: _downstream(slots, slot.key) for slot in curriculum.requirement_slots
    }
    earned: dict[str, int] = {key: 0 for key in slots}
    assigned: dict[str, list[AssignedCourse]] = {key: [] for key in slots}

    def cascade(start: str, title: str, amount: int) -> int:
        """`start` から下流へ順に計上し、計上しきれなかった単位数を返す。"""
        key: str | None = start
        while amount > 0 and key is not None:
            slot = slots[key]
            take = min(slot.credits - earned[key], amount)
            if take > 0:
                earned[key] += take
                assigned[key].append(AssignedCourse(title=title, credits=take))
                amount -= take
            key = slot.overflow_to
        return amount

    for unit in units:
        for slot_key, amount in unit.forced:
            left = cascade(slot_key, unit.title, amount)
            if left > 0:
                uncounted.append(
                    UncountedCourse(
                        title=unit.title, credits=left, reason="no_slot_capacity"
                    )
                )
        if unit.credits <= 0:
            continue
        entry = _entry_slot(curriculum, unit.course, order, downstream)
        if entry is None:
            uncounted.append(
                UncountedCourse(
                    title=unit.title,
                    credits=unit.credits,
                    reason="no_matching_slot",
                )
            )
            continue
        left = cascade(entry.key, unit.title, unit.credits)
        if left > 0:
            uncounted.append(
                UncountedCourse(
                    title=unit.title, credits=left, reason="no_slot_capacity"
                )
            )

    return earned, assigned


def _track_constraints(
    curriculum: MergedCurriculum,
    slots: dict[str, RequirementSlot],
    units: list[_Unit],
    track: str | None,
) -> list[TrackConstraintStatus]:
    """選択コースの下限を判定する(§5.1.5 `tracks[].constraints`)。

    コース未選択のときは空リストを返す(判定していないことを表す)。
    """
    if track is None:
        return []
    selected = next((t for t in curriculum.tracks or [] if t.key == track), None)
    if selected is None:
        available = ", ".join(t.key for t in curriculum.tracks or []) or "(なし)"
        raise RequirementsError(
            f"コースが存在しません: {track}(選択できるコース: {available})"
        )

    statuses: list[TrackConstraintStatus] = []
    for constraint in selected.constraints:
        accepts = slots[constraint.slot].accepts
        earned = sum(
            unit.credits
            for unit in units
            if unit.credits > 0
            and accepts_course(accepts, unit.course)
            and constraint.track_group in (unit.course.track_groups or [])
        )
        statuses.append(
            TrackConstraintStatus(
                slot=constraint.slot,
                track_group=constraint.track_group,
                pool=constraint.pool,
                required=constraint.min,
                earned=earned,
                shortfall=max(0, constraint.min - earned),
            )
        )
    return statuses
