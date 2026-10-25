"""条件から時間割を組み立てる(§7.2)。モデルを呼ばない。

どの科目をどのコマに入れるかは、ここが決める。アシスタント(モデル)は条件を書いて
これを呼び、返ったレポート(`app/timetable/report.py`)を根拠に説明する。

## 手順

1. **残す科目を置く。** `rebuild` は学生が自分で入れた科目(`source: "student"`)だけ、
   `adjust` と `remove` は今の時間割の全科目を残す。入れない科目(`exclude`)は必修を除いて
   外す(学生が頼んだので、学生が自分で入れた科目も外す)。`adjust` と `remove` では、外して
   よい科目(必修・学生が入れた科目・入れたい科目以外)のうち、全休の曜日・避ける時限に
   反するものを外す
2. **必修を置く。** 対象学期に履修できる必修は、不合格・履修辞退の再履修を含めて
   必ず置く。条件に合うクラスを選び、どのクラスも合わなければ条件を破って置く
   (破ったことはレポートに出る)。必修どうしが重なったときはどちらも置かず、
   「確かめること」に載せる
3. **入れたい科目(`include`)を置く。** コマが重なるとき・単位の上限を超えるときは、
   外してよい科目(必修・学生が入れた科目・入れたい科目以外)を外して入れる。外す科目は
   重なる科目と、上限に収めるのに要る分で、残る不足が増えにくいものから選ぶ。外せる科目で
   足りなければ入れない。外した科目は手順5で戻さない
4. **全休の曜日を決める。** 曜日を言われずに日数だけ言われたときは、学生に聞き返さず
   ここで決める。候補は外せない科目の無い平日で、各候補を空けたときに手順5を試し、
   卒業要件の不足を最も多く埋められる曜日を選ぶ(同点なら外す科目が少ない方、
   それでも同点なら無作為)
5. **不足を埋める。** 条件に反せず、置いた科目と重ならず、単位の上限に収まる科目の
   うち、どれかの要件枠の不足を減らすものを1件ずつ置く。必修でない不合格・履修辞退の
   科目は使わない(学生が入れたいと言ったとき(`include`)だけ入る)。順は次のとおり:
   1. 溢れの流れの上流の枠を先に、下流の枠(受け皿)を後に埋める
   2. 同じ段の枠どうしは、不足の大きい順
   3. 履修区分の重さ(選択必修 > 選択)
   4. 単位が不足にちょうど合う科目(溢れて無駄になる単位が少ない)
   5. 既に授業のある曜日に入る科目(授業のある日を詰める)
   6. ここまでで決まらなければ無作為(シラバスコードや配当年次のような、学生に
      とって意味の無い順では決めない)
6. `scope` が `広く` なら、不足が無くなった後も上限まで科目を足す

`remove` は外すだけで、手順5・6を飛ばす(「〜を外して」とだけ言われたとき。代わりを
探すかは学生が決める)。埋めれば減る不足は、埋めていないことをレポートの残る不足の理由に
書く。

単位が要件枠のどこに入るかは、要件充足判定(§4.4.5)と同じ規則で決める。1件置く
ごとに判定し直し、候補の見積もりには判定と同じ起点の枠(`entry_slot_keys()`)から
溢れの先を辿る。算入上限(`credit_caps`)のある科目だけは判定し直して見積もる。
"""

import itertools
import random
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Literal

from app.curricula.requirements import EntrySlots, entry_slot_keys, normalize_title
from app.curricula.merge import MergedCourse
from app.schemas.proposal import CourseSlot, ProposedCourse, course_clash, quarters_of
from app.timetable.candidates import Candidate, by_subtitle, display_title, key_of, student_type
from app.timetable.conditions import Conditions
from app.timetable.context import StudentContext, proposed_course
from app.timetable.offerings import DAYS, WEEKDAYS, registration_half
from app.timetable.report import (
    Report,
    Step,
    course_days,
    is_required,
    is_removable,
    make_report,
    pinned_keys,
    NO_CANDIDATE,
)

Mode = Literal["rebuild", "adjust", "remove"]

# 残る不足の理由(`remove`)。外すだけで、空いた分を埋めていない
UNFILLED = "外すだけの指示のため、代わりの科目を入れていない(代わりを探せば埋められる)"

# 同じ枠の候補どうしで、履修区分の重さ。小さいほど先に置く
_WEIGHT = {"選択必修": 0, "選択": 1}

# 全休の曜日の組み合わせを試す上限(5日から3日を選ぶと10通り)
_MAX_FREE_DAY_COMBINATIONS = 20


def _occupancy_keys(slot: CourseSlot) -> list[tuple]:
    """コマが占める枠の鍵。クォーターが分かる学期はクォーターごとに、分からない学期は
    学期の文字列で持つ(`slots_clash()` と同じ判定になる)。"""
    quarters = quarters_of(slot.term)
    if quarters is not None:
        return [(slot.day, slot.period, q) for q in quarters]
    return [(slot.day, slot.period, f"term:{slot.term}")]


