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
    # ツールの行には、頼んだ日数ではなく組み立てで全休にした曜日を添える
    assert activities[-1]["freeDays"] == conditions["freeDays"]
    assert "failed" not in activities[-1]
    assert "".join(e["delta"] for e in events if "delta" in e) == "全休を1日作りました。"
    # プロンプトには事実の節が入り、ツールの結果にはレポートが返る
    assert "【卒業要件の充足状況】" in record[0]
    assert "【現在の時間割】\nまだ時間割は無い" in record[0]
    assert "授業の無い平日" in record[-1]  # 2回目の呼び出しで受け取ったツールの結果


def test_assistant_activity_names_courses_given_by_code():
    """引数のシラバスコードに科目名を添える。時間割に入らなかった科目もコードのまま見せない。"""

    async def stream(messages: list[ModelMessage], info: AgentInfo):
        if not any(
            isinstance(part, ToolReturnPart)
            for message in messages
            for part in getattr(message, "parts", [])
        ):
            yield {
                0: DeltaToolCall(
                    name="build_timetable",
                    json_args='{"mode": "adjust", "include": ["Y000000006"], "exclude": ["音楽"]}',
                )
            }
            return
        yield "入れました。"

    agent = build_timetable_assistant()
    with agent.override(model=FunctionModel(stream_function=stream)):
        resp = client.post(
            "/api/timetable/assistant",
            json=_body(messages=[{"role": "user", "content": "符号理論を入れて"}]),
        )

    activities = [e["activity"] for e in _events(resp.text) if "activity" in e]
    # 書き終えた引数にだけ添える(書きかけの間は添えない)。科目名で書かれた引数(exclude の
    # 音楽)は添えない
    assert "titles" not in activities[0]
    assert activities[-1]["titles"] == {"Y000000006": "符号理論"}


def test_assistant_activity_reports_what_it_could_not_include_or_exclude():
    """入れられなかった科目と、今の時間割に無くて外せなかった科目を、ツールの行に添える。"""
    current = [
        {
            "syllabusCode": "Y000000005", "title": "情報理論", "day": "水", "period": 3,
            "term": "前期", "slots": [{"term": "前期", "day": "水", "period": 3}],
            "credits": 2, "category": "選択", "reason": "", "source": "student",
        }
    ]

    async def stream(messages: list[ModelMessage], info: AgentInfo):
        returned = [
            part
            for message in messages
            for part in getattr(message, "parts", [])
            if isinstance(part, ToolReturnPart)
        ]
        if not returned:
            yield {
                0: DeltaToolCall(
                    name="build_timetable",
                    json_args='{"mode": "adjust", "include": ["Y000000006"], "exclude": ["音楽"]}',
                )
            }
            return
        record.append(str(returned[-1].content))
        yield "入れられませんでした。"

    record: list[str] = []
    agent = build_timetable_assistant()
    with agent.override(model=FunctionModel(stream_function=stream)):
        resp = client.post(
            "/api/timetable/assistant",
            json=_body(
                timetable=current,
                messages=[{"role": "user", "content": "符号理論を入れて、音楽を外して"}],
            ),
        )

    activities = [e["activity"] for e in _events(resp.text) if "activity" in e]
    failed = activities[-1]["failed"]
    # 符号理論(水3)は自分で入れた情報理論(水3)と重なる。音楽は時間割に無い
    assert "水3で重なる" in failed["Y000000006"]
    assert failed["音楽"] == "時間割に無い"
    # 科目名も添えたまま流し直す
    assert activities[-1]["titles"] == {"Y000000006": "符号理論"}
    # モデルにも、時間割に無い科目を外そうとしたことが伝わる
    assert "今の時間割に無かった科目(外していない): 音楽" in record[-1]


def test_assistant_reports_courses_displaced_for_an_include():
    """入れたい科目のために外した科目を、ツールの行とモデルへの結果に添える。"""
    current = [
        {
            "syllabusCode": "Y000000005", "title": "情報理論", "day": "水", "period": 3,
            "term": "前期", "slots": [{"term": "前期", "day": "水", "period": 3}],
            "credits": 2, "category": "選択", "reason": "", "source": "assistant",
        }
    ]

    async def stream(messages: list[ModelMessage], info: AgentInfo):
        returned = [
            part
            for message in messages
            for part in getattr(message, "parts", [])
            if isinstance(part, ToolReturnPart)
        ]
        if not returned:
            yield {
                0: DeltaToolCall(
                    name="build_timetable",
                    json_args='{"mode": "adjust", "include": ["Y000000006"]}',
                )
            }
            return
        record.append(str(returned[-1].content))
        yield "入れました。"

    record: list[str] = []
    agent = build_timetable_assistant()
    with agent.override(model=FunctionModel(stream_function=stream)):
        resp = client.post(
            "/api/timetable/assistant",
            json=_body(
                timetable=current,
                messages=[{"role": "user", "content": "符号理論を入れて"}],
            ),
        )

    activities = [e["activity"] for e in _events(resp.text) if "activity" in e]
    assert activities[-1]["displaced"] == {"情報理論": "符号理論と水3で重なる"}
    assert "failed" not in activities[-1]
    assert "入れたい科目のために外した科目: 情報理論(符号理論と水3で重なる)" in record[-1]


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
        "入れたい科目は include に渡すだけでよい",
        "「外してよい科目を1つだけ外したときに増える不足」で判断する",
        "前の発話で出た科目のコードは【会話で出た科目】にある",
    ):
        assert rule in INSTRUCTIONS


