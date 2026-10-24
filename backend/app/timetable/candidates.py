"""候補の科目と、その開講クラス・先修条件(§5.1.5・§7.2)。"""

import logging
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

from app.curricula.loader import LoadedCurriculum
from app.curricula.merge import MergedCourse, MergedCurriculum
from app.curricula.requirements import _course_index, accepts_course, judge, normalize_title
from app.schemas.curriculum import Prerequisite, PrerequisiteAsOf, PrerequisiteConditions
from app.schemas.proposal import HalfTerm, ProposedCourse, TargetTerm
from app.schemas.student import Course as StudentCourse
from app.schemas.student import StudentProfile
from app.timetable.errors import ContextError
from app.timetable.offerings import Eligibility, OfferedClass, class_order, registration_half

logger = logging.getLogger(__name__)


# 同じ科目名の下に、サブタイトルの違う別の講義が開かれる科目。履修要項は1科目として
# 持ち(卒業要件に入るのは1科目2単位まで。`credit_caps`)、成績表にもサブタイトルは
# 載らない。科目名だけで見分けると、1つ修得しただけでほかの講義もすべて修得済みになり、
# 「AI基礎を取りたい」に「修得済み」と答えてしまう。科目名とサブタイトルで見分ける。
# frontend の `lib/courseTitle.ts` の `BY_SUBTITLE` と同じものを並べる
_BY_SUBTITLE = frozenset({normalize_title("教養教育科目特別講義")})


def by_subtitle(title: str) -> bool:
    """サブタイトルで別の講義を見分ける科目か。"""
    return normalize_title(title) in _BY_SUBTITLE


def course_key(title: str, subtitle: str | None = None) -> str:
    """科目の同一性。ふつうは正規化した科目名、`by_subtitle()` の科目はサブタイトルも含める。"""
    key = normalize_title(title)
    if key in _BY_SUBTITLE:
        return f"{key}／{normalize_title(subtitle or '')}"
    return key


def key_of(course: "ProposedCourse") -> str:
    """時間割の科目の同一性(`course_key()`)。"""
    return course_key(course.title, course.subtitle)


def display_title(course: "ProposedCourse") -> str:
    """学生・モデルに見せる科目名。`by_subtitle()` の科目はサブタイトルを添える。"""
    if by_subtitle(course.title) and course.subtitle:
        return f"{course.title}({course.subtitle})"
    return course.title


@dataclass(frozen=True)
class Candidate:
    """時間割に入れられる科目1件と、その開講クラス。

    `codes` は開講年度ファイルの `resolved` が持つシラバスコード(§4.4.2)、
    `classes` は api-clean から引いた開講情報で、`attach_offerings()` が埋める。
    `by_subtitle()` の科目はサブタイトルごとに別の候補にし、`subtitle` にそれを持つ。
    """

    course: MergedCourse
    codes: tuple[str, ...]
    classes: tuple[OfferedClass, ...] = ()
    subtitle: str | None = None

    @property
    def key(self) -> str:
        """科目の同一性(`course_key()`)。"""
        return course_key(self.course.title, self.subtitle)


def student_type(course: MergedCourse) -> str:
    """その学生にとっての履修区分。

    他課程から導出した専門関連科目(`own=False`)の `type` は**開講元の課程にとっての**
    区分であり(地球環境概論A は環境の課程で必修)、閲覧している学生にとっては
    「専門関連科目 選択」である(履修要項の卒業要件単位数表。frontend のタグ表示と
    同じ扱い)。開講元の区分のまま扱うと、他課程の必修が自課程の選択より重く見える。
    """
    return course.type if course.own else "選択"


def taken_titles(completed: Sequence[StudentCourse]) -> set[str]:
    """時間割に入れない科目名を正規化して集める。修得済み(合格)と登録済みである。

    不合格・履修辞退は**修得していない**ため除く。再履修は時間割の対象になる
    (要件§4.2 の単位計算と同じく `passed` だけを修得とみなす)。登録済み
    (`registered`。成績未確定)は修得ではないが、すでに登録しているので入れない。
    """
    return {
        normalize_title(c.title)
        for c in completed
        if c.status in ("passed", "registered")
    }


def retake_titles(completed: Sequence[StudentCourse]) -> set[str]:
    """不合格・履修辞退のまま修得していない科目名(正規化済み)。再履修の対象である。"""
    taken = taken_titles(completed)
    return {
        normalize_title(c.title)
        for c in completed
        if c.status in ("failed", "withdrawn") and normalize_title(c.title) not in taken
    }


