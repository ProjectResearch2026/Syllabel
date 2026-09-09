"""`POST /api/proposal` のテスト。design.md §6.1 / §7.2。

実サーバ(vllm / api-clean)には接続しない。モデルは `FunctionModel` で差し替え、
api-clean は `search_syllabi` を差し替える。プロンプトの組み立て自体の検証は
`test_proposal_agent.py` が担うため、ここで確かめるのは HTTP の口としての振る舞い
(本文の受け取り、snapshot → result → done のイベント列、404 / 400 / 502、
学生データをログに出さないこと)である。

履修要項は `test_api_requirements.py` と同じ最小構成を `tmp_path` に組む。
"""

import json
import logging
from collections.abc import AsyncIterator

import httpx
import pytest
import yaml
from fastapi.testclient import TestClient
from pydantic_ai.messages import ModelMessage
from pydantic_ai.models.function import (
    AgentInfo,
    DeltaToolCall,
    DeltaToolCalls,
    FunctionModel,
)

import app.agents.proposal_agent as pa
import app.api.proposal as mod
from app.agents.proposal_agent import build_proposal_agent
from app.curricula.loader import get_curricula
from app.main import app
from app.schemas.proposal import ProposedCourse, TimetableProposal
from app.settings import get_settings

client = TestClient(app)

DONE_EVENT = 'data: {"done": true}\n\n'

# モデルが返す提案。`TimetableProposal` の検証を通る値にする(§7.2)
PROPOSAL = {
    "courses": [
        {
            "syllabusCode": "Y001006010",
            "title": "微分積分",
            "day": "月",
            "period": 2,
            "term": "通年",
            "credits": 4,
            "category": "必修",
            "reason": "専門基礎科目の必修が未修得のため。",
        },
        {
            "syllabusCode": "Y001006011",
            "title": "解析学",
            "day": "火",
            "period": 3,
            "term": "前期",
            "credits": 2,
            "category": "選択",
            "reason": "専門応用科目の不足を埋めるため。",
        },
    ],
    "totalCredits": 6,
    "summary": "卒業要件の不足枠から2科目を選んだ。先修要件を履修要項で確認すること。",
}

# 開講情報(api-clean の `GET /syllabi` が返す行。§6.2)
SYLLABI = [
    {
        "syllabus_code": "G260110004",
        "course_title": "哲学",
        "term": "前期",
        "day_of_week": "水",
        "period": 1,
        "room": "1-101",
    },
    {
        "syllabus_code": "Y001006010",
        "course_title": "微分積分",
        "term": "通年",
        "day_of_week": "月",
        "period": 2,
        "room": "1-102",
    },
    {
        "syllabus_code": "Y001006011",
        "course_title": "解析学",
        "term": "前期",
        "day_of_week": "火",
        "period": 3,
        "room": "1-103",
    },
]


# --- 最小構成の YAML(`test_api_requirements.py` と同じ構成)---


def _liberal_arts() -> dict:
    return {
        "admission_year": 2024,
        "liberal_arts_version": "until-2025",
        "requirement_slots": [
            {
                "key": "liberal.elective",
                "credits": 4,
                "accepts": {"category": "教養教育科目"},
                "overflow_to": "free.all",
            }
        ],
        "courses": [
            {
                "title": "哲学",
                "category": "教養教育科目",
                "subcategory": "人文科学系科目",
                "type": "選択",
                "credits": 2,
                "grade": 1,
                "term": "前期",
                "quarters": ["1Q", "2Q"],
            }
        ],
    }


def _program() -> dict:
    return {
        "program": {"code": "01", "name": "テスト課程01"},
        "admission_year": 2024,
        "graduation": {"total_credits": 12, "excluded_types": ["随意"]},
        "requirement_slots": [
            {
                "key": "basic.required",
                "credits": 4,
                "accepts": {"category": "専門基礎科目", "type": "必修"},
            },
            {
                "key": "applied.elective",
                "credits": 2,
                "accepts": {"category": "専門応用科目", "type": "選択"},
                "overflow_to": "free.all",
            },
            {"key": "free.all", "credits": 2, "accepts": {"category": "any"}},
        ],
        "registration_limits": {
            "by_semester": [{"semesters": [1, 2, 3, 4], "max_credits_per_semester": 22}]
        },
        "courses": [
            {
                "title": "微分積分",
                "category": "専門基礎科目",
                "type": "必修",
                "credits": 4,
                "grade": 1,
                "term": "通年",
            },
            {
                "title": "解析学",
                "category": "専門応用科目",
                "type": "選択",
                "credits": 2,
                "grade": 2,
                "term": "前期",
                "quarters": ["1Q", "2Q"],
            },
        ],
    }