def test_assistant_sees_the_rebuilt_timetable_within_the_same_reply():
    """組み立てた後にモデルを呼ぶときは、【現在の時間割】が組み立て後の時間割になる。

    先頭で1回だけ作ると、モデルは組み立て前の時間割と組み立て後のレポートという食い違う
    事実を見る。
    """
    seen: list[str] = []

    async def stream(messages: list[ModelMessage], info: AgentInfo):
        seen.append(info.instructions or "")
        returned = [
            part
            for message in messages
            for part in getattr(message, "parts", [])
            if isinstance(part, ToolReturnPart)
        ]
        if not returned:
            yield {0: DeltaToolCall(name="build_timetable", json_args='{"mode": "rebuild"}')}
            return
        yield "組みました。"

    agent = build_timetable_assistant()
    with agent.override(model=FunctionModel(stream_function=stream)):
        client.post(
            "/api/timetable/assistant",
            json=_body(messages=[{"role": "user", "content": "時間割を組んで"}]),
        )

    assert len(seen) == 2
    assert "まだ時間割は無い" in seen[0]
    assert "まだ時間割は無い" not in seen[1]
    assert "微分積分(1限)" in seen[1]


def test_assistant_lists_courses_mentioned_earlier_in_the_conversation():
    """前の発話で出た科目のコードを、開講情報から引いた科目名と一緒に載せる。"""
    seen: list[str] = []

    async def stream(messages: list[ModelMessage], info: AgentInfo):
        seen.append(info.instructions or "")
        yield "はい。"

    agent = build_timetable_assistant()
    with agent.override(model=FunctionModel(stream_function=stream)):
        client.post(
            "/api/timetable/assistant",
            json=_body(
                messages=[{"role": "user", "content": "さっきの科目を入れて"}],
                # 開講情報に無いコードは載せない(frontend の値を信じない)
                mentionedCodes=["Y000000006", "Z999999999"],
            ),
        )

    assert "【会話で出た科目】\n- Y000000006: 符号理論 前期 水3・2単位" in seen[0]
    assert "Z999999999" not in seen[0]


def test_assistant_sends_a_single_system_message_to_the_model(monkeypatch):
    """OpenAI 互換の口へは system メッセージを先頭の1本だけ送る(組み直した後も)。

    instructions を複数に分けて渡すと、PydanticAI は別々の system メッセージとして送る。
    Qwen のチャットテンプレートは先頭以外の system メッセージを受け付けず、時間割の
    アシスタントだけが即座に「応答の取得に失敗しました」になった。
    """
    import app.api.agent_stream as agent_stream
    from openai import AsyncOpenAI
    from pydantic_ai.models.openai import OpenAIChatModel
    from pydantic_ai.providers.openai import OpenAIProvider

    from app.agents import ModelPool

    sent: list[dict] = []

    def chunk(delta: dict, finish: str | None = None) -> str:
        body = {
            "id": "x", "object": "chat.completion.chunk", "created": 0, "model": "m",
            "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
        }
        return f"data: {json.dumps(body)}\n\n"

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append(json.loads(request.content))
        if len(sent) == 1:
            call = {
                "index": 0, "id": "call_1", "type": "function",
                "function": {"name": "build_timetable", "arguments": '{"mode": "rebuild"}'},
            }
            text = chunk({"role": "assistant", "tool_calls": [call]}) + chunk({}, "tool_calls")
        else:
            text = chunk({"role": "assistant", "content": "組みました。"}) + chunk({}, "stop")
        return httpx.Response(
            200, headers={"content-type": "text/event-stream"}, content=(text + "data: [DONE]\n\n").encode()
        )

    openai_client = AsyncOpenAI(
        api_key="k",
        base_url="http://llm.test/v1",
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )
    model = OpenAIChatModel("m", provider=OpenAIProvider(openai_client=openai_client))
    pool = ModelPool([model])
    monkeypatch.setattr(agent_stream, "model_pool", lambda: pool)

    resp = client.post(
        "/api/timetable/assistant",
        json=_body(
            messages=[
                {"role": "assistant", "content": "案内"},
                {"role": "user", "content": "時間割を組んで"},
            ]
        ),
    )

    assert resp.status_code == 200
    assert "error" not in resp.text
    assert len(sent) == 2
    for request in sent:
        roles = [m["role"] for m in request["messages"]]
        assert roles.count("system") == 1 and roles[0] == "system", roles
    assert "まだ時間割は無い" in sent[0]["messages"][0]["content"]
    assert "微分積分(1限)" in sent[1]["messages"][0]["content"]
