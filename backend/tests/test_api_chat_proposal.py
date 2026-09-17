"""app/api/chat_proposal.py のテスト。実LLM・実APIには接続しない。"""

import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic_ai.messages import ModelMessage, PartStartEvent, TextPart, ToolReturnPart
from pydantic_ai.models.function import (
    AgentInfo,
    DeltaToolCall,
    DeltaToolCalls,
    FunctionModel,
)
from pydantic_ai.models.test import TestModel

import app.agents.chat_agent as chat_agent_mod
import app.api.chat_proposal as mod
import app.api.chat_syllabus as chat_syllabus_mod
from app.agents import tools as tools_module
from app.agents.chat_agent import build_chat_agent
from app.main import app

client = TestClient(app)

OUTPUT_TEXT = "これは テスト 応答 です"
DONE_EVENT = 'data: {"done": true}\n\n'

PROPOSAL = {
    "courses": [
        {
            "syllabusCode": "B12345",
            "title": "情報基礎",
            "day": "月",
            "period": 3,
            "term": "前期",
            "credits": 2,
            "category": "必修",
            "reason": "情報メディア分野の必修であり、1年次に置くのが標準のため。",
        },
        {
            "syllabusCode": "B54321",
            "title": "微分積分学",
            "day": "火",
            "period": 1,
            "term": "前期",
            "credits": 2,
            "category": "選択必修",
            "reason": "数理科目の不足単位を埋めるため。",
        },
    ],
    "totalCredits": 4,
    "summary": "必修を軸に、数理科目の不足を埋める構成にした。抽選科目は別途確認すること。",
}

SYLLABUS_DETAIL = {
    "syllabus_code": "B12345",
    "course_title": "情報基礎",
    "instructor": "田中",
    "grading": "レポート100%",
}


@pytest.fixture(autouse=True)
def reset_caches():
    build_chat_agent.cache_clear()
    tools_module._get_client.cache_clear()
    yield
    build_chat_agent.cache_clear()
    tools_module._get_client.cache_clear()


@pytest.fixture
def spy_stream(monkeypatch):
    """_stream_response に渡された引数を記録する。処理はそのまま通す。"""
    captured = {}
    original = mod._stream_response

    def spy(prompt, history, instructions=None):
        captured["prompt"] = prompt
        captured["history"] = history
        captured["instructions"] = instructions
        return original(prompt, history, instructions)

    monkeypatch.setattr(mod, "_stream_response", spy)
    return captured


def _body(messages: list[dict], **extra) -> dict:
    return {"proposal": PROPOSAL, "messages": messages, **extra}


def _post(messages: list[dict], **extra):
    return client.post("/api/chat/proposal", json=_body(messages, **extra))


def _deltas(body: str) -> list[str]:
    """SSE レスポンス本文から delta の値だけを順番に取り出す。"""
    values: list[str] = []
    for event in body.split("\n\n"):
        if not event.startswith("data: "):
            continue
        payload = json.loads(event.removeprefix("data: "))
        if "delta" in payload:
            values.append(payload["delta"])
    return values


def _has_tool_return(messages: list[ModelMessage]) -> bool:
    """ツール実行結果が履歴に入っている(=2回目のモデル呼び出し)かを判定する。"""
    return any(
        isinstance(part, ToolReturnPart)
        for message in messages
        for part in getattr(message, "parts", [])
    )


def _stub_model():
    return TestModel(call_tools=[], custom_output_text=OUTPUT_TEXT)


# ---------------------------------------------------------------------------
# SSE(§7.3)
# ---------------------------------------------------------------------------


def test_chat_proposal_returns_sse():
    """200 かつ content-type が text/event-stream であること。"""
    agent = build_chat_agent()
    with agent.override(model=_stub_model()):
        resp = _post([{"role": "user", "content": "この時間割は何単位?"}])

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")


def test_chat_proposal_streams_delta_then_done():
    """delta が1つ以上流れ、最後が done であること(§7.4 と同一の書式)。"""
    agent = build_chat_agent()
    with agent.override(model=_stub_model()):
        resp = _post([{"role": "user", "content": "この時間割は何単位?"}])

    events = [e for e in resp.text.split("\n\n") if e]
    assert len(events) >= 2
    assert all(e.startswith("data: ") for e in events)
    assert '"delta"' in events[0]
    assert resp.text.endswith(DONE_EVENT)
    assert "".join(_deltas(resp.text)) == OUTPUT_TEXT


# ---------------------------------------------------------------------------
# 提案の注入(§7.3)
# ---------------------------------------------------------------------------


def test_chat_proposal_injects_proposal(spy_stream):
    """提案が instructions に日本語のまま埋め込まれること。"""
    agent = build_chat_agent()
    with agent.override(model=_stub_model()):
        resp = _post([{"role": "user", "content": "この時間割は何単位?"}])

    assert resp.status_code == 200
    instructions = spy_stream["instructions"]
    assert "【現在の提案】" in instructions
    assert "情報基礎" in instructions
    assert "微分積分学" in instructions
    assert "抽選科目は別途確認すること" in instructions