def _offering(program_code: str, resolved: dict[str, list[str]]) -> dict:
    return {
        "offering_year": 2026,
        "admission_year": 2024,
        "program_code": program_code,
        "resolved": resolved,
    }


@pytest.fixture(autouse=True)
def minimal(tmp_path, monkeypatch):
    """最小構成の `curricula/` `offerings/` を組み、キャッシュを捨てる。"""
    cohort = tmp_path / "curricula" / "admission-2024"
    cohort.mkdir(parents=True)
    (cohort / "00-liberal-arts.yaml").write_text(
        yaml.safe_dump(_liberal_arts(), allow_unicode=True), encoding="utf-8"
    )
    (cohort / "01-test.yaml").write_text(
        yaml.safe_dump(_program(), allow_unicode=True), encoding="utf-8"
    )

    offerings = tmp_path / "offerings" / "2026" / "admission-2024"
    offerings.mkdir(parents=True)
    (offerings / "00-liberal-arts.yaml").write_text(
        yaml.safe_dump(
            _offering("00", {"哲学": ["G260110004"]}), allow_unicode=True
        ),
        encoding="utf-8",
    )
    (offerings / "01-test.yaml").write_text(
        yaml.safe_dump(
            _offering(
                "01", {"微分積分": ["Y001006010"], "解析学": ["Y001006011"]}
            ),
            allow_unicode=True,
        ),
        encoding="utf-8",
    )

    monkeypatch.setenv("CURRICULA_DIR", str(tmp_path / "curricula"))
    monkeypatch.setenv("OFFERINGS_DIR", str(tmp_path / "offerings"))

    def _clear():
        get_settings.cache_clear()
        get_curricula.cache_clear()
        build_proposal_agent.cache_clear()

    _clear()
    yield
    _clear()


@pytest.fixture(autouse=True)
def stub_api_clean(monkeypatch):
    """api-clean の `GET /syllabi` を差し替える(§6.2)。"""

    async def fake_search_syllabi(**kwargs) -> dict:
        return {"count": len(SYLLABI), "limit": kwargs.get("limit"), "results": SYLLABI}

    monkeypatch.setattr(pa, "search_syllabi", fake_search_syllabi)


@pytest.fixture
def spy_prompt(monkeypatch):
    """エージェントに渡されたプロンプトを記録する。処理はそのまま通す。"""
    captured = {}
    original = mod._stream_proposal

    def spy(prompt: str):
        captured["prompt"] = prompt
        return original(prompt)

    monkeypatch.setattr(mod, "_stream_proposal", spy)
    return captured


# --- ヘルパー ---


def _chunks(payload: dict, size: int = 24) -> list[str]:
    """提案の JSON を細切れにする。モデルが少しずつ返す様子を再現する。"""
    text = json.dumps(payload, ensure_ascii=False)
    return [text[i : i + size] for i in range(0, len(text), size)]


def _streaming_model(payload: dict = PROPOSAL) -> FunctionModel:
    """`payload` を構造化出力として少しずつ返すモデル。"""

    async def stream_fn(
        messages: list[ModelMessage], info: AgentInfo
    ) -> AsyncIterator[str | DeltaToolCalls]:
        name = info.output_tools[0].name
        for i, chunk in enumerate(_chunks(payload)):
            yield {0: DeltaToolCall(name=name if i == 0 else None, json_args=chunk)}

    return FunctionModel(stream_function=stream_fn)


def _events(body: str) -> list[dict]:
    """SSE レスポンス本文をイベントのリストにする。"""
    return [
        json.loads(event.removeprefix("data: "))
        for event in body.split("\n\n")
        if event.startswith("data: ")
    ]


def _body(
    *,
    program_code: str = "01",
    admission_year: int = 2024,
    grade: int | None = 2,
    preferences: str | None = None,
    completed: list[dict] | None = None,
) -> dict:
    return {
        "studentProfile": {
            # frontend が持つのは課程名であり、課程コードではない(§4.4.2)
            "grade": grade,
            "program": "テスト課程01",
            "completedCourses": completed if completed is not None else [],
        },
        "programCode": program_code,
        "admissionYear": admission_year,
        "preferences": preferences,
    }


def _post(**kwargs):
    """モデルを差し替えて `POST /api/proposal` を叩く。"""
    payload = kwargs.pop("payload", PROPOSAL)
    agent = build_proposal_agent()
    with agent.override(model=_streaming_model(payload)):
        return client.post("/api/proposal", json=_body(**kwargs))


# --- イベント列(完了条件)---


def test_returns_sse():
    """200 かつ content-type が text/event-stream であること。"""
    resp = _post()
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")