def select_candidates(
    loaded: LoadedCurriculum, profile: StudentProfile, *, grade: int | None = None
) -> list[Candidate]:
    """履修可能な候補の科目を絞る(§7.2)。

    次のすべてを満たす科目を候補とする:

    - `type != "随意"` — 随意科目は卒業要件単位に算入しない(§5.1.5 `excluded_types`)
    - `course.grade <= 学生の学年` — 配当年次は「この年次**から**履修可能」(§5.1.5)
    - 未修得かつ未登録 — 既修得・登録済みの科目と科目名で突合する(表記ゆれは
      `normalize_title()` が吸収)。不合格・履修辞退の科目は再履修の対象として残る。
      `by_subtitle()` の科目は、成績表からどの講義を修得したか分からないので外さない
    - シラバスコードを持つ — `not_offered`(当年度不開講)/ `unresolved`(名寄せ未解決)
      の科目は時間割に置けないため候補から外す(§5.1.4)

    マージ済みの `courses` には他課程から導出した同名の専門関連科目が複数入り得る
    (§4.4.3)。ここでは科目名で1件に寄せ、当該課程の設置科目(`own`)を優先し、
    次いで課程コードの小さい出典を採る(`requirements.py` の科目索引と同じ順序)。

    Args:
        grade: 対象学期の学年(`TargetTerm.grade`)。省略時は `profile.grade`。

    Raises:
        ContextError: 学年が無い場合。配当年次で絞れない。
    """
    grade = grade if grade is not None else profile.grade
    if grade is None:
        raise ContextError("学年が分かりません")

    taken = taken_titles(profile.completed_courses)
    candidates: dict[str, Candidate] = {}
    for course in sorted(
        loaded.curriculum.courses, key=lambda c: (not c.own, c.source_program_code)
    ):
        if course.type == "随意":
            continue
        if course.grade > grade:
            continue
        title = normalize_title(course.title)
        if (title in taken and not by_subtitle(course.title)) or title in candidates:
            continue
        codes = loaded.syllabus_codes(course)
        if not codes:
            continue
        candidates[title] = Candidate(course=course, codes=tuple(codes))

    ordered = sorted(candidates.values(), key=lambda c: (c.course.grade, c.course.title))
    logger.info("候補の科目を抽出しました: %d件", len(ordered))
    return ordered


def attach_offerings(
    candidates: Sequence[Candidate],
    index: dict[str, OfferedClass],
    *,
    eligibility: Eligibility | None = None,
    term: HalfTerm | None = None,
) -> list[Candidate]:
    """候補にシラバスコードで開講クラスを結び付ける(§7.2)。

    api-clean 側に1クラスも見つからない科目は、曜日・時限が分からず時間割に
    置けないため候補から外す。

    **`eligibility` を与えたときは、履修登録できないクラスを落とす**(§6.1)。
    **`term` を与えたときは、その学期の履修登録で登録するクラスだけを残す**
    (`registration_half()`)。学期が判定できないクラスは残す。いずれかで1クラスも
    残らない科目は候補から外す。`by_subtitle()` の科目は、サブタイトルごとに別の候補にする。
    """
    attached: list[Candidate] = []
    for candidate in candidates:
        # 曜日・時限が欠測のクラス(集中講義など)は末尾に寄せる
        classes = sorted(
            (
                index[code]
                for code in candidate.codes
                if code in index
                and (eligibility is None or eligibility.allows(code))
                and (term is None or registration_half(index[code].term) in (term, None))
            ),
            key=class_order,
        )
        if not classes:
            continue
        if by_subtitle(candidate.course.title):
            groups: dict[str, list[OfferedClass]] = {}
            for offered in classes:
                groups.setdefault(normalize_title(offered.subtitle or ""), []).append(offered)
            attached.extend(
                Candidate(
                    course=candidate.course,
                    codes=candidate.codes,
                    classes=tuple(group),
                    subtitle=group[0].subtitle,
                )
                for group in groups.values()
            )
            continue
        attached.append(
            Candidate(course=candidate.course, codes=candidate.codes, classes=tuple(classes))
        )
    logger.info("開講クラスのある候補の科目: %d件", len(attached))
    return attached


# --- 先修条件(§5.1.5 `prerequisites`) ---
#
# 履修要項の先修制(「ある科目を履修するには、指定された科目・単位数の修得が要る」)を
# backend が判定する。判定の結果は3つに分ける:
#
# - met: 満たしている
# - unmet: 満たしていない。候補から外す
# - unknown: 原文(notes)しか無く機械的に判定できない、または判定時点(as_of)が
#   対象学期以降でまだ決まらない。候補に残し「確認が要る」とする


PrerequisiteStatus = Literal["met", "unmet", "unknown"]


def _half_index(term: str) -> int:
    """学期を年度内の前半(0)・後半(1)に寄せる。通年は後期に終わるので後半とする。"""
    return 0 if term in ("前期", "1Q", "2Q", "サ集") else 1


def _all(statuses: Sequence[PrerequisiteStatus]) -> PrerequisiteStatus:
    """AND: 1つでも unmet なら unmet、そうでなく1つでも unknown なら unknown。"""
    return "unmet" if "unmet" in statuses else "unknown" if "unknown" in statuses else "met"


def _any(statuses: Sequence[PrerequisiteStatus]) -> PrerequisiteStatus:
    """OR: 1つでも met なら met、すべて unmet なら unmet、それ以外は unknown。"""
    return "met" if "met" in statuses else "unmet" if all(s == "unmet" for s in statuses) else "unknown"


