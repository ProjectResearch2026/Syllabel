"""開講年度ぶんの開講クラス・対象課程・対象学部(§6.1・§6.2・§7.2)。

時間割の組み立てとシラバスの検索ツールは、どちらも「その年度に開講されるクラスの
曜日・時限」と「そのクラスを誰が履修登録できるか」を要る。api-clean はどちらも
1件ずつの詳細でしか持たない値を一覧で返さないため、**年度ぶんを一括で引いて
期限つきで手元に置く**(`get_catalog()`)。値は学生データを含まない公開のシラバスで
あり、2026年度は 1,512 件と小さい。

## 履修可否(§6.1)

**履修要項は「科目」の単位で書かれており、その学生がその開講クラスを履修登録
できるかを持たない。** 判定の正本はシラバス側の対象課程であり、規則は frontend の
タグ表示と共通で次の3分岐である。

- 対象課程に学生の課程が入っている → 履修可
- 対象課程が空で、対象学部に先端理工学部が入る → 課程指定なし。履修可
- それ以外 → 他課程指定のクラス。履修不可

**api-clean の一覧は対象課程を返さない。** 1科目に複数の課程が対応するため
`SELECT DISTINCT` から外されており、対象課程は `GET /syllabi/{code}` にしかない
(§6.2)。**課程名で絞った一覧を課程ごとに引いて集合演算で判定する。** api-clean の
`program` は `cp.name = %s` の完全一致であり、対象課程を持たないシラバスは絞り込みから
落ちる。したがって「どの課程の結果にも現れないコード」が課程指定なしのコードである。

## 登録する学期(§7.2)

時間割は1つの学期(次に履修登録する学期)に対して組む。前期の登録では前期・1Q・2Q・
通年・サ集(夏期集中)、後期の登録では後期・3Q・4Q のクラスを登録する
(`registration_half()`)。
"""

import asyncio
import logging
import time
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass

from app.agents.tools import get_masters, search_syllabi
from app.curricula.merge import MergedCurriculum
from app.schemas.proposal import CourseSlot, HalfTerm
from app.settings import get_settings

logger = logging.getLogger(__name__)

# api-clean の `GET /syllabi` を一括取得するときの1ページあたりの件数(api-clean の
# `MAX_ROWS`)と、辿るページ数の上限
PAGE_SIZE = 500
MAX_PAGES = 40

DAYS = ("月", "火", "水", "木", "金", "土")
WEEKDAYS = ("月", "火", "水", "木", "金")


@dataclass(frozen=True)
class OfferedClass:
    """api-clean の `GET /syllabi` が返す開講クラス1件のうち、時間割と検索に要る値(§6.2)。

    `term` / `day_of_week` / `period` は1コマ目、`slots` は全コマ(`_read_slots()`)。
    """

    syllabus_code: str
    course_title: str
    term: str | None = None
    day_of_week: str | None = None
    period: int | None = None
    room: str | None = None
    slots: tuple[CourseSlot, ...] = ()
    credits: int | None = None
    subtitle: str | None = None
    grade_min: int | None = None
    grade_max: int | None = None


def to_int(value: object) -> int | None:
    """api-clean の値を int にする。欠測・数値でない値は None にする。"""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return None


def to_str(value: object) -> str | None:
    """api-clean の値を文字列にする。空文字は欠測として None にする。"""
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def to_slot(term: object, day: object, period: object) -> CourseSlot | None:
    """学期・曜日・時限を `CourseSlot` にする。曜日か時限が読めなければ None。"""
    day_text = to_str(day)
    period_number = to_int(period)
    if day_text not in DAYS or period_number is None:
        return None
    return CourseSlot(term=to_str(term), day=day_text, period=period_number)


def read_slots(row: dict) -> tuple[CourseSlot, ...]:
    """`GET /syllabi` の1件から開講コマを全部読む(§6.2)。

    api-clean 0.3.0 以降は `slots`(原文の全コマ)を返す。「後期　金4・金5」の金5 や
    「3Q　金3、4Q　金3」の 4Q は `day_of_week` / `period` / `term`(1コマ目)には無い。
    `slots` を返さない api-clean(0.2.0 以前)では、1コマ目だけを使う。
    """
    raw = row.get("slots")
    if raw is None:
        first = to_slot(row.get("term"), row.get("day_of_week"), row.get("period"))
        return (first,) if first else ()
    slots: list[CourseSlot] = []
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        slot = to_slot(item.get("term"), item.get("day"), item.get("period"))
        if slot is not None and slot not in slots:
            slots.append(slot)
    return tuple(slots)


def class_order(offered: "OfferedClass") -> tuple:
    """クラスの並び。曜日(月→土)・時限・コードの順で、曜日・時限の無いクラスは末尾。"""
    day = DAYS.index(offered.day_of_week) if offered.day_of_week in DAYS else len(DAYS)
    return (day, offered.period or 99, offered.syllabus_code)


