"""時間割の組み立てで特別に扱う科目(§7.2.5)。

履修要項(`curricula/`)は公式の履修要項の転記であり、アプリの処理のための印を持たない
(§4.4.1)。原典の規定のうち組み立てが特別に扱う必要のあるものは、ここに表として持つ。
組み立ての動き(`builder.py`・`context.py`)と、モデルに渡す【特別な扱いの科目】の節
(`special_lines()`)は、どちらもこの表から作る。科目名や説明を別の場所に書かない。

| 扱い | 意味 |
|---|---|
| `must_register` | 配当年次に必ず履修登録する科目。配当年次・配当学期の組み立てで、成績表に行の無い学生には必修と同じように置く(必修ではない) |
| `ignore_class_grade` | クラスの配当年次(シラバスの `grade_min`〜`grade_max`)で絞らない。シラバスの配当年次が実際に履修できる年次より狭い科目に付ける |
"""

from dataclasses import dataclass
from typing import TYPE_CHECKING

from app.curricula.requirements import normalize_title

if TYPE_CHECKING:
    from app.timetable.context import StudentContext


@dataclass(frozen=True)
class SpecialCourse:
    """特別に扱う科目1件。`fact` はモデルに伝える科目ごとの事実(扱いの説明と別に、違いだけ)。"""

    title: str
    must_register: bool = False
    ignore_class_grade: bool = False
    fact: str | None = None


# 根拠(2026-11 時点):
# - フレッシャーズセミナー・理工学のすすめ: 先端理工学部の全課程・2023〜2026年度入学の履修要項の
#   注意事項「配当年次において必ず履修登録しなければなりません。ただし、必修科目ではありませんので、
#   不合格であった場合も再履修する必要はありません」
# - 理工学のすすめ: 2024年度入学までの履修要項は「1年次のみ履修可能」としていたが、冊子配付後の
#   変更点で削除された(2023年度以前入学は2025年3月・2024年度入学は2025年4月。Y2023henko20250306.pdf・
#   Y2024henko20250317.pdf)。2025年度入学は「1年次以降」。一方、2026年度シラバスの先端理工学部向けの
#   クラス(Y000004010)は配当年次が「1年次」だけで、そのまま絞ると2年次以降の再履修が入らない
SPECIAL_COURSES: tuple[SpecialCourse, ...] = (
    SpecialCourse(title="フレッシャーズセミナー", must_register=True),
    SpecialCourse(
        title="理工学のすすめ",
        must_register=True,
        ignore_class_grade=True,
        fact=(
            "不合格でも2年次以降に再履修できる。シラバスの配当年次は「1年次」と書かれているが、"
            "再履修では2年次以降も時間割に入れられる"
        ),
    ),
)

_BY_TITLE = {normalize_title(c.title): c for c in SPECIAL_COURSES}

# 配当年次に必ず履修登録する科目を置いたときの、時間割の科目の理由(`ProposedCourse.reason`)
MUST_REGISTER_REASON = "配当年次に必ず履修登録する科目"


def special_of(title: str) -> SpecialCourse | None:
    """その科目名の特別な扱い。無ければ None。"""
    return _BY_TITLE.get(normalize_title(title))


def must_register(title: str) -> bool:
    special = special_of(title)
    return special is not None and special.must_register


def ignore_class_grade(title: str) -> bool:
    special = special_of(title)
    return special is not None and special.ignore_class_grade


def class_grade_allows(title: str, grade: int | None, grade_min: int | None, grade_max: int | None) -> bool:
    """クラスの配当年次がその学年を含むか。学年・配当年次が分からないときと、
    `ignore_class_grade` の科目は含むとみなす(候補を失わない方に倒す)。"""
    if grade is None or grade_min is None or ignore_class_grade(title):
        return True
    return grade_min <= grade <= (grade_max if grade_max is not None else grade_min)


def _must_register_text(builds: bool) -> str:
    """配当年次に必ず履修登録する科目の扱いの説明。`builds` は時間割を組む画面か。"""
    feature = "時間割を組む機能" if builds else "時間割の画面の、時間割を組む機能"
    return (
        "配当年次に必ず履修登録する科目: 履修要項で、配当年次に必ず履修登録すると定められた科目。"
        "必修ではなく、不合格でも再履修する必要はない。"
        f"{feature}は、配当年次・配当学期にまだ成績の無い学生には必ず入れる。"
        "ただし、必修とコマが重なるときと、必修だけで組むときは入れない。学生が外すよう頼めば外す。"
    )


def special_lines(ctx: "StudentContext", *, builds: bool) -> list[str]:
    """【特別な扱いの科目】の中身。学生の履修要項にある科目だけを、配当年次・学期を添えて並べる。

    `builds` は時間割のアシスタントか(シラバスのチャットは時間割を組まないので、別の画面の
    機能として書く)。載せる科目が無ければ空。
    """
    lines: list[str] = []
    for special in SPECIAL_COURSES:
        if not special.must_register:
            continue
        course = ctx.course_by_title(special.title)
        if course is None:
            continue
        line = f"- {course.title}({course.grade}年{course.term})"
        if special.fact:
            line += f": {special.fact}"
        lines.append(line)
    if not lines:
        return []
    return [_must_register_text(builds), *lines]


def special_sections(ctx: "StudentContext", *, builds: bool) -> list[str]:
    """【特別な扱いの科目】の節。載せる科目が無ければ節ごと出さない。"""
    from app.timetable.facts import section

    lines = special_lines(ctx, builds=builds)
    return [section("特別な扱いの科目", lines)] if lines else []
