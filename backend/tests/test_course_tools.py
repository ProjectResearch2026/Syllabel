"""シラバスを探すツール(`search_courses` / `get_course`)のテスト。design.md §7.4。

api-clean には接続しない。開講情報は合成の `Catalog`(`tests/timetable_fixtures.py`)、
本文の検索・詳細・版は差し替える。
"""

import json

import httpx
import pytest

from app.agents import course_tools
from app.agents.course_tools import (
    clear_text_support_cache,
    get_course,
    grading_text,
    search_courses,
)
from app.timetable import context as context_module
from app.timetable.context import build_student_context
import timetable_fixtures as fx


@pytest.fixture(autouse=True)
def curricula(monkeypatch):
    monkeypatch.setattr(
        context_module, "get_curricula", lambda: {("01", fx.ADMISSION_YEAR): fx.loaded()}
    )
    clear_text_support_cache()
    yield
    clear_text_support_cache()


async def _ctx(*courses, grade=1):
    return await build_student_context(
        fx.profile(*courses, grade=grade), "01", fx.ADMISSION_YEAR, fx.target(grade=grade),
        catalog=fx.catalog(),
    )


def _text_rows(monkeypatch, rows: list[dict], calls: list[dict]):
    async def fake_fetch_rows(**kwargs):
        calls.append(kwargs)
        return rows

    monkeypatch.setattr(course_tools, "fetch_rows", fake_fetch_rows)


@pytest.mark.asyncio
async def test_search_by_keyword_groups_classes_and_annotates_for_the_student():
    ctx = await _ctx(fx.course("微分積分"))
    result = await search_courses(ctx, keyword="線形")

    assert result["total"] == 1
    entry = result["courses"][0]
    assert entry["title"] == "線形代数"
    assert entry["when"] == "前期 火1"
    assert entry["otherClasses"] == [{"code": "Y000000003", "when": "前期 水1"}]
    assert entry["type"] == "専門基礎 › 必修"
    assert entry["fillsSlot"] == "専門基礎科目(必修)"
    assert entry["registrable"] is True


@pytest.mark.asyncio
async def test_search_excludes_other_faculty_and_taken_courses_by_default():
    ctx = await _ctx(fx.course("微分積分"))
    titles = {c["title"] for c in (await search_courses(ctx, limit=20))["courses"]}

    assert "他学部の科目" not in titles  # 対象学部の科目だけ
    assert "微分積分" not in titles  # 修得済み
    assert "他課程指定" not in titles  # 履修できないクラス
    taken = await search_courses(ctx, keyword="微分", include_taken=True)
    assert taken["courses"][0]["status"] == "修得済み"


@pytest.mark.asyncio
async def test_search_by_slot_category_and_type():
    ctx = await _ctx()
    by_slot = await search_courses(ctx, day="水", period=3)
    assert [c["title"] for c in by_slot["courses"]] == ["符号理論"]

    by_type = await search_courses(ctx, category="専門応用", course_type="選択必修")
    assert [c["title"] for c in by_type["courses"]] == ["数値解析"]

    by_field = await search_courses(ctx, category="教養教育", subcategory="人文科学系")
    assert {c["title"] for c in by_field["courses"]} == {"哲学", "文学", "音楽"}


@pytest.mark.asyncio
async def test_search_reports_how_to_widen_when_nothing_matches():
    ctx = await _ctx()
    result = await search_courses(ctx, keyword="符号", day="月")

    assert result["total"] == 0
    assert "day・period を外すと 1 科目" in result["hint"]


@pytest.mark.asyncio
async def test_topic_search_uses_api_clean_text_and_returns_matched_fields(monkeypatch):
    calls: list[dict] = []
    _text_rows(
        monkeypatch,
        [{"syllabus_code": "Y000000006", "text_matched": ["講義概要", "授業計画"]}],
        calls,
    )
    ctx = await _ctx()
    result = await search_courses(ctx, topic="誤り訂正")

    assert [c["title"] for c in result["courses"]] == ["符号理論"]
    assert result["courses"][0]["matchedIn"] == ["講義概要", "授業計画"]
    assert calls[0]["text"] == "誤り訂正"
    assert calls[0]["faculty"] == "先端理工学部"
    assert calls[0]["year"] == fx.OFFERING_YEAR