def to_offered_class(row: dict) -> OfferedClass | None:
    """`GET /syllabi` の1件を `OfferedClass` にする。コードが無い行は捨てる。"""
    code = to_str(row.get("syllabus_code"))
    if code is None:
        return None
    return OfferedClass(
        syllabus_code=code,
        course_title=to_str(row.get("course_title")) or "",
        term=to_str(row.get("term")),
        day_of_week=to_str(row.get("day_of_week")),
        period=to_int(row.get("period")),
        room=to_str(row.get("room")),
        slots=read_slots(row),
        credits=to_int(row.get("credits")),
        subtitle=to_str(row.get("subtitle")),
        grade_min=to_int(row.get("grade_min")),
        grade_max=to_int(row.get("grade_max")),
    )


async def fetch_rows(
    *, year: int, page_size: int = PAGE_SIZE, max_pages: int = MAX_PAGES, **filters
) -> list[dict]:
    """`GET /syllabi` を条件つきでページ送りして全件を引く。

    返却件数が `limit` に満たなくなった時点で打ち切る。`count` は総件数ではなく
    そのページで返した件数である(§6.2)。
    """
    rows: list[dict] = []
    for page in range(max_pages):
        payload = await search_syllabi(
            year=year, limit=page_size, offset=page * page_size, **filters
        )
        batch = payload.get("results") or []
        rows += batch
        if len(batch) < page_size:
            break
    else:
        logger.warning("api-clean のページ上限に達しました: %d件", len(rows))
    return rows


@dataclass(frozen=True)
class Eligibility:
    """その学生が履修登録できる開講クラスの判定(§6.1)。

    `mine` は学生の課程が対象課程に入っているコード、`any_program` は**いずれかの
    課程**が対象課程に入っているコードである。api-clean の `program` 絞り込みは
    対象課程を持たないシラバスを落とすため、`any_program` に居ないコードが
    「課程指定なし」であり、学部の科目として履修できる。
    """

    mine: frozenset[str]
    any_program: frozenset[str]

    def allows(self, code: str) -> bool:
        """そのコードのクラスを履修登録できるか。"""
        return code in self.mine or code not in self.any_program


def program_names_of(curriculum: MergedCurriculum) -> set[str]:
    """学生の課程を指す名称の集合。改称前後の両方を含む(§4.4.2)。

    課程コード `06` は入学年度で名称が異なり(環境生態工学課程 / 環境科学課程)、
    api-clean は**両方を別々の課程として持つ**ため、片方だけで比べると
    履修可否を取り違える。別名は課程ファイルの `program.name_aliases` が持つ。
    """
    return {curriculum.program.name, *curriculum.program.name_aliases}


@dataclass(frozen=True)
class Catalog:
    """開講年度ぶんの開講クラスと、対象課程・対象学部ごとのコード(§6.1・§6.2)。

    `program_codes` は `GET /masters` の課程名ごとのコード、`programs_known` は課程名の
    一覧を引けたかである。引けなかったときは学生の課程だけを引き、判定は「学生の課程に
    入っているか」だけに退化する(`eligibility()`)。`faculty_codes` は対象学部
    (`settings.target_faculty`)のクラスのコードで、検索のツールが他学部の科目を返さない
    ために使う。
    """

    year: int
    classes: dict[str, OfferedClass]
    program_codes: dict[str, frozenset[str]]
    programs_known: bool
    faculty_codes: frozenset[str]

    def eligibility(self, curriculum: MergedCurriculum) -> Eligibility:
        """その学生の課程について、履修登録できるクラスの判定を作る。

        課程名の一覧が引けなかったときは、学生の課程だけを `any_program` とする。
        **課程指定なしの科目も履修可と扱われる**(絞り込みすぎて候補を失うより、
        従来どおりの振る舞いに倒す)。
        """
        names = program_names_of(curriculum)
        mine: set[str] = set()
        for name in names:
            mine |= self.program_codes.get(name, frozenset())
        if not self.programs_known:
            return Eligibility(mine=frozenset(mine), any_program=frozenset(mine))
        any_program: set[str] = set()
        for codes in self.program_codes.values():
            any_program |= codes
        return Eligibility(mine=frozenset(mine), any_program=frozenset(any_program))