def _clash_label(a: ProposedCourse, b: ProposedCourse) -> str:
    slot = course_clash(a, b)
    return f"{slot.day}{slot.period}" if slot else "同じコマ"


class _Exclude:
    """入れない科目(`exclude`)の判定。科目名は正規化して、コードはそのまま比べる。"""

    def __init__(self, values: Sequence[str]):
        self.keys = {x for v in values for x in (v, normalize_title(v))}

    def matches(self, course: ProposedCourse | MergedCourse, code: str | None = None) -> bool:
        if normalize_title(course.title) in self.keys:
            return True
        code = code or getattr(course, "syllabus_code", None)
        return code is not None and code in self.keys


@dataclass
class _Plan:
    """組み立て途中の時間割。全休の曜日を試すときは写しを作って試す。"""

    ctx: StudentContext
    conditions: Conditions
    limit: int | None
    pinned: set[str]
    courses: list[ProposedCourse] = field(default_factory=list)
    blocked_days: set[str] = field(default_factory=set)
    # 置かない科目(`course_key()`)。重なった必修・入れたい科目のために外した科目
    blocked_keys: set[str] = field(default_factory=set)
    steps: list[Step] = field(default_factory=list)
    confirmations: list[str] = field(default_factory=list)
    include_failures: dict[str, str] = field(default_factory=dict)
    # 入れたい科目のために外した科目(科目名 → 理由)
    displaced: dict[str, str] = field(default_factory=dict)
    # 入れたい科目(シラバスコード)を、指定と別のクラスで置いたときのそのクラスのコード
    include_placed: dict[str, str] = field(default_factory=dict)
    removed: int = 0
    record: bool = True

    def copy(self) -> "_Plan":
        return _Plan(
            ctx=self.ctx,
            conditions=self.conditions,
            limit=self.limit,
            pinned=self.pinned,
            courses=list(self.courses),
            blocked_days=set(self.blocked_days),
            blocked_keys=set(self.blocked_keys),
            confirmations=list(self.confirmations),
            include_failures=dict(self.include_failures),
            removed=self.removed,
            record=False,
        )

    # --- 時間割の状態 ---

    @property
    def total(self) -> int:
        return sum(c.credits or 0 for c in self.courses)

    def keys(self) -> set[str]:
        """置いた科目の同一性(`course_key()`)。"""
        return {key_of(c) for c in self.courses}

    def occupied(self) -> dict[tuple, ProposedCourse]:
        table: dict[tuple, ProposedCourse] = {}
        for course in self.courses:
            for slot in course.occupied_slots():
                for key in _occupancy_keys(slot):
                    table.setdefault(key, course)
        return table

    def periods(self) -> dict[str, set[int]]:
        table: dict[str, set[int]] = {day: set() for day in DAYS}
        for course in self.courses:
            for slot in course.occupied_slots():
                table[slot.day].add(slot.period)
        return table

    def days_used(self) -> set[str]:
        return {day for c in self.courses for day in course_days(c) if day in WEEKDAYS}

    def courses_on(self, day: str) -> list[ProposedCourse]:
        return [c for c in self.courses if day in course_days(c)]

    def clashes(self, course: ProposedCourse, occupied: dict | None = None) -> list[ProposedCourse]:
        occupied = occupied if occupied is not None else self.occupied()
        hits: list[ProposedCourse] = []
        for slot in course.occupied_slots():
            for key in _occupancy_keys(slot):
                other = occupied.get(key)
                if other is not None and other not in hits:
                    hits.append(other)
        return hits

    def removable(self, course: ProposedCourse) -> bool:
        return is_removable(course, self.pinned)

    # --- 条件 ---

    def day_violations(self, course: ProposedCourse) -> int:
        """全休の曜日と避ける時限について、その科目が破る条件の数。"""
        count = 0
        for slot in course.occupied_slots():
            if slot.day in self.blocked_days:
                count += 1
            if any(rule.matches(slot.day, slot.period) for rule in self.conditions.avoid_periods):
                count += 1
        return count

    def fits_elective(
        self, course: ProposedCourse, periods: dict[str, set[int]], used: set[str]
    ) -> bool:
        """選択科目として置けるか(全休・避ける時限・1日のコマ数・平日の数)。"""
        if self.day_violations(course):
            return False
        added: dict[str, set[int]] = {}
        for slot in course.occupied_slots():
            added.setdefault(slot.day, set()).add(slot.period)
        for day, ps in added.items():
            if len(periods[day] | ps) > self.conditions.max_periods_per_day:
                return False
        if self.conditions.max_days is not None:
            days = used | {day for day in added if day in WEEKDAYS}
            if len(days) > self.conditions.max_days:
                return False
        return True

    @staticmethod
    def new_days(course: ProposedCourse, used: set[str]) -> int:
        return len({d for d in course_days(course) if d in WEEKDAYS} - used)

    # --- 変更 ---

    def add(self, course: ProposedCourse, step: Step | None) -> None:
        self.courses.append(course)
        if self.record and step is not None:
            self.steps.append(step)

    def remove(self, course: ProposedCourse, note: str) -> None:
        self.courses = [c for c in self.courses if c is not course]
        self.removed += 1
        if self.record:
            self.steps.append(Step(kind="remove", course=course, note=note))

    def clear_day(self, day: str) -> None:
        """その曜日の外してよい科目を外す。"""
        for course in list(self.courses_on(day)):
            if self.removable(course):
                self.remove(course, f"{day}曜を全休にするため")