def test_chat_proposal_injects_proposal_in_camel_case(spy_stream):
    """提案はリクエストと同じ camelCase の JSON で渡ること(プロンプト規則4)。"""
    agent = build_chat_agent()
    with agent.override(model=_stub_model()):
        _post([{"role": "user", "content": "合計単位は?"}])

    instructions = spy_stream["instructions"]
    payload = json.loads(instructions.split("【現在の提案】\n", 1)[1])
    assert payload["totalCredits"] == 4
    assert payload["courses"][0]["syllabusCode"] == "B12345"


def test_chat_proposal_prompt_reaches_model(spy_stream):
    """役割定義が instructions として毎リクエスト渡ること。"""
    agent = build_chat_agent()
    with agent.override(model=_stub_model()):
        _post([{"role": "user", "content": "この時間割は何単位?"}])

    assert mod._PROPOSAL_PROMPT in spy_stream["instructions"]


@pytest.mark.parametrize(
    "rule",
    [
        "【現在の提案】に書かれているものがすべて",  # 提案の捏造を禁じる
        "ツールが返した内容だけを根拠にする",  # シラバス事項の捏造を禁じる
        "自分で計算・推定しない",  # 単位数・曜日・時限の数え直しを禁じる
        "提案の再生成",  # 時間割を書き換えたかのような回答を禁じる
    ],
)
def test_proposal_prompt_states_grounding_rules(rule: str):
    """提案チャット固有の規則がプロンプトに含まれること。"""
    assert rule in mod._PROPOSAL_PROMPT


def test_proposal_prompt_matches_design_doc():
    """設計書 §7.3.1 に転記したプロンプトが実体と一致すること。

    プロンプトは設計書に本文ごと載せている(design.md §7.3.1)。片方だけ直すと
    設計書が嘘になるため、コードブロックの中身を照合する。
    """
    doc = Path(__file__).parents[2] / "docs" / "design" / "05-interfaces.md"
    if not doc.exists():  # 設計書を含まない配布物では検査しない
        pytest.skip("設計書が無い")

    body = doc.read_text(encoding="utf-8").split("#### 7.3.1 システムプロンプト", 1)[1]
    quoted = body.split("```", 2)[1].strip("\n")

    assert quoted == mod._PROPOSAL_PROMPT


# ---------------------------------------------------------------------------
# messages の扱い(§7.3「履歴+提案+質問」)
# ---------------------------------------------------------------------------


def test_chat_proposal_uses_last_message_as_question(spy_stream):
    """末尾の user 発言が質問、それより前が履歴になること。"""
    messages = [
        {"role": "user", "content": "前の質問"},
        {"role": "assistant", "content": "前の回答"},
        {"role": "user", "content": "月曜3限は何?"},
    ]
    agent = build_chat_agent()
    with agent.override(model=_stub_model()):
        resp = _post(messages)

    assert resp.status_code == 200
    assert [type(m).__name__ for m in spy_stream["history"]] == [
        "ModelRequest",
        "ModelResponse",
    ]
    assert "月曜3限は何?" in spy_stream["prompt"]
    assert "前の質問" not in spy_stream["prompt"]


def test_chat_proposal_includes_student_facts(spy_stream):
    """studentProfile があれば学年と課程が質問文に前置されること。"""
    profile = {"grade": 3, "program": "知能情報メディア課程"}
    agent = build_chat_agent()
    with agent.override(model=_stub_model()):
        resp = _post(
            [{"role": "user", "content": "月曜3限は何?"}], studentProfile=profile
        )

    assert resp.status_code == 200
    assert "3回生" in spy_stream["prompt"]
    assert "知能情報メディア課程" in spy_stream["prompt"]


def test_chat_proposal_excludes_completed_courses(spy_stream):
    """成績・履修データはプロンプトに含めないこと。要件§5.5。"""
    profile = {
        "grade": 3,
        "program": "知能情報メディア課程",
        "completedCourses": [
            {
                "title": "極秘科目",
                "year": 2025,
                "term": "前期",
                "credits": 2.0,
                "status": "passed",
            }
        ],
    }
    agent = build_chat_agent()
    with agent.override(model=_stub_model()):
        resp = _post(
            [{"role": "user", "content": "月曜3限は何?"}], studentProfile=profile
        )

    assert resp.status_code == 200
    assert "極秘科目" not in spy_stream["prompt"]
    assert "極秘科目" not in spy_stream["instructions"]


def test_chat_proposal_accepts_null_student_profile():
    """studentProfile は null でも受け付けること(§7.3 のリクエスト)。"""
    agent = build_chat_agent()
    with agent.override(model=_stub_model()):
        resp = _post([{"role": "user", "content": "やあ"}], studentProfile=None)

    assert resp.status_code == 200
    assert resp.text.endswith(DONE_EVENT)


