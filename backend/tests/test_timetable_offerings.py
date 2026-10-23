"""開講年度ぶんの開講クラス・対象課程・対象学部の取得のテスト。design.md §6.1 / §6.2。

api-clean には接続しない。`search_syllabi` / `get_masters` を差し替える。
"""

import pytest

from app.curricula.merge import merge
from app.schemas.curriculum import Curriculum
from app.timetable import offerings
from app.timetable.offerings import (
    Catalog,
    clear_catalog_cache,
    fetch_catalog,
    fetch_rows,
    get_catalog,
    to_offered_class,
)
import timetable_fixtures as fx

YEAR = 2026


@pytest.fixture(autouse=True)
def reset_cache():
    clear_catalog_cache()
    yield
    clear_catalog_cache()


def _row(code: str, day="月", period=1, **kw) -> dict:
    return {
        "syllabus_code": code,
        "course_title": "テスト科目",
        "term": "前期",
        "day_of_week": day,
        "period": period,
        "room": "1-101",
        "credits": 2,
        **kw,
    }


def _fake_search(table: dict, calls: list[dict], page_size: int = 500):
    """`(program, faculty)` ごとに行を返す `search_syllabi` の差し替え。ページ送りに従う。"""

    async def fake_search_syllabi(**kwargs):
        calls.append(kwargs)
        rows = table.get((kwargs.get("program"), kwargs.get("faculty")), [])
        start = kwargs["offset"]
        return {"count": 0, "results": rows[start : start + kwargs["limit"]]}

    return fake_search_syllabi


def _fake_masters(names: list[str], calls: list[str] | None = None):
    async def fake_get_masters():
        if calls is not None:
            calls.append("masters")
        return {"course_program": [{"id": i, "name": n} for i, n in enumerate(names, 1)]}

    return fake_get_masters


def test_to_offered_class_reads_every_slot_and_values():
    offered = to_offered_class(
        _row(
            "A000000001",
            day="金",
            period=4,
            term="後期",
            subtitle="副題",
            slots=[
                {"term": "後期", "day": "金", "period": 4},
                {"term": "後期", "day": "金", "period": 5},
            ],
        )
    )
    assert [(s.term, s.day, s.period) for s in offered.slots] == [("後期", "金", 4), ("後期", "金", 5)]
    assert offered.credits == 2
    assert offered.subtitle == "副題"


def test_to_offered_class_without_slots_uses_first_slot():
    """slots を返さない api-clean(0.2.0 以前)では、1コマ目だけを使う。"""
    offered = to_offered_class(_row("A000000001", day="火", period="2"))
    assert [(s.term, s.day, s.period) for s in offered.slots] == [("前期", "火", 2)]


def test_to_offered_class_tolerates_missing_fields():
    offered = to_offered_class({"syllabus_code": "A000000001", "period": "", "slots": []})
    assert offered.slots == ()
    assert offered.period is None
    assert to_offered_class({"course_title": "コードなし"}) is None


@pytest.mark.asyncio
async def test_fetch_rows_paginates_until_short_page(monkeypatch):
    calls: list[dict] = []
    rows = [_row(f"A00000000{i}") for i in range(1, 4)]
    monkeypatch.setattr(offerings, "search_syllabi", _fake_search({(None, None): rows}, calls))

    got = await fetch_rows(year=YEAR, page_size=2)

    assert [r["syllabus_code"] for r in got] == ["A000000001", "A000000002", "A000000003"]
    assert [c["offset"] for c in calls] == [0, 2]
    assert all(c["year"] == YEAR for c in calls)


@pytest.mark.asyncio
async def test_fetch_rows_stops_at_max_pages(monkeypatch):
    calls: list[dict] = []
    rows = [_row(f"A00000000{i}") for i in range(1, 6)]
    monkeypatch.setattr(offerings, "search_syllabi", _fake_search({(None, None): rows}, calls))

    got = await fetch_rows(year=YEAR, page_size=1, max_pages=2)

    assert len(got) == 2
    assert len(calls) == 2