def _credit_limit(ctx: StudentContext, conditions: Conditions) -> int | None:
    limits = []
    if ctx.budget is not None:
        limits.append(ctx.budget.remaining)
    if conditions.target_credits is not None:
        limits.append(conditions.target_credits)
    return min(limits) if limits else None


@dataclass(frozen=True)
class BuildResult:
    """組み立ての結果。`conditions` は組み立てで実際に使った条件(全休の曜日を決めた
    ときはその曜日が `free_days` に入る)。"""

    courses: list[ProposedCourse]
    conditions: Conditions
    report: Report
    steps: list[Step]
    # 入れたい科目(`include` の値)を入れられなかった理由
    include_failures: dict[str, str] = field(default_factory=dict)
    # 入れたい科目のために外した科目(科目名 → 理由)
    displaced: dict[str, str] = field(default_factory=dict)
    # 入れたい科目(シラバスコード)を、指定と別のクラスで置いたときのそのクラスのコード
    include_placed: dict[str, str] = field(default_factory=dict)

    @property
    def total_credits(self) -> int:
        return sum(c.credits or 0 for c in self.courses)


# --- 単位の行き先の見積もり ---


class _Estimator:
    """科目を1つ足したとき、単位がどの要件枠の不足を減らすかを見積もる。"""

    def __init__(self, ctx: StudentContext):
        self.ctx = ctx
        self.entries: EntrySlots = entry_slot_keys(ctx.curriculum)
        self.slots = ctx.curriculum.slots_by_key
        self.capped = {
            normalize_title(title) for cap in ctx.curriculum.credit_caps for title in cap.titles
        }
        self._entry_cache: dict[str, str | None] = {}

    def state(self, courses: Sequence[ProposedCourse]) -> tuple[dict[str, int], dict[str, int]]:
        """(修得単位, 不足単位) を要件枠ごとに。時間割の科目を修得したとみなす。"""
        result = self.ctx.judge_with(courses)
        return (
            {s.key: s.earned for s in result.slots},
            {s.key: s.shortfall for s in result.slots},
        )

    def entry(self, course: MergedCourse) -> str | None:
        key = normalize_title(course.title)
        if key not in self._entry_cache:
            self._entry_cache[key] = self.entries.entry(course)
        return self._entry_cache[key]

    def gains(
        self,
        course: MergedCourse,
        earned: dict[str, int],
        courses: Sequence[ProposedCourse],
        sample: ProposedCourse,
    ) -> list[tuple[str, int]]:
        """(要件枠, 減る不足) を上流から順に。"""
        if normalize_title(course.title) in self.capped:
            after = self.ctx.judge_with([*courses, sample])
            gained = [
                (s.key, s.earned - earned[s.key]) for s in after.slots if s.earned > earned[s.key]
            ]
            return sorted(gained, key=lambda g: self.entries.levels.get(g[0], 0))
        key = self.entry(course)
        amount = course.credits
        out: list[tuple[str, int]] = []
        while amount > 0 and key is not None:
            slot = self.slots[key]
            take = min(max(0, slot.credits - earned[key]), amount)
            if take > 0:
                out.append((key, take))
                amount -= take
            key = slot.overflow_to
        return out


# --- 手順 ---


def _keep(plan: _Plan, current: Sequence[ProposedCourse], mode: Mode, exclude: _Exclude) -> None:
    seen: set[str] = set()
    for course in current:
        key = key_of(course)
        if key in seen:
            continue
        # 必修は外さない(学生に頼まれても。手順2で必ず置く科目である)
        if exclude.matches(course) and not is_required(course):
            if mode != "rebuild" and plan.record:
                plan.steps.append(Step(kind="remove", course=course, note="入れない科目"))
            continue
        if mode == "rebuild" and course.source != "student":
            continue
        seen.add(key)
        plan.add(course, Step(kind="keep", course=course))
    if mode == "rebuild":
        return
    # 全休の曜日(指定されたもの)と避ける時限に反する、外してよい科目を外す
    for course in list(plan.courses):
        if plan.removable(course) and plan.day_violations(course):
            plan.remove(course, "条件(全休・避ける時限)に反するため")


