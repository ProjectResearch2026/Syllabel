"""app/api/chat_syllabus.py のテスト。実LLM・実APIには接続しない。"""

import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic_ai.messages import ToolReturnPart
from pydantic_ai.models.function import (
    AgentInfo,
    DeltaThinkingPart,
    DeltaToolCall,
    FunctionModel,
)

import app.api.chat_syllabus as mod
from app.agents import ModelPool, course_tools
from app.api import agent_stream
from app.agents.chat_agent import build_chat_agent
from app.api.agent_stream import to_history
from app.main import app
from app.schemas.chat import ChatMessage
from app.settings import Settings
from app.timetable import context as context_module
import timetable_fixtures as fx

client = TestClient(app)

DETAIL = {
    "id": 293,
    "subject_id": 129,
    "syllabus_code": "Y000000006",
    "course_title": "符号理論",
    "term_name": "前期",
    "slots": [{"term": "前期", "day": "水", "period": 3}],
    "credits": 2,
    "summary": "誤り訂正符号を学ぶ。",
    "grading": json.dumps({"評価項目": [{"項目": "試験", "割合": 100}]}, ensure_ascii=False),
    "course_plan": [{"session_number": 1, "content": "ガイダンス"}],
}


@pytest.fixture(autouse=True)
def fixtures(monkeypatch):
    build_chat_agent.cache_clear()
    monkeypatch.setattr(
        context_module, "get_curricula", lambda: {("01", fx.ADMISSION_YEAR): fx.loaded()}
    )

    async def fake_catalog(*args, **kwargs):
        return fx.catalog()

    monkeypatch.setattr(context_module, "get_catalog", fake_catalog)
    monkeypatch.setattr(course_tools, "get_catalog", fake_catalog)
    yield
    build_chat_agent.cache_clear()


def _events(text: str) -> list[dict]:
    return [
        json.loads(chunk.removeprefix("data: "))
        for chunk in text.split("\n\n")
        if chunk.startswith("data: ")
    ]


def _recording(record: list[str], text: str = "回答です。"):
    async def stream(messages, info: AgentInfo):
        record.append(info.instructions or "")
        yield text

    return FunctionModel(stream_function=stream)


def _student(**extra) -> dict:
    return {
        "message": "符号理論はどの要件に入る?",
        "profile": {
            "grade": 1,
            "program": "テスト課程01",
            "completedCourses": [
                {"title": "哲学", "year": 2025, "term": "前期", "credits": 2, "status": "passed"}
            ],
        },
        "programCode": "01",
        "admissionYear": fx.ADMISSION_YEAR,
        "targetTerm": {"year": fx.OFFERING_YEAR, "term": "前期", "grade": 1},
        **extra,
    }


# --- プロンプト ---


def test_to_history_converts_roles():
    history = to_history(
        [ChatMessage(role="user", content="q"), ChatMessage(role="assistant", content="a")]
    )
    assert [type(m).__name__ for m in history] == ["ModelRequest", "ModelResponse"]


@pytest.mark.parametrize(
    "rule",
    [
        "ツールが返した内容だけを根拠にする",
        "「文書作成ソフト」を「Word」",
        "自分で計算・推定しない",
        "type・fillsSlot と【卒業要件の充足状況】の値で答える",
        "複数のクラス",
        "topic を使い",
        "推測であることを明示",
        "「2.0単位」のように小数で書かない",
    ],
)
def test_syllabus_prompt_states_rules(rule: str):
    assert rule in mod._SYLLABUS_PROMPT


def test_syllabus_prompt_matches_design_doc():
    """設計書 §7.4.1 に転記したプロンプトが実体と一致すること。"""
    doc = Path(__file__).parents[2] / "docs" / "design" / "05-interfaces.md"
    if not doc.exists():  # 設計書を含まない配布物では検査しない
        pytest.skip("設計書が無い")
    body = doc.read_text(encoding="utf-8").split("#### 7.4.1 システムプロンプト", 1)[1]
    quoted = body.split("```", 2)[1].strip("\n")
    assert quoted == mod._SYLLABUS_PROMPT


def test_prompt_carries_requirements_when_student_context_is_given():
    record: list[str] = []
    with build_chat_agent().override(model=_recording(record)):
        resp = client.post("/api/chat/syllabus", json=_student())

    assert resp.status_code == 200
    assert "【卒業要件の充足状況】" in record[0]
    assert "【学生】" in record[0]
    assert "哲学" not in record[0]  # 修得済み科目の一覧は載せない