def test_streams_snapshot_then_result_then_done():
    """snapshot… → result → done の順で流れること(§7.2)。"""
    resp = _post()
    assert resp.status_code == 200

    events = _events(resp.text)
    kinds = [next(iter(e)) for e in events]
    assert kinds[-2:] == ["result", "done"]
    assert kinds.count("result") == 1
    assert kinds.count("done") == 1
    # 確定前の途中経過が1件以上流れていること
    assert kinds[:-2] and set(kinds[:-2]) == {"snapshot"}
    assert resp.text.endswith(DONE_EVENT)


def test_result_is_the_complete_proposal():
    """result は検証を通った完全な提案であること。"""
    result = _events(_post().text)[-2]["result"]
    assert result == TimetableProposal.model_validate(PROPOSAL).model_dump(
        by_alias=True
    )


def test_snapshot_has_the_proposal_schema_shape():
    """snapshot は 12 の書式(camelCase)で、キーの構成が result と同じであること。"""
    events = _events(_post().text)
    snapshots = [e["snapshot"] for e in events if "snapshot" in e]

    course_keys = {
        field.alias or name for name, field in ProposedCourse.model_fields.items()
    }
    for snapshot in snapshots:
        assert set(snapshot) == {"courses", "totalCredits", "summary"}
        for course in snapshot["courses"] or []:
            assert set(course) == course_keys


def test_snapshots_build_up_to_the_result():
    """snapshot は科目を積み上げていき、最後の1件が result と一致すること。"""
    events = _events(_post().text)
    snapshots = [e["snapshot"] for e in events if "snapshot" in e]
    result = events[-2]["result"]

    counts = [len(s["courses"] or []) for s in snapshots]
    assert counts == sorted(counts), "科目数が減っている"
    assert counts[-1] == len(PROPOSAL["courses"])
    assert snapshots[-1] == result


def test_snapshot_carries_only_completed_values():
    """途中の snapshot には、まだ届いていない値が載らないこと。

    値の途中で切れた文字列は載せない(欠けた語が一瞬表示されるのを避ける)。
    載っている値はすべて確定版と同じでなければならない。
    """
    events = _events(_post().text)
    result = events[-2]["result"]

    for event in events:
        snapshot = event.get("snapshot")
        if snapshot is None:
            continue
        for i, course in enumerate(snapshot["courses"] or []):
            for key, value in course.items():
                if value is not None:
                    assert value == result["courses"][i][key]


def test_no_duplicate_snapshots():
    """同じ内容の snapshot を続けて流さないこと。"""
    snapshots = [e["snapshot"] for e in _events(_post().text) if "snapshot" in e]
    for prev, current in zip(snapshots, snapshots[1:]):
        assert prev != current


# --- リクエスト本文 ---


def test_program_code_is_taken_from_the_body(spy_prompt):
    """課程コードは本文の programCode から採ること(§4.4.2)。

    `studentProfile.program` に入るのは成績表から採れる課程名であり、
    履修要項を引くキーにはならない。
    """
    assert _post().status_code == 200
    assert "課程: 01 テスト課程01" in spy_prompt["prompt"]


def test_preferences_reach_the_prompt(spy_prompt):
    """preferences が【希望条件】としてプロンプトに載ること。"""
    assert _post(preferences="午前中に授業を固めたい").status_code == 200
    assert "【希望条件】\n午前中に授業を固めたい" in spy_prompt["prompt"]


def test_preferences_are_optional(spy_prompt):
    """preferences が null でも受け付けること。"""
    assert _post(preferences=None).status_code == 200
    assert "【希望条件】\n特になし" in spy_prompt["prompt"]


def test_student_profile_is_required():
    """studentProfile を欠いた本文は 422 になること。"""
    resp = client.post(
        "/api/proposal", json={"programCode": "01", "admissionYear": 2024}
    )
    assert resp.status_code == 422


def test_completed_courses_reach_the_prompt(spy_prompt):
    """既修得科目が【修得済み科目】としてプロンプトに載ること。"""
    completed = [
        {
            "title": "微分積分",
            "year": 2024,
            "term": "通年",
            "credits": 4,
            "status": "passed",
        }
    ]
    assert _post(completed=completed).status_code == 200
    assert "修得済み: 微分積分(4単位)" in spy_prompt["prompt"]


# --- エラー ---


def test_unknown_curriculum_returns_404():
    """(programCode, admissionYear) が履修要項に無ければ 404(対応課程外)。"""
    resp = _post(program_code="99")
    assert resp.status_code == 404
    assert "99" in resp.json()["detail"]


def test_unknown_admission_year_returns_404():
    """入学年度だけが違う場合も 404 になること。"""
    assert _post(admission_year=2023).status_code == 404


def test_missing_grade_returns_400():
    """学年が無いと配当年次で候補を絞れないため 400。"""
    resp = _post(grade=None)
    assert resp.status_code == 400
    assert "学年" in resp.json()["detail"]


