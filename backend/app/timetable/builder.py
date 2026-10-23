"""条件から時間割を組み立てる(§7.2)。モデルを呼ばない。

どの科目をどのコマに入れるかは、ここが決める。アシスタント(モデル)は条件を書いて
これを呼び、返ったレポート(`app/timetable/report.py`)を根拠に説明する。

## 手順

1. **残す科目を置く。** `rebuild` は学生が自分で入れた科目(`source: "student"`)だけ、
   `adjust` は今の時間割の全科目を残す。`adjust` では、外してよい科目(必修・学生が
   入れた科目・入れたい科目以外)のうち、全休の曜日・避ける時限に反するものを外す
2. **必修を置く。** 対象学期に履修できる必修は、不合格・履修辞退の再履修を含めて
   必ず置く。条件に合うクラスを選び、どのクラスも合わなければ条件を破って置く
   (破ったことはレポートに出る)。必修どうしが重なったときはどちらも置かず、
   「確かめること」に載せる
3. **入れたい科目(`include`)を置く**
4. **全休の曜日を決める。** 曜日を言われずに日数だけ言われたときは、学生に聞き返さず
   ここで決める。候補は外せない科目の無い平日で、各候補を空けたときに手順5を試し、
   卒業要件の不足を最も多く埋められる曜日を選ぶ(同点なら外す科目が少ない方、
   それでも同点なら無作為)
5. **不足を埋める。** 条件に反せず、置いた科目と重ならず、単位の上限に収まる科目の
   うち、どれかの要件枠の不足を減らすものを1件ずつ置く。順は次のとおり:
   1. 溢れの流れの上流の枠を先に、下流の枠(受け皿)を後に埋める
   2. 同じ段の枠どうしは、不足の大きい順
   3. 履修区分の重さ(選択必修 > 選択)
   4. 単位が不足にちょうど合う科目(溢れて無駄になる単位が少ない)
   5. 既に授業のある曜日に入る科目(授業のある日を詰める)
   6. ここまでで決まらなければ無作為(シラバスコードや配当年次のような、学生に
      とって意味の無い順では決めない)
6. `scope` が `広く` なら、不足が無くなった後も上限まで科目を足す

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
from app.timetable.candidates import Candidate, student_type
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
)

Mode = Literal["rebuild", "adjust"]

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
    blocked_titles: set[str] = field(default_factory=set)
    steps: list[Step] = field(default_factory=list)
    confirmations: list[str] = field(default_factory=list)
    include_failures: dict[str, str] = field(default_factory=dict)
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
            blocked_titles=set(self.blocked_titles),
            confirmations=list(self.confirmations),
            include_failures=dict(self.include_failures),
            removed=self.removed,
            record=False,
        )

    # --- 時間割の状態 ---

    @property
    def total(self) -> int:
        return sum(c.credits or 0 for c in self.courses)

    def titles(self) -> set[str]:
        return {normalize_title(c.title) for c in self.courses}

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
        key = normalize_title(course.title)
        if key in seen:
            continue
        if exclude.matches(course):
            if mode == "adjust" and plan.record:
                plan.steps.append(Step(kind="remove", course=course, note="入れない科目"))
            continue
        if mode == "rebuild" and course.source != "student":
            continue
        seen.add(key)
        plan.add(course, Step(kind="keep", course=course))
    if mode != "adjust":
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
        key = normalize_title(candidate.course.title)
        if key in plan.titles() or key in plan.blocked_titles or exclude.matches(candidate.course):
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
                plan.blocked_titles.add(normalize_title(other.title))
            plan.blocked_titles.add(key)
            plan.confirmations.append(
                f"必修の「{candidate.course.title}」と「{names}」が{where}で重なるため、"
                "どちらも時間割に入れていない。どちらを履修するか教務に確かめる"
            )
        else:
            plan.blocked_titles.add(key)
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
    title = course.title if course else (offered.course_title if offered else wanted)
    key = normalize_title(title)
    if key in ctx.passed():
        return f"{title}は修得済み"
    if key in ctx.registered():
        return f"{title}は登録済み(成績発表待ち)"
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


def _place_includes(plan: _Plan, rng: random.Random) -> None:
    ctx = plan.ctx
    for wanted in plan.conditions.include:
        if ctx.classes.get(wanted) is not None:
            candidate, offered = ctx.classes[wanted]
            options = [proposed_course(candidate.course, offered, reason="希望で入れた科目")]
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
        key = normalize_title(candidate.course.title)
        if key in plan.titles():
            continue
        occupied = plan.occupied()
        used = plan.days_used()
        free = [c for c in options if not plan.clashes(c, occupied)]
        if not free:
            others = plan.clashes(options[0], occupied)
            plan.include_failures[wanted] = (
                f"{candidate.course.title}は「{others[0].title}」と"
                f"{_clash_label(options[0], others[0])}で重なる"
            )
            continue
        choice = min(
            free, key=lambda c: (plan.day_violations(c), plan.new_days(c, used), rng.random())
        )
        if plan.limit is not None and plan.total + (choice.credits or 0) > plan.limit:
            plan.include_failures[wanted] = (
                f"{candidate.course.title}を入れると登録できる単位({plan.limit}単位)を超える"
            )
            continue
        plan.add(choice, Step(kind="include", course=choice))


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
    pool: list[tuple[Candidate, list[ProposedCourse]]] = [
        (c, [proposed_course(c.course, o) for o in c.classes])
        for c in ctx.candidates
        if student_type(c.course) != "必修"
        and not exclude.matches(c.course)
        and normalize_title(c.course.title) not in plan.blocked_titles
    ]
    broad = False
    while True:
        earned, shortfall = estimator.state(plan.courses)
        titles = plan.titles()
        occupied = plan.occupied()
        periods = plan.periods()
        used = plan.days_used()
        best: tuple | None = None
        for candidate, classes in pool:
            course = candidate.course
            if normalize_title(course.title) in titles:
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


def _remaining_shortfall(plan: _Plan, estimator: _Estimator) -> int:
    _, shortfall = estimator.state(plan.courses)
    required = {s.key: s.credits for s in plan.ctx.curriculum.requirement_slots}
    return sum(v for k, v in shortfall.items() if required.get(k, 0) > 0)


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
    if mode == "adjust":
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
            if mode == "adjust":
                _enforce_caps(trial, trial_rng)
            if conditions.scope != "必修のみ":
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


def _shortfall_reasons(
    plan: _Plan, estimator: _Estimator, exclude: _Exclude
) -> dict[str, str]:
    """組み立て後も不足が残った要件枠ごとに、残った理由。"""
    ctx = plan.ctx
    earned, shortfall = estimator.state(plan.courses)
    titles = plan.titles()
    reasons: dict[str, str] = {}
    open_slots = [
        s.key for s in ctx.curriculum.requirement_slots if s.credits > 0 and shortfall[s.key] > 0
    ]
    if not open_slots:
        return reasons
    reachable: dict[str, list[Candidate]] = {key: [] for key in open_slots}
    for candidate in ctx.candidates:
        course = candidate.course
        if normalize_title(course.title) in titles or student_type(course) == "必修":
            continue
        sample = proposed_course(course, candidate.classes[0])
        for key, _ in estimator.gains(course, earned, plan.courses, sample):
            if key in reachable:
                reachable[key].append(candidate)
    for key in open_slots:
        if plan.conditions.scope == "必修のみ":
            reasons[key] = "必修だけを入れる条件のため"
        elif not reachable[key]:
            reasons[key] = "対象学期に履修できる候補が無い"
        elif plan.limit is not None and all(
            plan.total + c.course.credits > plan.limit for c in reachable[key]
        ):
            reasons[key] = "登録できる単位の上限に達した"
        elif all(exclude.matches(c.course) for c in reachable[key]):
            reasons[key] = "入れない科目に指定された科目しか候補が無い"
        else:
            reasons[key] = "条件(全休・避ける時限・1日のコマ数など)やコマの重なりで入れられる候補が無い"
    return reasons


def build_timetable(
    ctx: StudentContext,
    conditions: Conditions,
    current: Sequence[ProposedCourse] = (),
    *,
    mode: Mode = "rebuild",
    rng: random.Random | None = None,
) -> BuildResult:
    """条件から時間割を組み立てる(§7.2)。手順はモジュールの説明を参照。

    Args:
        current: 今の時間割。`rebuild` は学生が入れた科目だけを残し、`adjust` は全科目を
            起点にする。
        rng: 同点の候補を選ぶ乱数。テストでは種を固定して渡す。
    """
    rng = rng or random.Random()
    conditions = conditions.model_copy(deep=True)
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
    _place_includes(plan, rng)
    seed = _choose_free_days(plan, estimator, rng, exclude, mode)
    fill_rng = random.Random(seed)
    if mode == "adjust":
        _enforce_caps(plan, fill_rng)
    if conditions.scope != "必修のみ":
        _fill(plan, estimator, fill_rng, exclude)

    report = make_report(
        ctx,
        plan.courses,
        conditions,
        include_failures=plan.include_failures,
        shortfall_reasons=_shortfall_reasons(plan, estimator, exclude),
        confirmations=plan.confirmations,
    )
    steps = list(plan.steps)
    for status in report.conditions:
        if status.status == "unmet":
            steps.append(Step(kind="unmet", condition=status.condition, detail=status.detail))
    return BuildResult(courses=plan.courses, conditions=conditions, report=report, steps=steps)


def check_timetable(
    ctx: StudentContext, courses: Sequence[ProposedCourse], conditions: Conditions
) -> Report:
    """学生が手で直した時間割のレポート。組み立ては行わない。"""
    return make_report(ctx, courses, conditions)