def test_prompt_falls_back_to_grade_and_program_without_context():
    record: list[str] = []
    body = {"message": "情報理論の評価は?", "profile": {"grade": 2, "program": "テスト課程01"}}
    with build_chat_agent().override(model=_recording(record)):
        client.post("/api/chat/syllabus", json=body)

    assert "【学生】\n学年: 2回生\n課程: テスト課程01" in record[0]
    assert "\n【卒業要件の充足状況】\n" not in record[0]


def test_unknown_curriculum_does_not_break_the_chat():
    record: list[str] = []
    with build_chat_agent().override(model=_recording(record)):
        resp = client.post("/api/chat/syllabus", json=_student(programCode="99"))

    assert resp.status_code == 200
    assert "\n【卒業要件の充足状況】\n" not in record[0]


# --- SSE ---


def test_streams_thinking_activity_and_text():
    async def stream(messages, info):
        returned = any(
            isinstance(p, ToolReturnPart) for m in messages for p in getattr(m, "parts", [])
        )
        if not returned:
            yield {0: DeltaThinkingPart(content="探す")}
            yield {1: DeltaToolCall(name="search_courses", json_args='{"keyword": "符号"}')}
            return
        yield "  "
        yield "符号理論があります。"

    with build_chat_agent().override(model=FunctionModel(stream_function=stream)):
        resp = client.post("/api/chat/syllabus", json=_student())

    events = _events(resp.text)
    kinds = [next(iter(e)) for e in events]
    assert kinds[0] == "thinking"
    activity = [e["activity"] for e in events if "activity" in e]
    assert activity[-1] == {
        "id": activity[0]["id"],
        "tool": "search_courses",
        "label": "シラバスを検索しています",
        "args": {"keyword": "符号"},
        "found": activity[-1]["found"],
        "codes": activity[-1]["codes"],
    }
    # 検索が終わったら、当たった科目数と返した科目のコードを添えて流し直す
    assert isinstance(activity[-1]["found"], int)
    assert activity[-1]["codes"] == ["Y000000006"]
    assert all("found" not in a for a in activity[:-1])
    # 本文の前の空白は捨てる
    assert "".join(e["delta"] for e in events if "delta" in e) == "符号理論があります。"
    assert events[-1] == {"done": True}


def test_error_midstream_still_emits_done():
    async def stream(messages, info):
        yield "途中まで"
        raise RuntimeError("boom")

    with build_chat_agent().override(model=FunctionModel(stream_function=stream)):
        resp = client.post("/api/chat/syllabus", json={"message": "x"})

    events = _events(resp.text)
    assert events[-2] == {"error": "応答の生成中にエラーが発生しました"}
    assert events[-1] == {"done": True}


def test_busy_when_no_token_frees(monkeypatch):
    """トークンがすべて生成中のまま待つ上限を過ぎたら、モデルを呼ばずに混雑を伝える(§3.4.3)。"""
    record: list[str] = []
    monkeypatch.setattr(agent_stream, "model_pool", lambda: ModelPool([]))
    monkeypatch.setattr(agent_stream, "get_settings", lambda: Settings(llm_wait_seconds=0.01))

    with build_chat_agent().override(model=_recording(record)):
        resp = client.post("/api/chat/syllabus", json={"message": "x"})

    assert record == []
    assert _events(resp.text) == [{"error": agent_stream.BUSY_TEXT}, {"done": True}]


# --- 講義単位チャット ---


def test_course_chat_injects_formatted_detail(monkeypatch):
    async def fake_get_syllabus(code):
        return DETAIL

    monkeypatch.setattr(mod, "get_syllabus", fake_get_syllabus)
    record: list[str] = []
    with build_chat_agent().override(model=_recording(record)):
        resp = client.post("/api/chat/syllabus/Y000000006", json=_student())

    assert resp.status_code == 200
    target = record[0].split("【対象講義】", 1)[1]
    assert "誤り訂正符号を学ぶ。" in target
    assert "試験 100%" in target  # 成績評価は JSON 文字列のまま渡さない
    assert "subject_id" not in target  # api-clean の内部の項目は渡さない
    assert "専門応用 › 選択" in target  # 学生にとっての区分


@pytest.mark.parametrize(
    ("error", "status"),
    [
        (httpx.HTTPStatusError("404", request=httpx.Request("GET", "http://x"), response=httpx.Response(404)), 404),
        (httpx.HTTPStatusError("500", request=httpx.Request("GET", "http://x"), response=httpx.Response(500)), 502),
        (httpx.ConnectError("down"), 502),
    ],
)
def test_course_chat_maps_upstream_errors(monkeypatch, error, status):
    async def fake_get_syllabus(code):
        raise error

    monkeypatch.setattr(mod, "get_syllabus", fake_get_syllabus)
    resp = client.post("/api/chat/syllabus/Y000000006", json={"message": "x"})
    assert resp.status_code == status
