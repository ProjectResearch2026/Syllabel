"""シラバスを探すツール(`search_courses` / `get_course`)。design.md §7.4。

時間割のアシスタントとシラバスチャットの両方が使う。api-clean を引く関数
(`app/agents/tools.py`)の上に、**Qwen が引きやすい形**の口を置く。

- **引数は少なく、値は列挙で縛る。** 曜日・時限・学期・区分・分野・履修区分は
  `Literal` / 範囲つきの `int` にし、JSON Schema の `enum` / `minimum` / `maximum` として
  モデルに見せる
- **名称の完全一致を求める引数を見せない。** 学部は対象学部(`settings.target_faculty`)、
  開講年度は `settings.offering_year` に固定する
- **返り値は小さく、決まった形にする。** 科目ごとに1件とし、シラバスコード・曜日時限の
  表記・単位を、モデルが写すだけで済む形で返す
- **0件のときは理由を返す。** どの条件を外せば何件になるかを添える
- **失敗を例外にせず、結果として返す**(例外にすると応答全体が落ちる)

学生の文脈(`StudentContext`)があれば、その学生にとっての区分・履修区分・単位が入る
要件枠・履修できるか・修得済みかを付ける(シラバス一覧のタグ §8.2.1 と同じ判定)。
api-clean へ送るのは検索条件だけで、学生プロファイルは送らない(§6.2)。
"""

import json
import logging
import re
import time
from collections.abc import Sequence
from typing import Annotated, Literal

import httpx
from pydantic import Field
from pydantic_ai import RunContext

from app.agents.title_search import matches_title
from app.agents.tools import get_healthz, get_syllabus, search_syllabi_by_instructor
from app.curricula.merge import MergedCourse
from app.curricula.requirements import judge, normalize_title
from app.schemas.student import Course as StudentCourse
from app.settings import get_settings
from app.timetable.candidates import student_type
from app.timetable.context import StudentContext, slots_label
from app.timetable.offerings import (
    Catalog,
    OfferedClass,
    class_order,
    fetch_rows,
    get_catalog,
    registration_half,
    to_slot,
)

logger = logging.getLogger(__name__)

DayArg = Literal["月", "火", "水", "木", "金", "土"]
TermArg = Literal["前期", "後期"]
CategoryArg = Literal["教養教育", "専門基礎", "専門応用", "専門関連"]
SubcategoryArg = Literal[
    "仏教の思想",
    "必修外国語",
    "選択外国語",
    "人文科学系",
    "社会科学系",
    "自然科学系",
    "スポーツ科学系",
    "教養教育科目特別講義",
    "学部・センター等提供",
]
CourseTypeArg = Literal["必修", "選択必修", "選択", "随意"]
SectionArg = Literal[
    "概要",
    "到達目標",
    "講義方法",
    "授業計画",
    "成績評価",
    "教科書",
    "参考文献",
    "授業外学修",
    "アドバイス",
    "担当教員",
    "備考",
]

# 表示名(frontend の `lib/courseLabels.ts` と同じ)と履修要項の表記の対応
CATEGORY_LABEL = {
    "教養教育科目": "教養教育",
    "専門基礎科目": "専門基礎",
    "専門応用科目": "専門応用",
    "専門関連科目": "専門関連",
}
SUBCATEGORY_LABEL = {
    "「仏教の思想」科目": "仏教の思想",
    "必修外国語科目": "必修外国語",
    "選択外国語科目": "選択外国語",
    "人文科学系科目": "人文科学系",
    "社会科学系科目": "社会科学系",
    "自然科学系科目": "自然科学系",
    "スポーツ科学系科目": "スポーツ科学系",
    "教養教育科目特別講義": "教養教育科目特別講義",
    "学部・センター等提供科目": "学部・センター等提供",
}

# 本文の検索(`text`)が入った api-clean の版
TEXT_SEARCH_VERSION = (0, 4, 0)
# 版の確認を置いておく秒数。api-clean の差し替えは稀だが、反映後に気づけるよう短めにする
_VERSION_TTL = 300.0
_version_cache: tuple[bool, float] | None = None