@pytest.mark.asyncio
async def test_topic_search_refuses_old_api_clean(monkeypatch):
    """古い api-clean は未知の text を黙って無視し、text_matched の無い全件を返す。

    全件を「内容に合う科目」として見せずに断り、しばらくは送らない。
    """
    calls: list[dict] = []
    _text_rows(monkeypatch, [{"syllabus_code": "Y000000006"}], calls)
    ctx = await _ctx()

    first = await search_courses(ctx, topic="誤り訂正")
    second = await search_courses(ctx, topic="符号")

    assert "error" in first and "error" in second
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_topic_search_with_no_hits_is_not_an_error(monkeypatch):
    """0件は対応していない印ではない。本当に当たらなかった。"""
    calls: list[dict] = []
    _text_rows(monkeypatch, [], calls)

    result = await search_courses(await _ctx(), topic="量子重力")

    assert result["total"] == 0
    assert "error" not in result


@pytest.mark.asyncio
async def test_search_without_student_ignores_student_filters():
    result = await search_courses(None, keyword="理論", category="専門応用", catalog=fx.catalog())

    assert {c["title"] for c in result["courses"]} == {"情報理論", "符号理論"}
    assert "type" not in result["courses"][0]
    assert "区分" in result["note"]


@pytest.mark.asyncio
async def test_search_returns_error_instead_of_raising(monkeypatch):
    async def boom(**kwargs):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(course_tools, "fetch_rows", boom)

    result = await search_courses(await _ctx(), topic="AI")
    assert result == {"error": "シラバスのサーバに届かなかった。時間をおいて試す"}


DETAIL = {
    "syllabus_code": "Y000000006",
    "course_title": "符号理論",
    "subtitle": None,
    "term_name": "前期",
    "slots": [{"term": "前期", "day": "水", "period": 3}],
    "credits": 2,
    "grade_min": 1,
    "grade_max": 4,
    "campus_name": "瀬田",
    "summary": "誤り訂正符号を学ぶ。",
    "goals": "符号の性質を説明できる。",
    "grading": json.dumps(
        {
            "評価項目": [
                {"項目": "定期試験", "割合": 60, "基準": "理解度", "備考": ""},
                {"項目": "レポート", "割合": "40%", "基準": "", "備考": ""},
            ],
            "自由記載": "再試験なし",
        },
        ensure_ascii=False,
    ),
    "course_plan": [{"session_number": 1, "content": "ガイダンス\n概要"}],
    "instructors": [{"kanji_name": "山田　太郎"}],
    "textbooks": [{"title": "符号理論入門", "author": "山田", "publisher": "出版社", "role": "main"}],
    "textbook_note": None,
}


@pytest.mark.asyncio
async def test_get_course_returns_only_requested_sections(monkeypatch):
    async def fake_get_syllabus(code):
        return DETAIL

    monkeypatch.setattr(course_tools, "get_syllabus", fake_get_syllabus)

    result = await get_course(await _ctx(), "Y000000006", ["概要", "成績評価", "授業計画", "教科書", "担当教員"])

    assert result["title"] == "符号理論"
    assert result["when"] == "前期 水3"
    assert result["type"] == "専門応用 › 選択"
    assert result["sections"] == {
        "概要": "誤り訂正符号を学ぶ。",
        "成績評価": "定期試験 60%(理解度)\nレポート 40%\n再試験なし",
        "授業計画": "第1回: ガイダンス 概要",
        "教科書": "符号理論入門(山田・出版社)",
        "担当教員": "山田　太郎",
    }


@pytest.mark.asyncio
async def test_get_course_reports_unknown_code(monkeypatch):
    async def fake_get_syllabus(code):
        request = httpx.Request("GET", f"http://api/syllabi/{code}")
        raise httpx.HTTPStatusError("404", request=request, response=httpx.Response(404, request=request))

    monkeypatch.setattr(course_tools, "get_syllabus", fake_get_syllabus)

    result = await get_course(await _ctx(), "Z999999999")
    assert "見つからない" in result["error"]


def test_grading_text_keeps_plain_text():
    assert grading_text("試験で評価する") == "試験で評価する"
    assert grading_text("{壊れた") == "{壊れた"
    assert grading_text("") is None
