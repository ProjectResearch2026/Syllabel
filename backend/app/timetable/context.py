"""1人の学生について、時間割の組み立てと検索に要る材料を揃える(§7.2)。

材料は次のとおりで、いずれも **backend が計算する**(モデルに推測させない)。

1. `resolve_curriculum()` — (課程コード, 入学年度)でマージ済みの履修要項を引く(§4.4.3)
2. 要件充足判定(§4.4.5)を **HTTP を経由せず直接呼び**、要件枠ごとの不足単位を得る
3. `select_candidates()` — 履修可能な候補の科目を絞る(随意を除く・配当年次・未修得)
4. 開講年度ぶんの開講クラスと対象課程(`get_catalog()`)から、その学生が**履修登録
   できる**クラスで、**対象学期に登録する**クラスだけを候補に結び付ける
5. 先修条件を満たさない科目を外す
6. 対象学期に登録できる単位(CAP − すでに CAP に数えた単位。4年次の年間の上限では、
   同じ年度の前期に登録した単位も引く)
"""

import math
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field

from app.curricula.loader import LoadedCurriculum, get_curricula
from app.curricula.merge import MergedCourse, MergedCurriculum
from app.curricula.requirements import RequirementsResult, _course_index, judge, normalize_title
from app.schemas.proposal import CourseSlot, ProposedCourse, TargetTerm
from app.schemas.student import Course as StudentCourse
from app.schemas.student import StudentProfile
from app.timetable.candidates import (
    Candidate,
    PrerequisiteResult,
    attach_offerings,
    check_prerequisites,
    retake_titles,
    select_candidates,
    student_type,
    taken_titles,
)
from app.timetable.errors import ContextError, CurriculumNotFound
from app.timetable.offerings import (
    DAYS,
    Catalog,
    Eligibility,
    OfferedClass,
    get_catalog,
    registration_half,
)


def resolve_curriculum(program_code: str, admission_year: int) -> LoadedCurriculum:
    """(課程コード, 入学年度)でマージ済みの履修要項を引く。

    Raises:
        CurriculumNotFound: 当該の組み合わせがロードされていない場合。
    """
    loaded = get_curricula().get((program_code, admission_year))
    if loaded is None:
        raise CurriculumNotFound(
            f"履修要項がありません: 課程コード {program_code} / {admission_year}年度入学"
        )
    return loaded


@dataclass(frozen=True)
class RegistrationCap:
    """セメスターの履修登録単位数の上限(CAP)。`per_year` は年間の上限(4年次)か。"""

    credits: int
    per_year: bool = False


def registration_cap(curriculum: MergedCurriculum, semester: int) -> RegistrationCap | None:
    """セメスターの履修登録単位数の上限(CAP)。§5.1.2 `registration_limits`。

    学期ごとの上限(`max_credits_per_semester`)を持つ枠はその値、年間の上限
    (`max_credits_per_year`。7・8セメスター)しか持たない枠は年間の値を返す。年間の
    上限は2学期の合計なので、後期の残りは前期に登録した単位を引いて求める
    (`registered_credits_in()`)。該当する枠が無ければ None。
    """
    caps = [
        RegistrationCap(limit.max_credits_per_semester, per_year=False)
        if limit.max_credits_per_semester is not None
        else RegistrationCap(limit.max_credits_per_year, per_year=True)
        for limit in curriculum.registration_limits.by_semester
        if semester in limit.semesters
        and (limit.max_credits_per_semester or limit.max_credits_per_year) is not None
    ]
    return max(caps, key=lambda c: c.credits) if caps else None


def _counts_toward_cap(index: dict[str, MergedCourse], course: StudentCourse) -> bool:
    """CAP に数える科目か。随意科目とサマーセッション科目は数えない(§5.1.2 の注記)。"""
    if course.term == "サ集":
        return False
    found = index.get(normalize_title(course.title))
    return found is None or found.type != "随意"


def registered_credits_in(
    completed: Sequence[StudentCourse],
    target: TargetTerm,
    *,
    per_year: bool = False,
    curriculum: MergedCurriculum | None = None,
) -> int:
    """CAP からすでに差し引く単位(§5.2.1)。

    - 対象学期に登録済み(`registered`)の科目
    - **年間の上限(`per_year`)で後期を組むときは、同じ年度の前期に登録した科目。**
      成績の付いた科目(合格・不合格・履修辞退)も、登録した時点で上限に数えている
    - 通年の科目は、履修要項の注記どおり前期と後期に半分ずつ数える(年間の上限では全部)

    `curriculum` を与えると、上限に数えない科目(随意・サマーセッション)を除く。
    """
    index = _course_index(curriculum) if curriculum is not None else None
    total = 0.0
    for c in completed:
        if c.year != target.year:
            continue
        if index is not None and not _counts_toward_cap(index, c):
            continue
        half = registration_half(c.term)
        whole_year = c.term == "通年"
        if per_year and target.term == "後期" and half == "前期":
            total += c.credits
        elif c.status == "registered" and (half == target.term or whole_year):
            total += c.credits / 2 if whole_year and not per_year else c.credits
    return math.ceil(total)