# 1科目の返り値に載せるクラスの数(同名の別クラス)
_MAX_CLASSES = 3
# get_course の1節あたりの上限の文字数。講義概要は9割が430字以内に収まる
_MAX_SECTION_CHARS = 1200
DEFAULT_SECTIONS: tuple[SectionArg, ...] = ("概要", "到達目標", "成績評価")


def _version_tuple(text: str) -> tuple[int, ...]:
    return tuple(int(x) for x in re.findall(r"\d+", text)[:3])


async def api_clean_supports_text() -> bool:
    """api-clean が本文の検索(`text`)を持つか。`/healthz` の版で判定する(§6.2)。

    古い api-clean は未知の `text` を黙って無視して全件を返すため、版を確かめずに送ると
    「内容に合う科目」として全件を見せてしまう。確かめられなければ持たないとみなす。
    """
    global _version_cache
    now = time.monotonic()
    if _version_cache is not None and _version_cache[1] > now:
        return _version_cache[0]
    try:
        version = (await get_healthz()).get("version")
        supported = isinstance(version, str) and _version_tuple(version) >= TEXT_SEARCH_VERSION
    except Exception:  # noqa: BLE001 - 版が分からなければ持たないとみなす
        supported = False
    _version_cache = (supported, now + _VERSION_TTL)
    return supported


def clear_version_cache() -> None:
    """版の確認の置き場を空にする(テスト用)。"""
    global _version_cache
    _version_cache = None


# --- 注記 ---


def course_type_label(course: MergedCourse) -> str:
    """「専門応用 › 選択」「人文科学系 › 選択必修」の形。教養教育科目は分野を出す。"""
    head = (
        SUBCATEGORY_LABEL.get(course.subcategory or "", course.subcategory or "教養教育")
        if course.category == "教養教育科目"
        else CATEGORY_LABEL.get(course.category, course.category)
    )
    if not course.own:
        return "専門関連"
    return f"{head} › {student_type(course)}"


def fills_slot(ctx: StudentContext, course: MergedCourse) -> str:
    """その学生がこの科目を修得したら、単位が入る要件枠(§7.2)。"""
    before = {s.key: s.earned for s in ctx.requirements.slots}
    added = StudentCourse(
        title=course.title, year=9999, term="前期", credits=course.credits, status="passed"
    )
    after = judge(ctx.curriculum, [*ctx.completed, added], track=ctx.track)
    gained = [(s.name, s.earned - before[s.key]) for s in after.slots if s.earned > before[s.key]]
    if not gained:
        return "なし(受け入れる要件枠はすでに満たしている)"
    if len(gained) == 1:
        return gained[0][0]
    return "・".join(f"{name} {amount}単位" for name, amount in gained)


def _status(ctx: StudentContext, title: str) -> str | None:
    key = normalize_title(title)
    if key in ctx.passed():
        return "修得済み"
    if key in ctx.registered():
        return "登録済み(成績発表待ち)"
    if key in ctx.retakes():
        return "不合格・履修辞退(再履修の対象)"
    return None


def _when(offered: OfferedClass) -> str:
    return slots_label(list(offered.slots), offered.term)


def annotate(
    ctx: StudentContext | None, code: str, title: str
) -> dict[str, object]:
    """学生にとっての区分・入る要件枠・履修できるか・履修状態(§8.2.1 と同じ判定)。

    履修できないクラスには区分を付けない(履修できないクラスに「必修」と出すと、
    登録できない授業へ誘導することになる)。修得済みの科目だけは履修できるかを問わない。
    """
    if ctx is None:
        return {}
    course = ctx.course_of_code(code) or ctx.course_by_title(title)
    registrable = ctx.eligibility.allows(code)
    status = _status(ctx, title)
    out: dict[str, object] = {"registrable": registrable}
    if status is not None:
        out["status"] = status
    if course is None:
        out["type"] = "履修要項に無い科目(卒業要件に算入されない)"
        return out
    if registrable or status == "修得済み":
        out["type"] = course_type_label(course)
    if status not in ("修得済み", "登録済み(成績発表待ち)") and registrable:
        out["fillsSlot"] = fills_slot(ctx, course)
    return out


# --- search_courses ---