def _place_required(plan: _Plan, rng: random.Random, exclude: _Exclude) -> None:
    ctx = plan.ctx
    retakes = ctx.retakes()
    required = [c for c in ctx.candidates if student_type(c.course) == "必修"]
    required.sort(key=lambda c: (len(c.classes), rng.random()))
    for candidate in required:
        key = candidate.key
        # 入れない科目に指定されていても置く(必修は外せない。build_failures() が伝える)
        if key in plan.keys() or key in plan.blocked_keys:
            continue
        retake = key in retakes
        note = "再履修" if retake else "必修"
        reason = "再履修の必修" if retake else "必修"
        classes = [proposed_course(candidate.course, o, reason=reason) for o in candidate.classes]
        occupied = plan.occupied()
        used = plan.days_used()
        free = [c for c in classes if not plan.clashes(c, occupied)]
        if free:
            choice = min(
                free,
                key=lambda c: (plan.day_violations(c), plan.new_days(c, used), rng.random()),
            )
            plan.add(choice, Step(kind="required", course=choice, note=note))
            continue
        best = min(classes, key=lambda c: (len(plan.clashes(c, occupied)), rng.random()))
        others = plan.clashes(best, occupied)
        names = "」「".join(o.title for o in others)
        where = _clash_label(best, others[0])
        if all(is_required(o) and o.source == "assistant" for o in others):
            for other in others:
                plan.remove(other, f"必修の「{candidate.course.title}」と重なるため")
                plan.blocked_keys.add(key_of(other))
            plan.blocked_keys.add(key)
            plan.confirmations.append(
                f"必修の「{candidate.course.title}」と「{names}」が{where}で重なるため、"
                "どちらも時間割に入れていない。どちらを履修するか教務に確かめる"
            )
        else:
            plan.blocked_keys.add(key)
            plan.confirmations.append(
                f"必修の「{candidate.course.title}」が「{names}」と{where}で重なるため、"
                "時間割に入れていない"
            )
    if plan.limit is not None and plan.total > plan.limit:
        plan.confirmations.append(
            f"必修だけで登録できる単位({plan.limit}単位)を超える。履修登録の上限を確かめる"
        )


def _include_failure(ctx: StudentContext, wanted: str) -> str:
    """入れたい科目を候補に見つけられなかった理由。"""
    course = ctx.course_of_code(wanted) or ctx.course_by_title(wanted)
    offered = ctx.catalog.classes.get(wanted)
    title = ctx.title_of(wanted)
    key = normalize_title(title)
    if key in ctx.passed() and not by_subtitle(title):
        return f"{title}は修得済み"
    if key in ctx.registered():
        return f"{title}は登録済み(成績発表待ち)"
    if key in ctx.assumed_titles():
        return f"{title}は合格する前提で数えている科目"
    if offered is not None:
        if registration_half(offered.term) not in (ctx.target.term, None):
            return f"{title}({wanted})は{offered.term}開講で、{ctx.target.term}に登録する科目ではない"
        if not ctx.eligibility.allows(wanted):
            return f"{title}({wanted})は他課程が対象のクラスで、履修登録できない"
    if course is None:
        return f"{title}は履修要項に無い科目で、時間割に入れられない"
    if course.type == "随意":
        return f"{title}は随意科目で、卒業要件に算入されない"
    if course.grade > ctx.target.grade:
        return f"{title}は{course.grade}年次からの科目"
    result = ctx.prerequisites.get(key)
    if result is not None and result.status == "unmet":
        return f"{title}は先修条件を満たしていない"
    return f"{title}は対象学期({ctx.target.year}年度{ctx.target.term})に履修できるクラスが無い"


