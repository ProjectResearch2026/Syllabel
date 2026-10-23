"""`/api/timetable/*` のテスト。design.md §6.1 / §7.2。

履修要項と開講情報は合成のもの(`tests/timetable_fixtures.py`)に差し替え、モデルは
`FunctionModel` で差し替える。vllm・api-clean には接続しない。
"""

import json

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic_ai.messages import ModelMessage, ToolReturnPart
from pydantic_ai.models.function import AgentInfo, DeltaThinkingPart, DeltaToolCall, FunctionModel

from app.agents.timetable_assistant import build_timetable_assistant
from app.main import app
from app.timetable import context as context_module
import timetable_fixtures as fx

client = TestClient(app)


@pytest.fixture(autouse=True)
def fixtures(monkeypatch):
    monkeypatch.setattr(
        context_module, "get_curricula", lambda: {("01", fx.ADMISSION_YEAR): fx.loaded()}
    )

    async def fake_catalog(*args, **kwargs):
        return fx.catalog()

    monkeypatch.setattr(context_module, "get_catalog", fake_catalog)
    build_timetable_assistant.cache_clear()
    yield
    build_timetable_assistant.cache_clear()


def _body(**extra) -> dict:
    return {
        "studentProfile": {"grade": 1, "program": "テスト課程01", "completedCourses": []},
        "programCode": "01",
        "admissionYear": fx.ADMISSION_YEAR,
        "targetTerm": {"year": fx.OFFERING_YEAR, "term": "前期", "grade": 1},
        **extra,
    }


def _events(text: str) -> list[dict]:
    return [
        json.loads(chunk.removeprefix("data: "))
        for chunk in text.split("\n\n")
        if chunk.startswith("data: ")
    ]


# --- build / check ---


def test_build_returns_timetable_report_steps_and_message():
    resp = client.post("/api/timetable/build", json=_body(conditions={"freeDayCount": 1}))

    assert resp.status_code == 200
    data = resp.json()
    titles = {c["title"] for c in data["timetable"]}
    assert {"微分積分", "線形代数", "仏教の思想A"} <= titles
    assert data["totalCredits"] == sum(c["credits"] for c in data["timetable"])
    assert len(data["conditions"]["freeDays"]) == 1  # 組み立てが決めた曜日
    assert data["report"]["freeDays"]
    assert data["steps"][0]["kind"] == "required"
    assert data["message"].startswith("時間割を組みました。")
    assert all(c["source"] == "assistant" for c in data["timetable"])


def test_build_keeps_courses_the_student_added():
    mine = {
        "syllabusCode": "G000000003",
        "title": "文学",
        "day": "月",
        "period": 4,
        "term": "前期",
        "slots": [{"term": "前期", "day": "月", "period": 4}],
        "credits": 2,
        "category": "選択",
        "reason": "学生が自分で時間割に登録した科目",
        "source": "student",
    }
    data = client.post("/api/timetable/build", json=_body(timetable=[mine])).json()

    kept = next(c for c in data["timetable"] if c["title"] == "文学")
    assert kept["source"] == "student"


def test_check_reports_the_given_timetable():
    course = {
        "syllabusCode": "Y000000007",
        "title": "画像処理",
        "day": "金",
        "period": 3,
        "term": "前期",
        "slots": [{"term": "前期", "day": "金", "period": 3}, {"term": "前期", "day": "金", "period": 4}],
        "credits": 4,
        "category": "選択",
        "reason": "",
    }
    data = client.post(
        "/api/timetable/check", json=_body(timetable=[course], conditions={"freeDays": ["金"]})
    ).json()

    status = next(c for c in data["report"]["conditions"] if c["condition"] == "金曜を全休にする")
    assert status["status"] == "unmet"
    assert data["report"]["credits"]["total"] == 4


def test_unknown_curriculum_is_404():
    resp = client.post("/api/timetable/build", json=_body(programCode="99"))
    assert resp.status_code == 404


def test_upstream_failure_is_502(monkeypatch):
    async def down(*args, **kwargs):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(context_module, "get_catalog", down)
    resp = client.post("/api/timetable/build", json=_body())
    assert resp.status_code == 502


def test_assistant_requires_user_message_last():
    resp = client.post(
        "/api/timetable/assistant", json=_body(messages=[{"role": "assistant", "content": "x"}])
    )
    assert resp.status_code == 422


# --- assistant ---