async def _topic_matches(topic: str, year: int, faculty: str) -> dict[str, list[str]] | None:
    """本文の検索。シラバスコード → 当たった項目。api-clean が持たなければ None。"""
    if not await api_clean_supports_text():
        return None
    rows = await fetch_rows(year=year, text=topic, faculty=faculty)
    return {
        str(row.get("syllabus_code")): list(row.get("text_matched") or [])
        for row in rows
        if row.get("syllabus_code")
    }


async def _instructor_codes(instructor: str, year: int, faculty: str) -> set[str]:
    payload = await search_syllabi_by_instructor(
        instructor, year=year, faculty=faculty, limit=500, offset=0
    )
    return {str(r.get("syllabus_code")) for r in payload.get("results") or [] if r.get("syllabus_code")}


def _matches_slot(offered: OfferedClass, day: str | None, period: int | None) -> bool:
    if day is None and period is None:
        return True
    return any(
        (day is None or s.day == day) and (period is None or s.period == period)
        for s in offered.slots
    )


async def search_courses(
    ctx: StudentContext | None,
    *,
    keyword: str | None = None,
    topic: str | None = None,
    instructor: str | None = None,
    day: DayArg | None = None,
    period: int | None = None,
    term: TermArg | None = None,
    category: CategoryArg | None = None,
    subcategory: SubcategoryArg | None = None,
    course_type: CourseTypeArg | None = None,
    only_registrable: bool = True,
    include_taken: bool = False,
    limit: int = 10,
    catalog: Catalog | None = None,
) -> dict:
    """シラバスを探す(本書の説明を参照)。科目ごとに1件で返す。

    Returns:
        `{"total", "shown", "courses": [...], "hint"}`。失敗したときは `{"error": ...}`。
    """
    settings = get_settings()
    limit = max(1, min(20, limit))
    keyword = (keyword or "").strip() or None
    topic = (topic or "").strip() or None
    instructor = (instructor or "").strip() or None
    try:
        catalog = catalog or (ctx.catalog if ctx is not None else await get_catalog())
        matched_in: dict[str, list[str]] | None = None
        if topic is not None:
            matched_in = await _topic_matches(topic, catalog.year, settings.target_faculty)
            if matched_in is None:
                return {
                    "error": "講義の内容での検索(topic)は、シラバスのサーバが対応していないため使えない。"
                    "科目名(keyword)で探す"
                }
        by_instructor = (
            await _instructor_codes(instructor, catalog.year, settings.target_faculty)
            if instructor is not None
            else None
        )
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("シラバスの検索に失敗しました: %s", type(exc).__name__)
        return {"error": "シラバスのサーバに届かなかった。時間をおいて試す"}

    notes: list[str] = []
    if ctx is None and (category or subcategory or course_type):
        notes.append("学生の情報が無いため、区分・分野・履修区分では絞っていない")

    def course_of(code: str, title: str) -> MergedCourse | None:
        if ctx is None:
            return None
        return ctx.course_of_code(code) or ctx.course_by_title(title)

    # 条件ごとの判定。0件のときに「どの条件を外せば何件か」を数えるため、条件を名前つきで持つ
    def filters_for(offered: OfferedClass) -> dict[str, bool]:
        code = offered.syllabus_code
        course = course_of(code, offered.course_title)
        checks: dict[str, bool] = {}
        if keyword is not None:
            checks["keyword"] = matches_title(offered.course_title, keyword)
        if matched_in is not None:
            checks["topic"] = code in matched_in
        if by_instructor is not None:
            checks["instructor"] = code in by_instructor
        if day is not None or period is not None:
            checks["day/period"] = _matches_slot(offered, day, period)
        if term is not None:
            checks["term"] = registration_half(offered.term) in (term, None)
        if ctx is not None:
            if category is not None:
                checks["category"] = course is not None and (
                    "専門関連" if not course.own else CATEGORY_LABEL.get(course.category)
                ) == category
            if subcategory is not None:
                checks["subcategory"] = (
                    course is not None
                    and SUBCATEGORY_LABEL.get(course.subcategory or "") == subcategory
                )
            if course_type is not None:
                checks["course_type"] = course is not None and student_type(course) == course_type
            if only_registrable:
                checks["only_registrable"] = ctx.eligibility.allows(code)
            if not include_taken:
                checks["include_taken"] = normalize_title(offered.course_title) not in ctx.passed()
        return checks

    pool = [
        offered
        for code, offered in catalog.classes.items()
        if not catalog.faculty_codes or code in catalog.faculty_codes
    ]
    evaluated = [(offered, filters_for(offered)) for offered in pool]
    hits = [offered for offered, checks in evaluated if all(checks.values())]

    # 科目名ごとに寄せる(同名の別クラスはまとめて返す)
    grouped: dict[str, list[OfferedClass]] = {}
    for offered in hits:
        grouped.setdefault(normalize_title(offered.course_title), []).append(offered)

    def order(classes: list[OfferedClass]) -> tuple:
        first = classes[0]
        fields = len(matched_in.get(first.syllabus_code, [])) if matched_in is not None else 0
        return (-fields, first.course_title)

    groups = sorted(grouped.values(), key=order)
    courses: list[dict] = []
    for classes in groups[:limit]:
        classes = sorted(
            classes, key=class_order
        )
        first = classes[0]
        entry: dict[str, object] = {
            "code": first.syllabus_code,
            "title": first.course_title,
            "when": _when(first),
            "credits": first.credits,
        }
        if first.subtitle:
            entry["subtitle"] = first.subtitle
        entry.update(annotate(ctx, first.syllabus_code, first.course_title))
        if matched_in is not None:
            entry["matchedIn"] = matched_in.get(first.syllabus_code, [])
        if len(classes) > 1:
            entry["otherClasses"] = [
                {"code": c.syllabus_code, "when": _when(c)} for c in classes[1:_MAX_CLASSES]
            ]
            if len(classes) > _MAX_CLASSES:
                entry["moreClasses"] = len(classes) - _MAX_CLASSES
        courses.append(entry)

    result: dict[str, object] = {"total": len(groups), "shown": len(courses), "courses": courses}
    if not courses:
        result["hint"] = _hint(evaluated) or "条件を変えて探す"
    if notes:
        result["note"] = "。".join(notes)
    return result