def test_upstream_failure_returns_502(monkeypatch):
    """api-clean に繋がらないときは 502 を返すこと。"""

    async def boom(**kwargs) -> dict:
        raise httpx.ConnectError("connection failed")

    monkeypatch.setattr(pa, "search_syllabi", boom)

    assert _post().status_code == 502


def test_emits_error_event_when_the_stream_fails(monkeypatch):
    """ストリーム中に例外が起きても error → done で締めること。"""

    class BoomAgent:
        def run_stream_events(self, *args, **kwargs):
            raise RuntimeError("boom")

    monkeypatch.setattr(mod, "build_proposal_agent", lambda: BoomAgent())

    resp = client.post("/api/proposal", json=_body())
    assert resp.status_code == 200
    assert '"error"' in resp.text
    assert "boom" not in resp.text
    assert resp.text.endswith(DONE_EVENT)


# --- 学生データの取り扱い(§4.2.3)---


def test_does_not_log_student_data(caplog):
    """リクエスト本文・応答内容をログに出さないこと(§4.2.3)。"""
    completed = [
        {
            "title": "極秘科目",
            "year": 2024,
            "term": "前期",
            "credits": 2,
            "status": "passed",
        }
    ]
    with caplog.at_level(logging.DEBUG):
        resp = _post(completed=completed)

    assert resp.status_code == 200
    assert "極秘科目" not in caplog.text
    assert PROPOSAL["summary"] not in caplog.text
    assert "テスト課程01" not in caplog.text


# --- 出力の作り直し(§7.2 の output retries)---


def test_retry_after_invalid_output_streams_the_second_attempt():
    """検証に落ちて作り直した場合、確定版は2回目の出力になること。

    コマ重複は `TimetableProposal` の検証で弾かれ、pydantic-ai がモデルに作り直しを
    要求する(`retries={"output": ...}`)。1回目の断片を引きずったまま溜め続けると
    JSON が壊れるため、snapshot は作り直しのたびに溜め直す。
    """
    conflicting = {
        "courses": [
            dict(PROPOSAL["courses"][0]),
            # 1科目目と同じ曜日・時限・学期。`check_no_time_conflict` に落ちる
            dict(PROPOSAL["courses"][1], day="月", period=2, term="通年"),
        ],
        "totalCredits": 6,
        "summary": "コマが重複した提案。",
    }
    attempts: list[dict] = [conflicting, PROPOSAL]

    async def stream_fn(
        messages: list[ModelMessage], info: AgentInfo
    ) -> AsyncIterator[str | DeltaToolCalls]:
        payload = attempts.pop(0) if attempts else PROPOSAL
        name = info.output_tools[0].name
        for i, chunk in enumerate(_chunks(payload)):
            yield {0: DeltaToolCall(name=name if i == 0 else None, json_args=chunk)}

    agent = build_proposal_agent()
    with agent.override(model=FunctionModel(stream_function=stream_fn)):
        resp = client.post("/api/proposal", json=_body())

    assert resp.status_code == 200
    assert not attempts, "作り直しが行われていない"

    events = _events(resp.text)
    assert [next(iter(e)) for e in events][-2:] == ["result", "done"]
    assert events[-2]["result"] == TimetableProposal.model_validate(
        PROPOSAL
    ).model_dump(by_alias=True)

    # 作り直しの時点で snapshot は空の提案から積み直され、科目数が一度戻る
    snapshots = [e["snapshot"] for e in events if "snapshot" in e]
    assert snapshots[-1] == events[-2]["result"]
    counts = [len(s["courses"] or []) for s in snapshots]
    assert counts != sorted(counts), "溜め直していない"


# --- snapshot の組み立て ---


def test_snapshot_returns_none_for_unreadable_fragments():
    """JSON として読めない断片では snapshot を作らないこと。"""
    assert mod._snapshot("") is None
    assert mod._snapshot("申し訳ありませんが") is None
    assert mod._snapshot('{"courses": 3') is None
    # 形は読めても値が型に合わないものは載せない
    assert mod._snapshot('{"courses": [{"period": "月曜"}]}') is None


def test_snapshot_keeps_partial_courses():
    """途中まで届いた科目も、届いた値だけを載せて snapshot に含めること。"""
    snapshot = mod._snapshot('{"courses": [{"title": "微分積分", "day": "月"')
    assert snapshot == {
        "courses": [
            {
                "syllabusCode": None,
                "title": "微分積分",
                "day": "月",
                "period": None,
                "term": None,
                "credits": None,
                "category": None,
                "reason": None,
            }
        ],
        "totalCredits": None,
        "summary": None,
    }