@dataclass(frozen=True)
class CreditBudget:
    """対象学期に登録できる単位。`cap` から `registered` を引いたものが `remaining`。

    `per_year` は `cap` が年間の上限(4年次)であることを表し、そのとき `registered` は
    同じ年度の前期に登録した単位を含む。
    """

    cap: int
    registered: int
    per_year: bool = False

    @property
    def remaining(self) -> int:
        return max(0, self.cap - self.registered)


def proposed_course(
    course: MergedCourse, offered: OfferedClass, *, reason: str = ""
) -> ProposedCourse:
    """候補の1クラスを時間割の1科目にする。値はすべて履修要項と開講情報から採る。"""
    day = offered.day_of_week if offered.day_of_week in DAYS else None
    return ProposedCourse(
        syllabus_code=offered.syllabus_code,
        title=course.title,
        subtitle=offered.subtitle,
        day=day,
        period=offered.period if day else None,
        term=offered.term,
        slots=list(offered.slots),
        credits=course.credits,
        category=student_type(course),
        course_category=course.category,
        subcategory=course.subcategory,
        reason=reason,
    )


@dataclass
class StudentContext:
    """1人の学生・1つの対象学期について、時間割と検索に要る材料。

    `candidates` は対象学期に登録する・履修登録できる・先修条件を満たさないことが
    分かっていないクラスを持つ候補の科目で、クラスの数は絞らない(条件に合うクラスを
    選べるように)。`classes` は候補の全クラスを時間割の1科目の形にしたもので、
    シラバスコードで引く。`requirements` は修得済みの科目だけでの要件の充足状況。
    """

    loaded: LoadedCurriculum
    profile: StudentProfile
    target: TargetTerm
    requirements: RequirementsResult
    candidates: list[Candidate]
    prerequisites: dict[str, PrerequisiteResult]
    budget: CreditBudget | None
    catalog: Catalog
    eligibility: Eligibility
    track: str | None = None
    classes: dict[str, tuple[Candidate, OfferedClass]] = field(default_factory=dict)
    _by_code: dict[str, MergedCourse] | None = field(default=None, repr=False)

    def __post_init__(self) -> None:
        if not self.classes:
            self.classes = {
                offered.syllabus_code: (candidate, offered)
                for candidate in self.candidates
                for offered in candidate.classes
            }

    @property
    def curriculum(self) -> MergedCurriculum:
        return self.loaded.curriculum

    @property
    def completed(self) -> list[StudentCourse]:
        return self.profile.completed_courses

    def taken(self) -> set[str]:
        """修得済み・登録済みの科目名(正規化済み)。"""
        return taken_titles(self.completed)

    def passed(self) -> set[str]:
        """修得済みの科目名(正規化済み)。"""
        return {normalize_title(c.title) for c in self.completed if c.status == "passed"}

    def registered(self) -> set[str]:
        """登録済みで成績が未確定の科目名(正規化済み)。"""
        return {normalize_title(c.title) for c in self.completed if c.status == "registered"}

    def retakes(self) -> set[str]:
        """不合格・履修辞退のまま修得していない科目名(正規化済み)。"""
        return retake_titles(self.completed)

    def course_by_title(self, title: str) -> MergedCourse | None:
        """履修要項の科目を科目名で引く。当該課程の設置科目を優先する。"""
        key = normalize_title(title)
        found: MergedCourse | None = None
        for course in sorted(
            self.curriculum.courses, key=lambda c: (not c.own, c.source_program_code)
        ):
            if normalize_title(course.title) == key:
                found = course
                break
        return found

    def course_of_code(self, code: str) -> MergedCourse | None:
        """シラバスコードから履修要項の科目を引く(候補に無い科目も引く)。

        同じコードを複数の課程の科目が持つ(他課程から導出した専門関連科目)ときは、
        当該課程の設置科目、次いで課程コードの小さい出典を採る。
        """
        if self._by_code is None:
            index: dict[str, MergedCourse] = {}
            for course in sorted(
                self.curriculum.courses, key=lambda c: (not c.own, c.source_program_code)
            ):
                for found in self.loaded.syllabus_codes(course):
                    index.setdefault(found, course)
            self._by_code = index
        return self._by_code.get(code)

    def title_of(self, wanted: str) -> str:
        """シラバスコードか科目名から科目名を引く。引けなければそのまま返す。

        アシスタントは入れたい科目(`include`)をシラバスコードで書くため、学生に見せる
        文言はこれで科目名に直す。
        """
        course = self.course_of_code(wanted) or self.course_by_title(wanted)
        if course is not None:
            return course.title
        offered = self.catalog.classes.get(wanted)
        return offered.course_title if offered is not None else wanted

    def judge_with(self, courses: Iterable[ProposedCourse]) -> RequirementsResult:
        """時間割の科目を修得したとみなした要件の充足状況。"""
        added = [
            StudentCourse(title=c.title, year=9999, term="前期", credits=c.credits, status="passed")
            for c in courses
            if c.credits is not None
        ]
        return judge(self.curriculum, [*self.completed, *added], track=self.track)

    def slot_names(self) -> dict[str, str]:
        """要件枠の key → 公式の名前(§5.1.2)。"""
        return {slot.key: slot.name for slot in self.curriculum.requirement_slots}