_FILTER_LABEL = {
    "keyword": "keyword",
    "topic": "topic",
    "instructor": "instructor",
    "day/period": "day・period",
    "term": "term",
    "category": "category",
    "subcategory": "subcategory",
    "course_type": "course_type",
    "only_registrable": "only_registrable",
    "include_taken": "include_taken",
}


def _hint(evaluated: Sequence[tuple[OfferedClass, dict[str, bool]]]) -> str | None:
    """0件のとき、条件を1つ外すと何科目になるか。"""
    names = {name for _, checks in evaluated for name in checks}
    parts = []
    for name in sorted(names, key=list(_FILTER_LABEL).index):
        titles = {
            normalize_title(offered.course_title)
            for offered, checks in evaluated
            if all(v for k, v in checks.items() if k != name)
        }
        if titles:
            label = _FILTER_LABEL[name]
            if name == "only_registrable":
                parts.append(f"only_registrable を false にすると {len(titles)} 科目")
            elif name == "include_taken":
                parts.append(f"include_taken を true にすると {len(titles)} 科目")
            else:
                parts.append(f"{label} を外すと {len(titles)} 科目")
    return "、".join(parts) if parts else None


# --- get_course ---


def _clip(text: str | None) -> str | None:
    if text is None:
        return None
    text = text.strip()
    if not text:
        return None
    if len(text) > _MAX_SECTION_CHARS:
        return text[:_MAX_SECTION_CHARS] + "…(以下略)"
    return text