async def fetch_catalog(
    year: int,
    *,
    program_names: Sequence[str] | None = None,
    fallback_names: Sequence[str] = (),
    faculty: str | None = None,
) -> Catalog:
    """開講年度ぶんの開講クラス・課程ごとのコード・対象学部のコードを引く。

    課程名の一覧は `GET /masters` の `course_program` から採る(検索画面の絞り込みと
    同じ出所)。取れなかったときは `fallback_names`(学生の課程の名称)だけを引き、
    課程の一覧を持たない `Catalog`(`programs_known` が偽)を返す。

    Args:
        program_names: 課程名の一覧。省略時は `/masters` から引く(テスト用の口)。
        fallback_names: 課程名の一覧が引けなかったときに引く課程名。
        faculty: 対象学部。省略時は `settings.target_faculty`。
    """
    settings = get_settings()
    faculty = faculty or settings.target_faculty

    classes: dict[str, OfferedClass] = {}
    for row in await fetch_rows(year=year):
        offered = to_offered_class(row)
        if offered is not None:
            classes.setdefault(offered.syllabus_code, offered)

    programs_known = True
    if program_names is None:
        try:
            masters = await get_masters()
            program_names = [
                name
                for item in (masters.get("course_program") or [])
                if (name := to_str(item.get("name"))) is not None
            ]
        except Exception:  # noqa: BLE001 - 候補を失わないため既定の振る舞いへ倒す
            logger.warning("課程一覧を引けませんでした。履修可否は学生の課程のみで判定します")
            program_names = []
    if not program_names:
        programs_known = False
        program_names = list(fallback_names)

    program_codes: dict[str, frozenset[str]] = {}
    for name in program_names:
        rows = await fetch_rows(year=year, program=name)
        program_codes[name] = frozenset(
            code for row in rows if (code := to_str(row.get("syllabus_code"))) is not None
        )

    faculty_rows = await fetch_rows(year=year, faculty=faculty)
    faculty_codes = frozenset(
        code for row in faculty_rows if (code := to_str(row.get("syllabus_code"))) is not None
    )

    logger.info(
        "開講年度ぶんの開講情報を引きました: %d件 / 課程 %d / 対象学部 %d件",
        len(classes),
        len(program_codes),
        len(faculty_codes),
    )
    return Catalog(
        year=year,
        classes=classes,
        program_codes=program_codes,
        programs_known=programs_known,
        faculty_codes=faculty_codes,
    )


# 開講年度 → (Catalog, 期限)。値は公開のシラバスだけで、学生データを含まない
_CACHE: dict[int, tuple[Catalog, float]] = {}
_LOCK = asyncio.Lock()


async def get_catalog(
    year: int | None = None, *, curriculum: MergedCurriculum | None = None
) -> Catalog:
    """開講年度ぶんの `Catalog` を、期限つきの置き場から返す(§7.2)。

    期限(`settings.catalog_ttl_seconds`)が切れていれば引き直す。同時に来た要求は
    1回の取得を待ち合わせる。課程の一覧が引けなかった `Catalog`(`programs_known`
    が偽)は置かず、次の要求で引き直す。

    Args:
        curriculum: 課程名の一覧が引けなかったときに、学生の課程のコードだけは
            引くための履修要項。
    """
    settings = get_settings()
    year = year if year is not None else settings.offering_year
    now = time.monotonic()
    cached = _CACHE.get(year)
    if cached is not None and cached[1] > now:
        return cached[0]
    async with _LOCK:
        cached = _CACHE.get(year)
        if cached is not None and cached[1] > time.monotonic():
            return cached[0]
        fallback = sorted(program_names_of(curriculum)) if curriculum is not None else ()
        catalog = await fetch_catalog(year, fallback_names=fallback)
        if catalog.programs_known:
            _CACHE[year] = (catalog, time.monotonic() + settings.catalog_ttl_seconds)
        return catalog


def clear_catalog_cache() -> None:
    """置き場を空にする(テスト用)。"""
    _CACHE.clear()


# 開講学期 → そのクラスを登録する履修登録の学期。表記は api-clean の `term` マスタの
# 8種である(2025・2026年度のデータを投入した api-clean で確認)。
#
# - **通年は前期**に登録する(2026年度の通年 118件のうち 110件は「通年　集中」)
# - **サ集(夏期集中。「サ集　集中」)も前期**とする。夏休みに開かれ後期より前に終わる
#   ため、後期の登録で選ぶ余地が無い
_REGISTRATION_HALF: dict[str, HalfTerm] = {
    "前期": "前期",
    "1Q": "前期",
    "2Q": "前期",
    "通年": "前期",
    "サ集": "前期",
    "後期": "後期",
    "3Q": "後期",
    "4Q": "後期",
}


def registration_half(term: str | None) -> HalfTerm | None:
    """開講学期のクラスを、前期・後期のどちらの履修登録で登録するか。

    表記ゆれ(全角の `１Ｑ` など)は NFKC で寄せる。マスタに無い表記や `None` は
    None を返し、呼び出し側は落とさない(判定できないものを捨てない)。
    """
    if term is None:
        return None
    key = unicodedata.normalize("NFKC", term).replace(" ", "")
    return _REGISTRATION_HALF.get(key)