def _place_includes(plan: _Plan, rng: random.Random, estimator: _Estimator) -> None:
    ctx = plan.ctx
    for wanted in list(plan.conditions.include):
        specified: str | None = None
        if ctx.classes.get(wanted) is not None:
            candidate, offered = ctx.classes[wanted]
            specified = offered.syllabus_code
            # 指定されたクラスを先に、同じ科目のほかのクラスも試す。検索の code は曜日の早い
            # クラスで、モデルはたいていそれを渡す。学生はクラスを選んだわけではない
            options = [
                proposed_course(candidate.course, o, reason="希望で入れた科目")
                for o in (offered, *(o for o in candidate.classes if o is not offered))
            ]
        else:
            matched = [
                c for c in ctx.candidates if normalize_title(c.course.title) == normalize_title(wanted)
            ]
            if not matched:
                if not any(
                    wanted in (c.syllabus_code, normalize_title(c.title)) for c in plan.courses
                ):
                    plan.include_failures[wanted] = _include_failure(ctx, wanted)
                continue
            candidate = matched[0]
            options = [
                proposed_course(candidate.course, o, reason="希望で入れた科目")
                for o in candidate.classes
            ]
        if candidate.key in plan.keys():
            continue
        title = display_title(options[0])
        occupied = plan.occupied()
        used = plan.days_used()
        free = [c for c in options if not plan.clashes(c, occupied)]
        if free:
            choice = min(
                free,
                key=lambda c: (
                    plan.day_violations(c),
                    c.syllabus_code != specified,
                    plan.new_days(c, used),
                    rng.random(),
                ),
            )
            clashing: list[ProposedCourse] = []
        else:
            # 重なる科目がどれも外してよい科目なら、外して入れる
            movable = [
                c for c in options if all(plan.removable(o) for o in plan.clashes(c, occupied))
            ]
            if not movable:
                others = plan.clashes(options[0], occupied)
                fixed = next((o for o in others if not plan.removable(o)), others[0])
                plan.include_failures[wanted] = (
                    f"{title}は「{fixed.title}」(必修・自分で入れた科目・入れたい科目で外せない)と"
                    f"{_clash_label(options[0], fixed)}で重なる"
                )
                continue
            choice = min(
                movable,
                key=lambda c: (
                    plan.day_violations(c),
                    _shortfall_after(plan, estimator, plan.clashes(c, occupied), c),
                    len(plan.clashes(c, occupied)),
                    c.syllabus_code != specified,
                    rng.random(),
                ),
            )
            clashing = plan.clashes(choice, occupied)
        over_limit = _make_room(plan, estimator, choice, clashing, rng)
        if over_limit is None:
            plan.include_failures[wanted] = (
                f"{title}を入れると登録できる単位({plan.limit}単位)を超え、"
                "外してよい科目を外しても収まらない"
            )
            continue
        for other in clashing:
            where = _clash_label(choice, other)
            plan.remove(other, f"入れたい科目の「{title}」と{where}で重なるため")
            plan.displaced[display_title(other)] = f"{title}と{where}で重なる"
        for other in over_limit:
            plan.remove(other, f"入れたい科目の「{title}」を入れると登録できる単位を超えるため")
            plan.displaced[display_title(other)] = (
                f"{title}を入れると登録できる単位({plan.limit}単位)を超える"
            )
        # 外した科目を不足を埋める手順で戻さない(外したと伝えた科目が時間割に残る)
        plan.blocked_keys |= {key_of(c) for c in [*clashing, *over_limit]}
        if specified is not None and choice.syllabus_code != specified:
            # 置いたクラスを入れたい科目として持ち直す。frontend が手で外したときに
            # 条件から除けるよう、時間割の科目と同じコードにする
            plan.include_placed[wanted] = choice.syllabus_code
            plan.conditions.include = [
                choice.syllabus_code if v == wanted else v for v in plan.conditions.include
            ]
        if choice.syllabus_code:
            plan.pinned.add(choice.syllabus_code)
        plan.add(choice, Step(kind="include", course=choice))


def _shortfall_after(
    plan: _Plan,
    estimator: _Estimator,
    removed: Sequence[ProposedCourse],
    added: ProposedCourse,
) -> tuple[int, ...]:
    """`removed` を外して `added` を入れたときの残る不足(`_remaining_shortfall()` の形)。"""
    trial = plan.copy()
    trial.courses = [c for c in plan.courses if not any(c is r for r in removed)] + [added]
    return _remaining_shortfall(trial, estimator)


def _make_room(
    plan: _Plan,
    estimator: _Estimator,
    choice: ProposedCourse,
    clashing: Sequence[ProposedCourse],
    rng: random.Random,
) -> list[ProposedCourse] | None:
    """入れたい科目を単位の上限に収めるために、重なる科目のほかに外す科目。

    外してよい科目から1つずつ、外しても残る不足が増えにくいものを選ぶ(同じなら、1つで
    足りる科目のうち単位の少ないもの)。外せる科目で足りなければ None。
    """
    if plan.limit is None:
        return []
    removed = list(clashing)
    extra: list[ProposedCourse] = []

    def total() -> int:
        return sum(c.credits or 0 for c in plan.courses if not any(c is r for r in removed)) + (
            choice.credits or 0
        )

    pool = [c for c in plan.courses if plan.removable(c) and not any(c is r for r in removed)]
    if total() - sum(c.credits or 0 for c in pool) > plan.limit:
        return None
    while total() > plan.limit:
        need = total() - plan.limit
        best = min(
            pool,
            key=lambda c: (
                _shortfall_after(plan, estimator, [*removed, c], choice),
                (c.credits or 0) < need,
                c.credits or 0,
                rng.random(),
            ),
        )
        pool.remove(best)
        removed.append(best)
        extra.append(best)
    return extra