def grading_text(raw: str | None) -> str | None:
    """成績評価を「平常点 25%(授業内Quiz)」の行にする(frontend の `parseGrading()` と同じ規則)。

    api-clean の `grading` は TEXT 列だが中身は JSON 文字列である(§6.2)。JSON として
    読めない値はそのまま返す。
    """
    source = (raw or "").strip()
    if not source:
        return None
    if not source.startswith("{"):
        return source
    try:
        document = json.loads(source)
    except ValueError:
        return source
    if not isinstance(document, dict):
        return source
    lines: list[str] = []
    for item in document.get("評価項目") or []:
        if not isinstance(item, dict):
            if isinstance(item, str) and item.strip():
                lines.append(item.strip())
            continue
        label = str(item.get("項目") or "").strip() or "評価項目"
        ratio = item.get("割合")
        ratio_text = ""
        if isinstance(ratio, (int, float)) and not isinstance(ratio, bool):
            ratio_text = f" {int(ratio) if float(ratio).is_integer() else ratio}%"
        elif isinstance(ratio, str) and (found := re.search(r"\d+(?:\.\d+)?", ratio)):
            ratio_text = f" {found.group(0)}%"
        criterion = str(item.get("基準") or "").strip()
        note = str(item.get("備考") or "").strip()
        extra = "・".join(x for x in (criterion, note) if x)
        lines.append(f"{label}{ratio_text}" + (f"({extra})" if extra else ""))
    free = str(document.get("自由記載") or "").strip()
    if free:
        lines.append(free)
    return "\n".join(lines) or None


def _books(detail: dict, role: str, note_key: str) -> str | None:
    lines = []
    for book in detail.get("textbooks") or []:
        if not isinstance(book, dict) or book.get("role") != role:
            continue
        title = str(book.get("title") or "").strip()
        if not title:
            continue
        who = "・".join(x for x in (book.get("author"), book.get("publisher")) if x)
        lines.append(f"{title}" + (f"({who})" if who else ""))
    note = str(detail.get(note_key) or "").strip()
    if note:
        lines.append(note)
    return "\n".join(lines) or None


def _plan(detail: dict) -> str | None:
    lines = []
    for item in detail.get("course_plan") or []:
        if not isinstance(item, dict):
            continue
        content = " ".join(str(item.get("content") or "").split())
        if content:
            lines.append(f"第{item.get('session_number')}回: {content}")
    return "\n".join(lines) or None


def _instructors(detail: dict) -> str | None:
    names = [
        str(i.get("kanji_name") or "").strip()
        for i in detail.get("instructors") or []
        if isinstance(i, dict) and i.get("kanji_name")
    ]
    return "、".join(dict.fromkeys(names)) or None


def format_sections(detail: dict, sections: Sequence[str]) -> dict[str, str]:
    """シラバスの詳細から、頼まれた節だけを読める形で取り出す。中身の無い節は載せない。"""
    readers = {
        "概要": lambda: detail.get("summary"),
        "到達目標": lambda: detail.get("goals"),
        "講義方法": lambda: detail.get("methods"),
        "授業計画": lambda: _plan(detail),
        "成績評価": lambda: grading_text(detail.get("grading")),
        "教科書": lambda: _books(detail, "main", "textbook_note"),
        "参考文献": lambda: _books(detail, "reference", "reference_note"),
        "授業外学修": lambda: detail.get("outside_study"),
        "アドバイス": lambda: detail.get("advice"),
        "担当教員": lambda: _instructors(detail),
        "備考": lambda: detail.get("note"),
    }
    out: dict[str, str] = {}
    for name in dict.fromkeys(sections):
        reader = readers.get(name)
        if reader is None:
            continue
        text = _clip(reader())
        if text:
            out[name] = text
    return out


def course_header(detail: dict) -> dict[str, object]:
    """シラバスの詳細の見出し(コード・科目名・曜日時限・単位など)。"""
    offered = OfferedClass(
        syllabus_code=str(detail.get("syllabus_code") or ""),
        course_title=str(detail.get("course_title") or ""),
        term=detail.get("term_name") or None,
        slots=tuple(
            s
            for s in (
                _slot_of(item) for item in (detail.get("slots") or []) if isinstance(item, dict)
            )
            if s is not None
        ),
    )
    header: dict[str, object] = {
        "code": offered.syllabus_code,
        "title": offered.course_title,
        "when": _when(offered),
        "credits": detail.get("credits"),
    }
    if detail.get("subtitle"):
        header["subtitle"] = detail.get("subtitle")
    grade_min, grade_max = detail.get("grade_min"), detail.get("grade_max")
    if grade_min:
        header["grades"] = f"{grade_min}〜{grade_max or grade_min}年次"
    if detail.get("campus_name"):
        header["campus"] = detail.get("campus_name")
    return header