def _table() -> dict:
    return {
        (None, None): [_row("A1"), _row("B1"), _row("S1"), _row("G1"), _row("X1")],
        ("テスト課程01", None): [_row("A1"), _row("S1")],
        ("テスト課程02", None): [_row("B1"), _row("S1")],
        (None, "先端理工学部"): [_row("A1"), _row("B1"), _row("S1"), _row("G1")],
    }


@pytest.mark.asyncio
async def test_fetch_catalog_splits_programs_and_faculty(monkeypatch):
    calls: list[dict] = []
    monkeypatch.setattr(offerings, "search_syllabi", _fake_search(_table(), calls))
    monkeypatch.setattr(offerings, "get_masters", _fake_masters(["テスト課程01", "テスト課程02"]))

    catalog = await fetch_catalog(YEAR)

    assert set(catalog.classes) == {"A1", "B1", "S1", "G1", "X1"}
    assert catalog.faculty_codes == frozenset({"A1", "B1", "S1", "G1"})
    e = catalog.eligibility(fx.loaded().curriculum)
    assert e.allows("A1") and e.allows("S1")  # 自課程
    assert not e.allows("B1")  # 他課程だけ
    assert e.allows("G1")  # 課程指定なし


@pytest.mark.asyncio
async def test_catalog_treats_renamed_program_as_own():
    """改称前の課程名も自課程として扱う(§4.4.2 `name_aliases`)。"""
    raw = fx.program("01").model_dump()
    raw["program"]["name_aliases"] = ["旧テスト課程01"]
    program = Curriculum.model_validate(raw)
    curriculum = merge(program, fx.liberal_arts(), [program])
    catalog = Catalog(
        year=YEAR,
        classes={},
        program_codes={"旧テスト課程01": frozenset({"A1"}), "テスト課程02": frozenset({"B1"})},
        programs_known=True,
        faculty_codes=frozenset(),
    )

    assert catalog.eligibility(curriculum).allows("A1")
    assert not catalog.eligibility(curriculum).allows("B1")


@pytest.mark.asyncio
async def test_catalog_falls_back_when_masters_unavailable(monkeypatch):
    """課程一覧が引けないときは学生の課程だけを引き、候補を絞りすぎない。"""
    calls: list[dict] = []
    monkeypatch.setattr(offerings, "search_syllabi", _fake_search(_table(), calls))

    async def boom():
        raise RuntimeError("api-clean に届かない")

    monkeypatch.setattr(offerings, "get_masters", boom)

    catalog = await get_catalog(YEAR, curriculum=fx.loaded().curriculum)
    e = catalog.eligibility(fx.loaded().curriculum)

    assert catalog.programs_known is False
    assert e.allows("A1") and e.allows("B1")  # 他課程のクラスも落とさない
    assert [c.get("program") for c in calls if c.get("program")] == ["テスト課程01"]
    # 課程の一覧が引けなかった結果は置かない(次の要求で引き直す)
    await get_catalog(YEAR, curriculum=fx.loaded().curriculum)
    assert len([c for c in calls if c.get("program")]) == 2


@pytest.mark.asyncio
async def test_get_catalog_caches_until_it_expires(monkeypatch):
    calls: list[dict] = []
    masters: list[str] = []
    monkeypatch.setattr(offerings, "search_syllabi", _fake_search(_table(), calls))
    monkeypatch.setattr(offerings, "get_masters", _fake_masters(["テスト課程01"], masters))
    clock = [1000.0]
    monkeypatch.setattr(offerings.time, "monotonic", lambda: clock[0])

    first = await get_catalog(YEAR)
    second = await get_catalog(YEAR)
    assert first is second
    assert masters == ["masters"]

    clock[0] += 10_000  # 期限(既定 1800 秒)を過ぎる
    third = await get_catalog(YEAR)
    assert third is not first
    assert masters == ["masters", "masters"]