def _enforce_caps(plan: _Plan, rng: random.Random) -> None:
    """今の時間割を直すとき、1日のコマ数・平日の数の上限を超える分を外す。"""
    cap = plan.conditions.max_periods_per_day
    for day in DAYS:
        while len(plan.periods()[day]) > cap:
            removable = [c for c in plan.courses_on(day) if plan.removable(c)]
            if not removable:
                break
            plan.remove(rng.choice(removable), f"{day}曜を{cap}コマまでにするため")
    if plan.conditions.max_days is None:
        return
    while len(plan.days_used()) > plan.conditions.max_days:
        days = [
            d
            for d in plan.days_used()
            if all(plan.removable(c) for c in plan.courses_on(d))
        ]
        if not days:
            break
        day = min(days, key=lambda d: (len(plan.courses_on(d)), rng.random()))
        for course in list(plan.courses_on(day)):
            plan.remove(course, f"授業のある平日を{plan.conditions.max_days}日までにするため")


def _fill(
    plan: _Plan, estimator: _Estimator, rng: random.Random, exclude: _Exclude
) -> None:
    """不足を埋める(手順5)。`scope` が `広く` なら上限まで足す(手順6)。"""
    ctx = plan.ctx
    levels = estimator.entries.levels
    names = ctx.slot_names()
    # 必修でない不合格・履修辞退の科目は、学生が入れたいと言ったとき(`include`)だけ入る。
    # 不足を埋める候補には使わない(落とした選択科目を取り直すかは学生が決める)
    retakes = ctx.retakes()
    pool: list[tuple[Candidate, list[ProposedCourse]]] = [
        (c, [proposed_course(c.course, o) for o in c.classes])
        for c in ctx.candidates
        if student_type(c.course) != "必修"
        and normalize_title(c.course.title) not in retakes
        and not exclude.matches(c.course)
        and c.key not in plan.blocked_keys
    ]
    broad = False
    while True:
        earned, shortfall = estimator.state(plan.courses)
        keys = plan.keys()
        occupied = plan.occupied()
        periods = plan.periods()
        used = plan.days_used()
        best: tuple | None = None
        for candidate, classes in pool:
            course = candidate.course
            if candidate.key in keys:
                continue
            if plan.limit is not None and plan.total + course.credits > plan.limit:
                continue
            options = [
                c
                for c in classes
                if not plan.clashes(c, occupied) and plan.fits_elective(c, periods, used)
            ]
            if not options:
                continue
            choice = min(options, key=lambda c: (plan.new_days(c, used), rng.random()))
            gains = estimator.gains(course, earned, plan.courses, choice)
            reduction = sum(take for _, take in gains)
            weight = _WEIGHT.get(student_type(course), 2)
            if not broad:
                if reduction <= 0:
                    continue
                primary = gains[0][0]
                rank = (
                    levels.get(primary, 0),
                    -shortfall[primary],
                    weight,
                    course.credits - reduction,
                    plan.new_days(choice, used),
                    rng.random(),
                )
            else:
                rank = (weight, plan.new_days(choice, used), rng.random())
            if best is None or rank < best[0]:
                best = (rank, choice, gains)
        if best is None:
            if not broad and plan.conditions.scope == "広く":
                broad = True
                continue
            return
        _, choice, gains = best
        if gains:
            primary = gains[0][0]
            name = names.get(primary, primary)
            choice = choice.model_copy(update={"reason": f"{name}の不足を埋める"})
            after = shortfall[primary] - gains[0][1]
            step = Step(kind="fill", course=choice, slot=name, shortfall_after=max(0, after))
        else:
            choice = choice.model_copy(update={"reason": "登録できる単位の範囲で追加"})
            step = Step(kind="fill", course=choice)
        plan.add(choice, step)


def _remaining_shortfall(plan: _Plan, estimator: _Estimator) -> tuple[int, ...]:
    """残る不足を、溢れの段ごとに上流から並べたもの。辞書順で比べる。

    合計だけで比べると、上流の枠(専門応用(選択)など)を埋められない曜日を空けても、
    受け皿の枠(フリーゾーン)が同じ単位を吸うため同点になる。上流の枠の不足が少ない
    方を先に選ぶ(手順5の順と同じ考え)。
    """
    _, shortfall = estimator.state(plan.courses)
    levels = estimator.entries.levels
    totals: dict[int, int] = {}
    for slot in plan.ctx.curriculum.requirement_slots:
        if slot.credits > 0:
            level = levels.get(slot.key, 0)
            totals[level] = totals.get(level, 0) + shortfall[slot.key]
    return tuple(totals[level] for level in sorted(totals))


