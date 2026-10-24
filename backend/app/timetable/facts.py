"""プロンプトに載せる事実の節。値は backend が計算し、モデルには数えさせない(§7.2)。"""

from collections.abc import Sequence

from app.curricula.requirements import RequirementsResult, normalize_title
from app.timetable.candidates import oneline, student_type
from app.timetable.context import StudentContext


def credits_label(value: float) -> str:
    """単位数を書く。単位は整数であり、`2.0` ではなく `2` と書く(モデルは見た表記を写す)。"""
    return str(int(value)) if float(value).is_integer() else str(value)


def section(title: str, lines: Sequence[str]) -> str:
    return f"【{title}】\n" + "\n".join(lines)


def format_requirements(requirements: RequirementsResult) -> list[str]:
    """【卒業要件の充足状況】の中身。要件枠は公式の名前で書く(§5.1.2)。不足のある枠を先に並べる。"""
    lines = [
        f"卒業必要単位: {requirements.total_credits} / "
        f"修得済み: {credits_label(requirements.earned_credits)} / "
        f"卒業までに残り: {credits_label(requirements.remaining_credits)}",
        "要件枠ごとの不足単位:",
    ]
    for slot in sorted(requirements.slots, key=lambda s: (s.shortfall <= 0, s.key)):
        # `required: 0` の枠は受け皿を持たない通過点であり、不足という概念がない
        if slot.required == 0:
            continue
        line = (
            f"- {slot.name}: 必要 {slot.required} / "
            f"修得 {credits_label(slot.earned)} / 不足 {credits_label(slot.shortfall)}"
        )
        if slot.notes:
            line += f"({oneline(slot.notes)})"
        lines.append(line)
    slot_names = {slot.key: slot.name for slot in requirements.slots}
    track = next(
        (t.name for t in requirements.available_tracks if t.key == requirements.track),
        requirements.track,
    )
    for constraint in requirements.track_constraints:
        lines.append(
            f"- コース別下限({track}) {slot_names.get(constraint.slot, constraint.slot)}"
            f" / {constraint.track_group}: "
            f"必要 {constraint.required} / 修得 {credits_label(constraint.earned)} / "
            f"不足 {credits_label(constraint.shortfall)}"
        )
    return lines


def student_lines(ctx: StudentContext) -> list[str]:
    """【学生】の中身。課程・入学年度・対象学期とその時点の学年。"""
    curriculum = ctx.curriculum
    target = ctx.target
    return [
        f"課程: {curriculum.program.name}",
        f"入学年度: {curriculum.admission_year}年度",
        f"対象学期: {target.year}年度 {target.term}(この学期の時点で{target.grade}年次)",
    ]


def budget_lines(ctx: StudentContext) -> list[str]:
    """【登録できる単位】の中身。"""
    if ctx.budget is None:
        return ["履修登録の上限は履修要項に無い"]
    budget = ctx.budget
    if budget.per_year:
        return [
            f"対象学期に登録できる単位: {budget.remaining}"
            f"(4年次は年間の上限 {budget.cap} − この年度に登録済み {budget.registered})"
        ]
    return [
        f"対象学期に登録できる単位: {budget.remaining}"
        f"(上限 {budget.cap} − この学期に登録済み {budget.registered})"
    ]


def retake_lines(ctx: StudentContext) -> list[str]:
    """【再履修する必修】の中身。不合格・履修辞退のまま修得していない必修の科目。

    **必修でない不合格・履修辞退の科目は載せない。** 取り直すかは学生が決めることで、
    組み立ても学生が入れたいと言ったときだけ入れる。載せるとモデルが自分から
    「不合格でしたが再履修しますか」と持ち出す。
    """
    retakes = ctx.retakes()
    titles = dict.fromkeys(
        c.title
        for c in ctx.completed
        if c.status in ("failed", "withdrawn") and c.title and normalize_title(c.title) in retakes
    )
    lines = []
    for title in titles:
        course = ctx.course_by_title(title)
        if course is not None and student_type(course) == "必修":
            lines.append(f"- {title}(対象学期に履修できれば必ず入る)")
    return lines or ["なし"]