def _model(record: list[str]):
    """1回目は考えてから build_timetable を呼び、2回目はツールの結果を受けて答える。"""

    async def stream(messages: list[ModelMessage], info: AgentInfo):
        record.append(info.instructions or "")
        returned = [
            part
            for message in messages
            for part in getattr(message, "parts", [])
            if isinstance(part, ToolReturnPart)
        ]
        if not returned:
            yield {0: DeltaThinkingPart(content="全休の希望なので")}
            yield {1: DeltaToolCall(name="build_timetable", json_args='{"free_day_')}
            yield {1: DeltaToolCall(json_args='count": 1}')}
            return
        record.append(str(returned[-1].content))
        yield "全休を1日"
        yield "作りました。"

    return FunctionModel(stream_function=stream)


def test_assistant_streams_thinking_activity_steps_timetable_and_text():
    record: list[str] = []
    agent = build_timetable_assistant()
    with agent.override(model=_model(record)):
        resp = client.post(
            "/api/timetable/assistant",
            json=_body(messages=[{"role": "user", "content": "全休が欲しい"}]),
        )

    assert resp.status_code == 200
    events = _events(resp.text)
    kinds = [next(iter(e)) for e in events]
    assert kinds[0] == "thinking"
    assert "activity" in kinds
    # 引数は書きかけの間から流れる
    activities = [e["activity"] for e in events if "activity" in e]
    assert activities[0]["label"] == "時間割を組んでいます"
    assert activities[-1]["args"] == {"free_day_count": 1}
    # 同じ呼び出しの書きかけは同じ id で流れ直す
    assert len({a["id"] for a in activities}) == 1
    # 組み立ての手順 → 時間割 → 条件 → 本文 → 終端の順
    assert kinds.index("build") < kinds.index("step") < kinds.index("timetable")
    assert kinds.index("timetable") < kinds.index("conditions") < kinds.index("delta")
    assert kinds[-1] == "done"
    timetable = next(e["timetable"] for e in events if "timetable" in e)
    assert timetable["report"]["freeDays"]
    conditions = next(e["conditions"] for e in events if "conditions" in e)
    assert conditions["freeDayCount"] == 1 and len(conditions["freeDays"]) == 1
    assert "".join(e["delta"] for e in events if "delta" in e) == "全休を1日作りました。"
    # プロンプトには事実の節が入り、ツールの結果にはレポートが返る
    assert "【卒業要件の充足状況】" in record[0]
    assert "【現在の時間割】\nまだ時間割は無い" in record[0]
    assert "授業の無い平日" in record[-1]  # 2回目の呼び出しで受け取ったツールの結果


def test_assistant_answers_without_building():
    async def stream(messages, info):
        yield "時間割づくりを手伝えます。"

    agent = build_timetable_assistant()
    with agent.override(model=FunctionModel(stream_function=stream)):
        resp = client.post(
            "/api/timetable/assistant",
            json=_body(messages=[{"role": "user", "content": "何ができますか?"}]),
        )

    kinds = [next(iter(e)) for e in _events(resp.text)]
    assert "timetable" not in kinds
    assert kinds == ["delta", "done"]


def test_assistant_reports_errors_as_events():
    async def stream(messages, info):
        raise RuntimeError("boom")
        yield ""  # pragma: no cover

    agent = build_timetable_assistant()
    with agent.override(model=FunctionModel(stream_function=stream)):
        resp = client.post(
            "/api/timetable/assistant",
            json=_body(messages=[{"role": "user", "content": "全休が欲しい"}]),
        )

    events = _events(resp.text)
    assert "error" in events[-2] and events[-1] == {"done": True}


def test_instructions_state_the_rules():
    from app.agents.timetable_assistant import INSTRUCTIONS

    for rule in (
        "時間割を作る・変えるときは build_timetable を呼ぶ",
        "使い方の質問・科目についての質問・雑談では呼ばない",
        "満たしていない希望を満たしたと書かない",
        "学生が何を確かめればよいかを必ず書く",
        "「2.0単位」のように小数で書かない",
        "不足の確保や補填として書かない",
        "言葉の定義の説明から始めない",
        "日本語だけで答えてください",
        "曜日ごとの科目を表や一覧で書き直さない",
        "代わりを求められていないときは mode に remove を使い",
        "代わりの科目を探すか尋ねる",
    ):
        assert rule in INSTRUCTIONS