# ---------------------------------------------------------------------------
# 422(リクエストの検証)
# ---------------------------------------------------------------------------


def test_chat_proposal_422_without_proposal():
    """proposal が無ければ 422 であること。"""
    resp = client.post(
        "/api/chat/proposal", json={"messages": [{"role": "user", "content": "やあ"}]}
    )
    assert resp.status_code == 422


def test_chat_proposal_422_on_empty_messages():
    """messages が空なら 422 であること。質問が無い。"""
    assert _post([]).status_code == 422


def test_chat_proposal_422_when_last_message_is_assistant():
    """末尾が assistant なら 422 であること。質問として扱える発言が無い。"""
    messages = [
        {"role": "user", "content": "前の質問"},
        {"role": "assistant", "content": "前の回答"},
    ]
    assert _post(messages).status_code == 422


def test_chat_proposal_422_on_time_conflict():
    """コマが重複した提案は 422 であること(TimetableProposal の検証)。"""
    proposal = json.loads(json.dumps(PROPOSAL))
    proposal["courses"][1]["day"] = "月"
    proposal["courses"][1]["period"] = 3
    resp = client.post(
        "/api/chat/proposal",
        json={"proposal": proposal, "messages": [{"role": "user", "content": "やあ"}]},
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# ツール呼び出し(§7.3 のシーケンス)
# ---------------------------------------------------------------------------


def test_chat_proposal_runs_tool_after_blank_text(monkeypatch):
    """提案に載った講義の詳細をツールで引き、その結果で答えられること。

    §7.3 のシーケンス(ツール呼び出し → api-clean → 継続 → 応答ストリーム)。
    ツール直前に空白だけの TextPart を出すモデル(Qwen3.6 + reasoning パーサ)の
    実挙動も併せて踏む。
    """
    called = {}

    async def fake_get_syllabus(code: str) -> dict:
        called["code"] = code
        return SYLLABUS_DETAIL

    monkeypatch.setattr(chat_agent_mod, "get_syllabus", fake_get_syllabus)

    async def stream_fn(
        messages: list[ModelMessage], info: AgentInfo
    ) -> AsyncIterator[str | DeltaToolCalls]:
        if _has_tool_return(messages):
            yield "情報基礎の成績評価は"
            yield "レポート100%です"
        else:
            yield "\n\n"
            yield {
                0: DeltaToolCall(
                    name="tool_get_syllabus", json_args='{"code": "B12345"}'
                )
            }

    agent = build_chat_agent()
    with agent.override(model=FunctionModel(stream_function=stream_fn)):
        resp = _post([{"role": "user", "content": "情報基礎の評価方法は?"}])

    assert resp.status_code == 200
    assert called["code"] == "B12345"

    deltas = _deltas(resp.text)
    assert "".join(deltas) == "情報基礎の成績評価はレポート100%です"
    assert deltas[0].strip(), "先頭に空白だけの delta が流れている"
    assert resp.text.endswith(DONE_EVENT)


# ---------------------------------------------------------------------------
# エラー(§7.4 と同一の扱い)
# ---------------------------------------------------------------------------


def test_chat_proposal_error_midstream_still_emits_done(monkeypatch):
    """delta を流した後に失敗しても error → done で締めること。

    ストリーム本体は §7.4 と同じ `_stream_response` を使うため、ここで確かめるのは
    提案チャットも同じ経路を通ることまでとする。
    """

    class MidBoomAgent:
        def run_stream_events(self, *args, **kwargs):
            @asynccontextmanager
            async def cm():
                async def events():
                    yield PartStartEvent(index=0, part=TextPart(content="途中まで"))
                    raise RuntimeError("boom")

                yield events()

            return cm()

    monkeypatch.setattr(chat_syllabus_mod, "build_chat_agent", lambda: MidBoomAgent())

    resp = _post([{"role": "user", "content": "この時間割は何単位?"}])

    assert resp.status_code == 200
    assert '"delta"' in resp.text
    assert '"error"' in resp.text
    assert "boom" not in resp.text
    assert resp.text.endswith(DONE_EVENT)


# ---------------------------------------------------------------------------
# ログ禁止(§4.2.3)
# ---------------------------------------------------------------------------


def test_chat_proposal_does_not_log_student_data(caplog):
    """学生プロファイル・提案・質問をログに残さないこと。要件§5.5 / §4.2.3。"""
    profile = {
        "grade": 3,
        "program": "知能情報メディア課程",
        "completedCourses": [
            {
                "title": "極秘科目",
                "year": 2025,
                "term": "前期",
                "credits": 2.0,
                "status": "passed",
            }
        ],
    }
    agent = build_chat_agent()
    with caplog.at_level(logging.DEBUG):
        with agent.override(model=_stub_model()):
            resp = _post(
                [{"role": "user", "content": "極秘の質問です"}], studentProfile=profile
            )

    assert resp.status_code == 200
    for secret in ("極秘科目", "極秘の質問です", "知能情報メディア課程", "情報基礎"):
        assert secret not in caplog.text