def _check_conditions(
    conditions: PrerequisiteConditions,
    as_of: PrerequisiteAsOf | None,
    curriculum: MergedCurriculum,
    completed: Sequence[StudentCourse],
    target: TargetTerm | None,
) -> PrerequisiteStatus:
    """条件の組1つ(`min_credits` / `all_of` / `any_of` の AND)を判定する。

    `as_of`(判定時点)があれば、その学期末までに修得した科目だけで数える。判定時点が
    対象学期(`target`)以降なら、まだ成績が出ていないので unknown とする。
    """
    passed = [c for c in completed if c.status == "passed"]
    if as_of is not None:
        cutoff = (
            curriculum.admission_year + as_of.grade - 1,
            0 if as_of.term == "前期" else 1,
        )
        if target is not None and cutoff >= (target.year, 0 if target.term == "前期" else 1):
            return "unknown"
        passed = [c for c in passed if (c.year, _half_index(c.term)) <= cutoff]

    titles = {normalize_title(c.title) for c in passed}
    if conditions.all_of and not all(normalize_title(t) in titles for t in conditions.all_of):
        return "unmet"
    if conditions.any_of and not any(normalize_title(t) in titles for t in conditions.any_of):
        return "unmet"
    if conditions.min_credits:
        index = _course_index(curriculum)
        total = None
        for threshold in conditions.min_credits:
            if threshold.from_ is not None:
                listed = {normalize_title(t) for t in threshold.from_}
                earned = sum(c.credits for c in passed if normalize_title(c.title) in listed)
            elif threshold.accepts is not None:
                earned = sum(
                    c.credits
                    for c in passed
                    if (course := index.get(normalize_title(c.title))) is not None
                    and accepts_course(threshold.accepts, course)
                )
            else:
                if total is None:
                    total = judge(curriculum, passed).earned_credits
                earned = total
            if earned < threshold.credits:
                return "unmet"
    return "met"


def check_prerequisite(
    prerequisite: Prerequisite,
    curriculum: MergedCurriculum,
    completed: Sequence[StudentCourse],
    *,
    target: TargetTerm | None = None,
) -> PrerequisiteStatus:
    """先修条件1件を判定する。

    行に直接書いた条件(`min_credits` / `all_of` / `any_of`)と `one_of` は AND で結ぶ。
    `one_of` は選択肢のどれか1つを満たせば満たす(OR)。選択肢に `as_of` が無ければ
    行の `as_of` を使う。`min_credits` は `from` があれば列挙した科目の単位の合計、
    `accepts` があれば当該区分に当たる修得科目の単位の合計、どちらも無ければ
    卒業要件総修得単位数(要件充足判定の `earned_credits`)で比べる。
    判定できる条件を持たない(原文 `notes` だけの)行は unknown とする。
    """
    if not prerequisite.has_conditions():
        return "unknown"

    statuses: list[PrerequisiteStatus] = []
    if PrerequisiteConditions.has_conditions(prerequisite):
        statuses.append(
            _check_conditions(prerequisite, prerequisite.as_of, curriculum, completed, target)
        )
    if prerequisite.one_of:
        statuses.append(
            _any(
                [
                    _check_conditions(
                        alternative,
                        alternative.as_of or prerequisite.as_of,
                        curriculum,
                        completed,
                        target,
                    )
                    for alternative in prerequisite.one_of
                ]
            )
        )
    return _all(statuses)


@dataclass(frozen=True)
class PrerequisiteResult:
    """候補の科目1件の先修条件の判定結果。`notes` は履修要項の原文。"""

    title: str
    status: PrerequisiteStatus
    notes: str


def oneline(text: str) -> str:
    """履修要項の `notes` を1行にたたむ。"""
    return " ".join(text.split())


def check_prerequisites(
    candidates: Sequence[Candidate],
    curriculum: MergedCurriculum,
    completed: Sequence[StudentCourse],
    *,
    target: TargetTerm | None = None,
) -> tuple[list[Candidate], list[PrerequisiteResult]]:
    """候補の科目の先修条件を判定し、満たさない科目を外す。

    同じ科目に条件が複数あれば、1つでも unmet なら unmet、そうでなく1つでも
    unknown なら unknown とする。先修条件の無い科目はそのまま残し、結果にも載せない。
    """
    by_title: dict[str, list[Prerequisite]] = {}
    for prerequisite in curriculum.prerequisites:
        by_title.setdefault(normalize_title(prerequisite.title), []).append(prerequisite)

    kept: list[Candidate] = []
    results: list[PrerequisiteResult] = []
    for candidate in candidates:
        rules = by_title.get(normalize_title(candidate.course.title))
        if not rules:
            kept.append(candidate)
            continue
        statuses = [
            check_prerequisite(rule, curriculum, completed, target=target) for rule in rules
        ]
        status = _all(statuses)
        results.append(
            PrerequisiteResult(
                title=candidate.course.title,
                status=status,
                notes=" / ".join(oneline(rule.notes) for rule in rules),
            )
        )
        if status != "unmet":
            kept.append(candidate)
    logger.info(
        "先修条件を判定しました: 満たす %d件 / 満たさない %d件 / 要確認 %d件",
        sum(r.status == "met" for r in results),
        sum(r.status == "unmet" for r in results),
        sum(r.status == "unknown" for r in results),
    )
    return kept, results