def _slot_of(item: dict):
    return to_slot(item.get("term"), item.get("day"), item.get("period"))


async def get_course(
    ctx: StudentContext | None,
    code: str,
    sections: Sequence[SectionArg] = DEFAULT_SECTIONS,
) -> dict:
    """1科目のシラバスの、頼まれた節だけを返す。見つからなければ `{"error": ...}`。"""
    code = code.strip()
    try:
        detail = await get_syllabus(code)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            return {"error": f"シラバスコード {code} は見つからない。search_courses で探し直す"}
        return {"error": "シラバスのサーバに届かなかった。時間をおいて試す"}
    except httpx.HTTPError:
        return {"error": "シラバスのサーバに届かなかった。時間をおいて試す"}
    result = course_header(detail)
    result.update(annotate(ctx, code, str(detail.get("course_title") or "")))
    result["sections"] = format_sections(detail, sections or DEFAULT_SECTIONS)
    return result


# --- エージェントへの登録 ---


def register_course_tools(agent) -> None:
    """`search_courses` / `get_course` をエージェントのツールにする。

    エージェントの依存(`deps`)は `student` 属性(`StudentContext` か None)を持つこと。
    ツールの説明文(docstring)と引数の型がそのままモデルへの説明になる。
    """
    @agent.tool(name="search_courses")
    async def search_courses_tool(
        ctx: RunContext,
        keyword: str | None = None,
        topic: str | None = None,
        instructor: str | None = None,
        day: DayArg | None = None,
        period: Annotated[int, Field(ge=1, le=7)] | None = None,
        term: TermArg | None = None,
        category: CategoryArg | None = None,
        subcategory: SubcategoryArg | None = None,
        course_type: CourseTypeArg | None = None,
        only_registrable: bool = True,
        include_taken: bool = False,
        limit: Annotated[int, Field(ge=1, le=20)] = 10,
    ) -> dict:
        """先端理工学部の今年度のシラバスから科目を探す。条件はすべて AND。

        Args:
            keyword: 科目名の一部(例: 「線形代数」)。全角・半角やⅠと1の違いは吸収する。
            topic: 講義の内容に含まれる語(例: 「機械学習」「プログラミング」)。講義概要・
                到達目標・授業計画を探す。空白で区切ると AND。興味から探すときに使う。
            instructor: 担当教員の名前(姓だけでもよい)。
            day: 曜日。
            period: 時限(1〜7)。
            term: 履修登録する学期。1Q・2Q は前期、3Q・4Q は後期に含む。
            category: 区分。
            subcategory: 教養教育科目の分野。
            course_type: 学生にとっての履修区分。
            only_registrable: 学生が履修登録できるクラスだけにする。
            include_taken: 修得済みの科目も含める。
            limit: 返す科目の数(1〜20)。

        Returns:
            total(当たった科目数)・courses(code・title・when(学期と曜日時限)・credits・
            type(区分 › 履修区分)・fillsSlot(修得したら単位が入る要件枠)・status・
            matchedIn(topic が当たった項目))。0件なら hint にどの条件を外せば何科目かを書く。
        """
        return await search_courses(
            ctx.deps.student,
            keyword=keyword,
            topic=topic,
            instructor=instructor,
            day=day,
            period=period,
            term=term,
            category=category,
            subcategory=subcategory,
            course_type=course_type,
            only_registrable=only_registrable,
            include_taken=include_taken,
            limit=limit,
        )

    @agent.tool(name="get_course")
    async def get_course_tool(
        ctx: RunContext,
        code: str,
        sections: list[SectionArg] | None = None,
    ) -> dict:
        """1科目のシラバスを読む。頼んだ節だけを返す。

        Args:
            code: シラバスコード(search_courses の code。例: G260620069)。
            sections: 読む節。省略すると 概要・到達目標・成績評価。

        Returns:
            title・when・credits・type・fillsSlot と、sections(節の名前 → 本文)。
        """
        return await get_course(ctx.deps.student, code, sections or DEFAULT_SECTIONS)
