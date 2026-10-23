"""プロンプトに載せる事実の節。値は backend が計算し、モデルには数えさせない(§7.2)。"""

from collections.abc import Sequence

from app.curricula.requirements import RequirementsResult, normalize_title
from app.timetable.candidates import oneline
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
        f"残り: {credits_label(requirements.remaining_credits)}",
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
    for constraint in requirements.track_constraints:
        lines.append(
            f"- コース別下限 {slot_names.get(constraint.slot, constraint.slot)}"
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
    return [
        f"対象学期に登録できる単位: {budget.remaining}"
        f"(上限 {budget.cap} − この学期に登録済み {budget.registered})"
    ]


def retake_lines(ctx: StudentContext) -> list[str]:
    """【未修得の科目】の中身。不合格・履修辞退のまま修得していない科目(再履修の対象)。"""
    names = [
        c.title
        for c in ctx.completed
        if c.status in ("failed", "withdrawn") and c.title and normalize_title(c.title) in ctx.retakes()
    ]
    return ["、".join(dict.fromkeys(names))] if names else ["なし"]