async def build_student_context(
    profile: StudentProfile,
    program_code: str,
    admission_year: int,
    target: TargetTerm,
    *,
    track: str | None = None,
    catalog: Catalog | None = None,
) -> StudentContext:
    """1人の学生・1つの対象学期について材料を揃える。

    Args:
        profile: 学生プロファイル(§5.2.1)。`program` は課程名でよい(課程コードで
            置き換える)。
        program_code: 課程コード。履修要項を引くキー(§4.4.2)。
        admission_year: 入学年度。
        target: 提案する学期(§7.2)。候補のクラスをその学期に絞り、配当年次と CAP の
            該当セメスターにその学期の学年を使う。
        catalog: 開講年度ぶんの開講情報。省略時は `get_catalog()`(テスト用の口)。

    Raises:
        CurriculumNotFound: 履修要項が無い。
        ContextError: 学年が無いなど、前提が揃わない。
        httpx.HTTPError: api-clean に届かない。
    """
    loaded = resolve_curriculum(program_code, admission_year)
    profile = profile.model_copy(update={"program": program_code})
    requirements = judge(loaded.curriculum, profile.completed_courses, track=track)
    candidates = select_candidates(loaded, profile, grade=target.grade)
    if catalog is None:
        catalog = await get_catalog(curriculum=loaded.curriculum)
    eligibility = catalog.eligibility(loaded.curriculum)
    attached = attach_offerings(
        candidates, catalog.classes, eligibility=eligibility, term=target.term
    )
    attached, prerequisite_results = check_prerequisites(
        attached, loaded.curriculum, profile.completed_courses, target=target
    )
    cap = registration_cap(loaded.curriculum, target.semester)
    budget = (
        CreditBudget(
            cap=cap.credits,
            registered=registered_credits_in(
                profile.completed_courses,
                target,
                per_year=cap.per_year,
                curriculum=loaded.curriculum,
            ),
            per_year=cap.per_year,
        )
        if cap is not None
        else None
    )
    return StudentContext(
        loaded=loaded,
        profile=profile,
        target=target,
        requirements=requirements,
        candidates=attached,
        prerequisites={normalize_title(r.title): r for r in prerequisite_results},
        budget=budget,
        catalog=catalog,
        eligibility=eligibility,
        track=track,
    )


def slots_label(slots: Sequence[CourseSlot], term: str | None) -> str:
    """開講学期とコマを「後期 金4・金5」の形にする。

    コマごとに学期が違えば「3Q金3・4Q金3」と、どのコマがどの学期かを書く。
    コマが無ければ「後期 曜日時限未定」。
    """
    if not slots:
        return f"{term or '学期未定'} 曜日時限未定"
    terms = list(dict.fromkeys(slot.term for slot in slots))
    if len(terms) == 1:
        periods = "・".join(f"{slot.day}{slot.period}" for slot in slots)
        return f"{terms[0] or term or '学期未定'} {periods}"
    return "・".join(f"{slot.term or ''}{slot.day}{slot.period}" for slot in slots)


__all__ = [
    "ContextError",
    "CreditBudget",
    "CurriculumNotFound",
    "StudentContext",
    "build_student_context",
    "proposed_course",
    "RegistrationCap",
    "registered_credits_in",
    "registration_cap",
    "resolve_curriculum",
    "slots_label",
]