def _choose_free_days(
    plan: _Plan,
    estimator: _Estimator,
    rng: random.Random,
    exclude: _Exclude,
    mode: Mode,
) -> float:
    """全休の曜日を決める(手順4)。手順5で使う乱数の種を返す。"""
    conditions = plan.conditions
    fixed = list(dict.fromkeys(conditions.free_days))
    plan.blocked_days = set(fixed)
    if mode != "rebuild":
        for day in fixed:
            plan.clear_day(day)
    seed = rng.random()
    extra = conditions.wanted_free_days() - len(fixed)
    if extra <= 0:
        return seed
    options = [
        day
        for day in WEEKDAYS
        if day not in fixed and all(plan.removable(c) for c in plan.courses_on(day))
    ]
    if len(options) <= extra:
        chosen = options
    else:
        combos = list(itertools.combinations(options, extra))[:_MAX_FREE_DAY_COMBINATIONS]
        scored = []
        for combo in combos:
            trial = plan.copy()
            trial.blocked_days |= set(combo)
            for day in combo:
                trial.clear_day(day)
            trial_rng = random.Random(seed)
            if mode != "rebuild":
                _enforce_caps(trial, trial_rng)
            if _fills(mode, conditions):
                _fill(trial, estimator, trial_rng, exclude)
            scored.append(
                ((_remaining_shortfall(trial, estimator), trial.removed, rng.random()), combo)
            )
        chosen = list(min(scored)[1])
    others = [day for day in options if day not in chosen]
    for day in chosen:
        plan.blocked_days.add(day)
        conditions.free_days.append(day)
        if plan.record:
            plan.steps.append(Step(kind="free_day", day=day, others=others))
        plan.clear_day(day)
    return seed


def _fills(mode: Mode, conditions: Conditions) -> bool:
    """不足を埋めるか(手順5・6)。"""
    return mode != "remove" and conditions.scope != "必修のみ"


def _unfilled_reasons(
    plan: _Plan,
    estimator: _Estimator,
    rng: random.Random,
    exclude: _Exclude,
    reasons: dict[str, str],
) -> None:
    """外すだけ(`remove`)で残った不足のうち、埋めれば減る枠の理由を書き換える。

    埋めても減らない枠は、組み立てたときと同じ理由のままにする。
    """
    if plan.conditions.scope == "必修のみ":
        return
    _, shortfall = estimator.state(plan.courses)
    trial = plan.copy()
    _fill(trial, estimator, rng, exclude)
    _, filled = estimator.state(trial.courses)
    for key, short in shortfall.items():
        if filled[key] < short:
            reasons[key] = UNFILLED


def _shortfall_reasons(
    plan: _Plan, estimator: _Estimator, exclude: _Exclude
) -> dict[str, str]:
    """組み立て後も不足が残った要件枠ごとに、残った理由。"""
    ctx = plan.ctx
    earned, shortfall = estimator.state(plan.courses)
    placed = plan.keys()
    reasons: dict[str, str] = {}
    open_slots = [
        s.key for s in ctx.curriculum.requirement_slots if s.credits > 0 and shortfall[s.key] > 0
    ]
    if not open_slots:
        return reasons
    reachable: dict[str, list[Candidate]] = {key: [] for key in open_slots}
    retakes = ctx.retakes()
    for candidate in ctx.candidates:
        course = candidate.course
        if (
            candidate.key in placed
            or normalize_title(course.title) in retakes
            or student_type(course) == "必修"
        ):
            continue
        sample = proposed_course(course, candidate.classes[0])
        for key, _ in estimator.gains(course, earned, plan.courses, sample):
            if key in reachable:
                reachable[key].append(candidate)
    for key in open_slots:
        if plan.conditions.scope == "必修のみ":
            reasons[key] = "必修だけを入れる条件のため"
        elif not reachable[key]:
            reasons[key] = NO_CANDIDATE
        elif plan.limit is not None and all(
            plan.total + c.course.credits > plan.limit for c in reachable[key]
        ):
            reasons[key] = "登録できる単位の上限に達した。" + _blockers(plan, reachable[key], exclude)
        elif all(exclude.matches(c.course) for c in reachable[key]):
            reasons[key] = "入れない科目に指定された科目しか候補が無い"
        else:
            reasons[key] = (
                "条件(全休・避ける時限・1日のコマ数など)やコマの重なりで入れられる候補が無い。"
                + _blockers(plan, reachable[key], exclude)
            )
    return reasons


# 残る不足の理由に挙げる候補の数。多いとモデルが読む量が増えるだけになる
_MAX_BLOCKERS = 3


def _blockers(plan: _Plan, candidates: Sequence[Candidate], exclude: _Exclude) -> str:
    """不足を減らせた候補が、それぞれ何に阻まれて入らなかったか(「候補: 〜(〜と月2で重なる)」)。

    理由が「上限に達した」だけだと、上限に余裕があっても重なりで入らない候補を、モデルが
    「どれかを外せば入る」と説明する(実機で、法学のすすめと月2で重なる科目を、別の科目と
    入れ替えれば入ると提案した)。重なる科目の名前まで書き、何を外せば入るかを読めるようにする。
    """
    occupied = plan.occupied()
    periods = plan.periods()
    used = plan.days_used()
    notes: dict[str, str] = {}
    for candidate in candidates:
        course = candidate.course
        if course.title not in notes:
            notes[course.title] = _blocker(plan, candidate, exclude, occupied, periods, used)
    shown = list(notes.items())[:_MAX_BLOCKERS]
    rest = len(notes) - len(shown)
    text = "、".join(f"{title}({why})" for title, why in shown)
    return f"候補: {text}" + (f"、ほか{rest}件" if rest else "")


def _blocker(
    plan: _Plan,
    candidate: Candidate,
    exclude: _Exclude,
    occupied: dict[tuple, ProposedCourse],
    periods: dict[str, set[int]],
    used: set[str],
) -> str:
    """1つの候補が入らなかった理由。重なりは上限より先に書く(上限に余裕があっても入らない)。"""
    course = candidate.course
    if exclude.matches(course):
        return "入れない科目に指定されている"
    classes = [proposed_course(course, o) for o in candidate.classes]
    free = [c for c in classes if not plan.clashes(c, occupied)]
    if not free:
        option = min(classes, key=lambda c: len(plan.clashes(c, occupied)))
        return "、".join(
            f"{other.title}と{_clash_label(option, other)}で重なる"
            for other in plan.clashes(option, occupied)
        )
    if not any(plan.fits_elective(c, periods, used) for c in free):
        return "全休・避ける時限・1日のコマ数などの条件に反する"
    if plan.limit is not None and plan.total + course.credits > plan.limit:
        return f"空いたコマには入るが、登録できる単位({plan.limit}単位)を超える"
    return "ほかの科目との組み合わせで入らなかった"


def build_timetable(
    ctx: StudentContext,
    conditions: Conditions,
    current: Sequence[ProposedCourse] = (),
    *,
    mode: Mode = "rebuild",
    rng: random.Random | None = None,
) -> BuildResult:
    """条件から時間割を組み立てる(§7.2)。手順はモジュールの説明を参照。

    不足は、条件の `assume_passed` と成績発表待ちの科目に合格する前提で数える
    (`StudentContext.assuming()`)。

    Args:
        current: 今の時間割。`rebuild` は学生が入れた科目だけを残し、`adjust` と `remove` は
            全科目を起点にする。`remove` は不足を埋めない。
        rng: 同点の候補を選ぶ乱数。テストでは種を固定して渡す。
    """
    rng = rng or random.Random()
    conditions = conditions.model_copy(deep=True)
    ctx = ctx.assuming(conditions.assume_passed)
    exclude = _Exclude(conditions.exclude)
    plan = _Plan(
        ctx=ctx,
        conditions=conditions,
        limit=_credit_limit(ctx, conditions),
        pinned=pinned_keys(conditions),
        # 指定された全休の曜日は、必修のクラスを選ぶ前から避ける
        blocked_days=set(conditions.free_days),
    )
    estimator = _Estimator(ctx)

    _keep(plan, current, mode, exclude)
    _place_required(plan, rng, exclude)
    _place_includes(plan, rng, estimator)
    seed = _choose_free_days(plan, estimator, rng, exclude, mode)
    fill_rng = random.Random(seed)
    if mode != "rebuild":
        _enforce_caps(plan, fill_rng)
    if _fills(mode, conditions):
        _fill(plan, estimator, fill_rng, exclude)
    reasons = _shortfall_reasons(plan, estimator, exclude)
    if mode == "remove":
        _unfilled_reasons(plan, estimator, fill_rng, exclude, reasons)

    report = make_report(
        ctx,
        plan.courses,
        conditions,
        include_failures=plan.include_failures,
        shortfall_reasons=reasons,
        confirmations=plan.confirmations,
    )
    steps = list(plan.steps)
    for status in report.conditions:
        if status.status == "unmet":
            steps.append(Step(kind="unmet", condition=status.condition, detail=status.detail))
    return BuildResult(
        courses=plan.courses,
        conditions=conditions,
        report=report,
        steps=steps,
        include_failures=dict(plan.include_failures),
        displaced=dict(plan.displaced),
        include_placed=dict(plan.include_placed),
    )


def check_timetable(
    ctx: StudentContext, courses: Sequence[ProposedCourse], conditions: Conditions
) -> Report:
    """学生が手で直した時間割のレポート。組み立ては行わない。"""
    return make_report(ctx.assuming(conditions.assume_passed), courses, conditions)
