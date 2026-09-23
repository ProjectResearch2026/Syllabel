"""履修提案エージェントのテスト。design.md §7.2。

実サーバ(vllm / api-clean)には接続しない。モデルは `FunctionModel` で差し替え、
api-clean は `search_syllabi` を差し替える。判定・抽出・突合の各段階は、手組みの
合成カリキュラム(`test_curricula_requirements.py` と同じ構成を小さくしたもの)に
手組みの学生ケースを与えて確かめる。
"""

from functools import lru_cache

import pytest
from pydantic_ai import Agent
from pydantic_ai.exceptions import UnexpectedModelBehavior
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from app.agents import proposal_agent as pa
from app.agents.proposal_agent import (
    Candidate,
    CreditBudget,
    OfferedClass,
    ProposalContext,
    ProposalError,
    assemble_courses,
    assemble_proposal,
    attach_offerings,
    build_proposal_agent,
    build_proposal_prompt,
    fetch_offering_index,
    judge_requirements,
    registration_half,
    render_prompt,
    select_candidates,
)
from app.curricula.loader import LoadedCurriculum
from app.curricula.merge import MergedCurriculum, merge
from app.schemas.curriculum import Curriculum, LiberalArtsCurriculum
from app.schemas.offering import Offering
from app.schemas.proposal import ProposedCourse, TargetTerm, TimetableProposal
from app.schemas.student import Course as StudentCourse
from app.schemas.student import StudentProfile

ADMISSION_YEAR = 2024
OFFERING_YEAR = 2026


@pytest.fixture(autouse=True)
def reset_caches():
    build_proposal_agent.cache_clear()
    yield
    build_proposal_agent.cache_clear()


# --- 合成カリキュラム ---
#
# `test_curricula_requirements.py` と同じスロット構成(カスケード3系統)を保ったまま
# 単位数を小さくする。要件枠の `credits` の合計は `graduation.total_credits` に
# 一致させること(マージ時に検査される。§4.4.3)。


def _liberal_course(title: str, subcategory: str, type_: str, **kw) -> dict:
    return {
        "title": title,
        "category": "教養教育科目",
        "subcategory": subcategory,
        "type": type_,
        "credits": 2,
        "grade": 1,
        "term": "前期",
        "quarters": ["1Q", "2Q"],
        **kw,
    }


def _major_course(title: str, category: str, type_: str, grade: int = 1, **kw) -> dict:
    return {
        "title": title,
        "category": category,
        "type": type_,
        "credits": 2,
        "grade": grade,
        "term": "前期",
        "quarters": ["1Q", "2Q"],
        **kw,
    }


def _liberal_arts() -> LiberalArtsCurriculum:
    return LiberalArtsCurriculum.model_validate(
        {
            "admission_year": ADMISSION_YEAR,
            "liberal_arts_version": "until-2025",
            "requirement_slots": [
                {
                    "key": "liberal.buddhism", "name": "liberal.buddhism",
                    "credits": 2,
                    "accepts": {"subcategory": "「仏教の思想」科目", "type": "必修"},
                },
                {
                    "key": "liberal.elective", "name": "liberal.elective",
                    "credits": 4,
                    "accepts": {"category": "教養教育科目"},
                    "overflow_to": "free.all",
                },
            ],
            "courses": [
                _liberal_course("仏教の思想A", "「仏教の思想」科目", "必修"),
                _liberal_course("哲学", "人文科学系科目", "選択"),
                _liberal_course("英語総合1", "必修外国語科目", "必修"),
                _liberal_course("教職概論", "人文科学系科目", "随意"),
                _liberal_course("不開講の教養", "自然科学系科目", "選択"),
            ],
        }
    )


def _program(code: str = "01") -> Curriculum:
    return Curriculum.model_validate(
        {
            "program": {"code": code, "name": f"テスト課程{code}"},
            "admission_year": ADMISSION_YEAR,
            "graduation": {"total_credits": 16, "excluded_types": ["随意"]},
            "tracks": [
                {
                    "key": "info",
                    "name": "情報コース",
                    "constraints": [
                        {
                            "slot": "applied.elective",
                            "track_group": "情報系",
                            "pool": 2,
                            "min": 2,
                        }
                    ],
                }
            ],
            "requirement_slots": [
                {
                    "key": "basic.required", "name": "basic.required",
                    "credits": 4,
                    "accepts": {"category": "専門基礎科目", "type": "必修"},
                },
                {
                    "key": "applied.elective", "name": "applied.elective",
                    "credits": 2,
                    "accepts": {"category": "専門応用科目", "type": "選択"},
                    "overflow_to": "free.faculty",
                },
                {
                    "key": "related", "name": "related",
                    "credits": 0,
                    "accepts": {"category": "専門関連科目"},
                    "overflow_to": "free.faculty",
                },
                {
                    "key": "free.faculty", "name": "free.faculty",
                    "credits": 2,
                    "accepts": {
                        "category": ["専門基礎科目", "専門応用科目", "専門関連科目"]
                    },
                    "overflow_to": "free.all",
                },
                {"key": "free.all", "name": "free.all", "credits": 2, "accepts": {"category": "any"}},
            ],
            "registration_limits": {
                "by_semester": [
                    {"semesters": [1, 2], "max_credits_per_semester": 22},
                    {"semesters": [7, 8], "max_credits_per_year": 48},
                ],
                "notes": "通年科目は前期・後期で2分割して計算する。",
                "gpa_exception": "累積GPA3.5以上は申請により2単位まで拡大できる。",
            },
            "courses": [
                _major_course("微分積分", "専門基礎科目", "必修"),
                _major_course("線形代数", "専門基礎科目", "必修"),
                _major_course("数値解析", "専門応用科目", "選択", grade=2,
                              track_groups=["情報系"]),
                _major_course("教職実習", "専門応用科目", "随意"),
                _major_course("不開講の専門", "専門応用科目", "選択"),
            ],
        }
    )


def _other_program(code: str) -> Curriculum:
    """他課程。`courses` は専門関連科目として導出される(§4.4.3 手順2)。"""
    other = _program(code).model_dump()
    other["tracks"] = None
    other["courses"] = [_major_course("有機化学", "専門応用科目", "選択")]
    return Curriculum.model_validate(other)


def _offering(program_code: str, resolved: dict[str, list[str]]) -> Offering:
    return Offering.model_validate(
        {
            "offering_year": OFFERING_YEAR,
            "admission_year": ADMISSION_YEAR,
            "program_code": program_code,
            "resolved": resolved,
            # 不開講・名寄せ未解決の科目はコードを持たない(§5.1.4)
            "not_offered": [{"title": "不開講の専門", "reason": "2026年度は開講しない"}],
        }
    )


@lru_cache
def _loaded() -> LoadedCurriculum:
    """課程 01 の学生から見たロード結果。02・03 の科目は専門関連科目として入る。"""
    program = _program("01")
    others = [program, _other_program("02"), _other_program("03")]
    return LoadedCurriculum(
        curriculum=merge(program, _liberal_arts(), others),
        offerings={
            "00": _offering(
                "00",
                {
                    "仏教の思想A": ["G000000001", "G000000002"],
                    "哲学": ["G000000003"],
                    "英語総合1": ["G000000004"],
                    "教職概論": ["G000000005"],
                },
            ),
            "01": _offering(
                "01",
                {
                    "微分積分": ["Y000000001"],
                    "線形代数": ["Y000000002"],
                    "数値解析": ["Y000000003"],
                    "教職実習": ["Y000000004"],
                },
            ),
            "02": _offering("02", {"有機化学": ["Y000000005"]}),
            "03": _offering("03", {"有機化学": ["Y000000006"]}),
        },
    )


def _profile(grade: int = 1, **kw) -> StudentProfile:
    return StudentProfile(grade=grade, program="01", **kw)


def _passed(title: str) -> StudentCourse:
    return StudentCourse(
        title=title, year=2024, term="前期", credits=2, status="passed"
    )


def _offered(code: str, day: str | None = "月", period: int | None = 1) -> OfferedClass:
    return OfferedClass(
        syllabus_code=code,
        course_title="テスト科目",
        term="前期",
        day_of_week=day,
        period=period,
        room="1-101",
    )


def _titles(candidates) -> list[str]:
    return [c.course.title for c in candidates]


# ---------------------------------------------------------------------------
# エージェントのファクトリ(§7.2)
# ---------------------------------------------------------------------------


def test_build_proposal_agent_returns_agent():
    assert isinstance(build_proposal_agent(), Agent)


def test_build_proposal_agent_is_cached():
    """lru_cache により同一インスタンスが返る(build_model() と同じ遅延初期化)。"""
    assert build_proposal_agent() is build_proposal_agent()


def test_model_settings_disable_thinking():
    """思考(reasoning)を切る設定を持つこと。

    実機(DGX Spark + Qwen3.6-27B-FP8)では、思考を有効にすると900秒経っても
    `final_result` に到達しなかった(2026-09-09 計測)。`enable_thinking: false` は
    vLLM のチャットテンプレート引数であり、`extra_body` で素通しする。
    """
    settings = build_proposal_agent().model_settings
    assert settings["extra_body"] == {
        "chat_template_kwargs": {"enable_thinking": False}
    }


def test_model_settings_bound_the_response():
    """出力の打ち切りと待ち時間に上限を置くこと。

    `max_tokens` が小さいと構造化出力が途中で切れ、書き終えた科目までの
    提案になってしまう。
    """
    settings = build_proposal_agent().model_settings
    assert settings["max_tokens"] >= 4000
    assert settings["timeout"] > 0



def _proposal_response(messages, info: AgentInfo) -> ModelResponse:
    """構造化出力ツールを1回だけ呼ぶモデル。"""
    return ModelResponse(
        parts=[
            ToolCallPart(
                info.output_tools[0].name,
                {
                    "courses": [
                        {
                            "syllabusCode": "Y000000001",
                            "title": "微分積分",
                            "day": "月",
                            "period": 1,
                            "term": "前期",
                            "credits": 2,
                            "category": "必修",
                            "reason": "専門基礎必修の不足を埋めるため。",
                        }
                    ],
                    "totalCredits": 2,
                    "summary": "必修を優先して2単位を提案する。次学期のみが対象である。",
                },
            )
        ]
    )


@pytest.mark.asyncio
async def test_agent_returns_timetable_proposal():
    """モックモデルで `TimetableProposal` が構造化出力として返る(完了条件)。"""
    agent = build_proposal_agent()
    with agent.override(model=FunctionModel(_proposal_response)):
        result = await agent.run("提案して")

    assert isinstance(result.output, TimetableProposal)
    assert [c.syllabus_code for c in result.output.courses] == ["Y000000001"]
    assert result.output.total_credits == 2


@pytest.mark.asyncio
async def test_agent_has_no_tools():
    """ツールは持たせない。必要な情報は事前に集めてプロンプトで渡す(§7.2)。"""
    seen: dict = {}

    def capture(messages, info: AgentInfo) -> ModelResponse:
        seen["function_tools"] = info.function_tools
        seen["instructions"] = info.instructions
        return _proposal_response(messages, info)

    agent = build_proposal_agent()
    with agent.override(model=FunctionModel(capture)):
        await agent.run("提案して")

    assert seen["function_tools"] == []
    # 役割定義は instructions として毎回渡る
    assert "時間割" in seen["instructions"]
@pytest.mark.asyncio
async def test_model_settings_reach_the_model():
    """`MODEL_SETTINGS` が実際にモデル呼び出しまで届くこと。"""
    seen: dict = {}

    def capture(messages, info: AgentInfo) -> ModelResponse:
        seen["model_settings"] = info.model_settings
        return _proposal_response(messages, info)

    agent = build_proposal_agent()
    with agent.override(model=FunctionModel(capture)):
        await agent.run("提案して")

    assert seen["model_settings"]["extra_body"] == {
        "chat_template_kwargs": {"enable_thinking": False}
    }
    assert seen["model_settings"]["max_tokens"] >= 4000



@pytest.mark.asyncio
async def test_agent_does_not_retry_invalid_output():
    """検証に落ちた出力で作り直しをさせない(§7.2)。

    作り直しは1回4〜5分かかる。下書きの形式は vLLM が縛るため、検証に落ちるのは
    出力の上限で途中で切れたときであり、そのときは書き終えた科目までで確定版に
    する(`app/api/proposal.py`)。整理は backend が行う(`assemble_courses()`)。
    """
    calls = {"n": 0}

    def conflicting(messages, info: AgentInfo) -> ModelResponse:
        calls["n"] += 1
        course = {
            "title": "微分積分",
            "day": "月",
            "period": 1,
            "term": "前期",
            "credits": 2,
            "reason": "必修のため。",
        }
        return ModelResponse(
            parts=[
                ToolCallPart(
                    info.output_tools[0].name,
                    {
                        "courses": [course, {**course, "title": "線形代数"}],
                        "summary": "コマが重複した提案。",
                    },
                )
            ]
        )

    agent = build_proposal_agent()
    with agent.override(model=FunctionModel(conflicting)):
        with pytest.raises(UnexpectedModelBehavior):
            await agent.run("提案して")

    assert calls["n"] == 1


# ---------------------------------------------------------------------------
# 3. 候補科目の抽出(§7.2)
# ---------------------------------------------------------------------------


def test_select_candidates_excludes_zui_i_and_higher_grade():
    """`随意` と配当年次が学年を超える科目は候補にしない(§5.1.5)。"""
    titles = _titles(select_candidates(_loaded(), _profile(grade=1)))

    assert "教職実習" not in titles  # 随意(専攻科目)
    assert "教職概論" not in titles  # 随意(教養教育科目)
    assert "数値解析" not in titles  # 配当2年
    assert "微分積分" in titles


def test_select_candidates_includes_courses_from_allocation_grade_onward():
    """配当年次は「この年次から履修可能」であり、上級生にも候補として残る(§5.1.5)。"""
    titles = _titles(select_candidates(_loaded(), _profile(grade=2)))

    assert "数値解析" in titles
    assert "微分積分" in titles


def test_select_candidates_excludes_completed_courses():
    """既修得(合格)の科目は候補から外す。表記ゆれは正規化して突合する(§5.1.5)。"""
    profile = _profile(completed_courses=[_passed("微分積分"), _passed("英語総合１")])
    titles = _titles(select_candidates(_loaded(), profile))

    assert "微分積分" not in titles
    assert "英語総合1" not in titles  # 全角の「１」で突合できる
    assert "線形代数" in titles


def test_select_candidates_keeps_failed_courses():
    """不合格・履修辞退は未修得であり、再履修の候補として残す(要件§4.2)。"""
    profile = _profile(
        completed_courses=[
            StudentCourse(
                title="微分積分", year=2024, term="前期", credits=2, status="failed"
            ),
            StudentCourse(
                title="線形代数", year=2024, term="前期", credits=2, status="withdrawn"
            ),
        ]
    )
    titles = _titles(select_candidates(_loaded(), profile))

    assert "微分積分" in titles
    assert "線形代数" in titles


def test_select_candidates_excludes_courses_without_syllabus_code():
    """`not_offered` / `unresolved` の科目は候補から外す(§5.1.4)。"""
    titles = _titles(select_candidates(_loaded(), _profile()))

    assert "不開講の専門" not in titles  # not_offered
    assert "不開講の教養" not in titles  # offerings に載っていない(unresolved 相当)


def test_select_candidates_carries_syllabus_codes_from_offerings():
    """シラバスコードは開講年度ファイルの `resolved` から採る(§4.4.2)。"""
    candidates = {c.course.title: c for c in select_candidates(_loaded(), _profile())}

    assert candidates["仏教の思想A"].codes == ("G000000001", "G000000002")
    assert candidates["微分積分"].codes == ("Y000000001",)


def test_select_candidates_dedupes_derived_related_courses():
    """他課程から同名で導出された専門関連科目は1件に寄せ、課程コードの小さい方を採る。"""
    candidates = [
        c for c in select_candidates(_loaded(), _profile()) if c.course.title == "有機化学"
    ]

    assert len(candidates) == 1
    assert candidates[0].course.own is False
    assert candidates[0].course.source_program_code == "02"
    assert candidates[0].codes == ("Y000000005",)


def test_select_candidates_requires_grade():
    with pytest.raises(ProposalError):
        select_candidates(_loaded(), StudentProfile(program="01"))


# ---------------------------------------------------------------------------
# 4. 開講情報の一括取得と突合(§7.2 / §6.2)
# ---------------------------------------------------------------------------


def _fake_search(pages: list[list[dict]], calls: list[dict]):
    """`search_syllabi` の差し替え。offset をページ番号に読み替えて返す。"""

    async def fake_search_syllabi(**kwargs):
        calls.append(kwargs)
        page = kwargs["offset"] // kwargs["limit"]
        rows = pages[page] if page < len(pages) else []
        return {
            "count": len(rows),
            "limit": kwargs["limit"],
            "offset": kwargs["offset"],
            "results": rows,
        }

    return fake_search_syllabi


def _row(code: str, day: str = "月", period: int = 1, **kw) -> dict:
    return {
        "syllabus_code": code,
        "course_title": "テスト科目",
        "term": "前期",
        "day_of_week": day,
        "period": period,
        "room": "1-101",
        **kw,
    }


@pytest.mark.asyncio
async def test_fetch_offering_index_matches_by_code(monkeypatch):
    """一括取得した検索結果からコードで突合する。1件ずつ引かない(§7.2)。"""
    calls: list[dict] = []
    monkeypatch.setattr(
        pa,
        "search_syllabi",
        _fake_search([[_row("A000000001"), _row("A000000002")]], calls),
    )

    index = await fetch_offering_index(
        ["A000000001"], year=OFFERING_YEAR, page_size=2, max_pages=3
    )

    assert list(index) == ["A000000001"]  # 要らないコードは索引に残さない
    assert index["A000000001"].day_of_week == "月"
    assert index["A000000001"].period == 1
    assert index["A000000001"].room == "1-101"
    assert calls[0]["year"] == OFFERING_YEAR


def test_to_offered_class_reads_every_slot():
    """api-clean 0.3.0 の slots から全コマを読む。day_of_week / period は1コマ目だけ(§6.2)。"""
    offered = pa._to_offered_class(_row(
        "A000000001", day="金", period=4, term="後期",
        slots=[
            {"term": "後期", "day": "金", "period": 4},
            {"term": "後期", "day": "金", "period": 5},
        ],
    ))
    assert [(s.term, s.day, s.period) for s in offered.slots] == [
        ("後期", "金", 4), ("後期", "金", 5),
    ]


def test_to_offered_class_without_slots_uses_first_slot():
    """slots を返さない api-clean(0.2.0 以前)では、1コマ目だけを使う。"""
    offered = pa._to_offered_class(_row("A000000001", day="火", period=2))
    assert [(s.term, s.day, s.period) for s in offered.slots] == [("前期", "火", 2)]


def test_to_offered_class_with_empty_slots_has_no_slot():
    """slots が空(集中講義など)なら、コマを持たない。"""
    offered = pa._to_offered_class(_row("A000000001", day=None, period=None, slots=[]))
    assert offered.slots == ()


def test_format_class_writes_every_slot():
    """プロンプトの候補の行に全コマを書く。学期が違えばコマごとに学期を添える。"""
    consecutive = pa._to_offered_class(_row(
        "A000000001", term="後期",
        slots=[{"term": "後期", "day": "金", "period": 4}, {"term": "後期", "day": "金", "period": 5}],
    ))
    assert pa._format_class(consecutive) == "後期 / 金4・金5 / 1-101"
    two_terms = pa._to_offered_class(_row(
        "A000000002", term="3Q",
        slots=[{"term": "3Q", "day": "金", "period": 3}, {"term": "4Q", "day": "金", "period": 3}],
    ))
    assert pa._format_class(two_terms) == "3Q・4Q / 3Q金3・4Q金3 / 1-101"


@pytest.mark.asyncio
async def test_fetch_offering_index_paginates_until_short_page(monkeypatch):
    """返却件数が limit に満たなくなるまでページを辿る。"""
    calls: list[dict] = []
    pages = [[_row("A000000001"), _row("A000000002")], [_row("A000000003")]]
    monkeypatch.setattr(pa, "search_syllabi", _fake_search(pages, calls))

    index = await fetch_offering_index(
        ["A000000001", "A000000003"], year=OFFERING_YEAR, page_size=2, max_pages=5
    )

    assert sorted(index) == ["A000000001", "A000000003"]
    assert [c["offset"] for c in calls] == [0, 2]


@pytest.mark.asyncio
async def test_fetch_offering_index_stops_when_all_codes_found(monkeypatch):
    """必要なコードが揃った時点で打ち切る。"""
    calls: list[dict] = []
    pages = [[_row("A000000001"), _row("A000000002")], [_row("A000000003")]]
    monkeypatch.setattr(pa, "search_syllabi", _fake_search(pages, calls))

    index = await fetch_offering_index(
        ["A000000001"], year=OFFERING_YEAR, page_size=2, max_pages=5
    )

    assert list(index) == ["A000000001"]
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_fetch_offering_index_stops_at_max_pages(monkeypatch):
    """ページ上限で打ち切る(見つからないコードがあっても止まる)。"""
    calls: list[dict] = []
    pages = [[_row(f"A00000000{i}")] for i in range(1, 6)]
    monkeypatch.setattr(pa, "search_syllabi", _fake_search(pages, calls))

    index = await fetch_offering_index(
        ["Z999999999"], year=OFFERING_YEAR, page_size=1, max_pages=2
    )

    assert index == {}
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_fetch_offering_index_without_codes_makes_no_request(monkeypatch):
    calls: list[dict] = []
    monkeypatch.setattr(pa, "search_syllabi", _fake_search([], calls))

    assert await fetch_offering_index([], year=OFFERING_YEAR) == {}
    assert calls == []


@pytest.mark.asyncio
async def test_fetch_offering_index_tolerates_missing_fields(monkeypatch):
    """曜日・時限・教室の欠測、時限が文字列で来る場合を吸収する。"""
    calls: list[dict] = []
    rows = [
        {
            "syllabus_code": "A000000001",
            "course_title": "集中講義",
            "period": "",
            "room": None,
        },
        {
            "syllabus_code": "A000000002",
            "course_title": "文字列時限",
            "day_of_week": "火",
            "period": "3",
        },
        {"course_title": "コードなし"},
    ]
    monkeypatch.setattr(pa, "search_syllabi", _fake_search([rows], calls))

    index = await fetch_offering_index(
        ["A000000001", "A000000002"], year=OFFERING_YEAR, page_size=3
    )

    assert index["A000000001"].day_of_week is None
    assert index["A000000001"].period is None
    assert index["A000000001"].room is None
    assert index["A000000002"].period == 3


def test_attach_offerings_drops_courses_without_offering():
    """開講情報が引けない科目は時間割に置けないため候補から外す。"""
    candidates = [
        Candidate(course=_loaded().curriculum.courses[0], codes=("Y000000001",)),
        Candidate(course=_loaded().curriculum.courses[1], codes=("Y999999999",)),
    ]
    attached = attach_offerings(candidates, {"Y000000001": _offered("Y000000001")})

    assert len(attached) == 1
    assert attached[0].classes[0].syllabus_code == "Y000000001"


def test_attach_offerings_limits_classes_per_course():
    """同名多クラスの科目は曜日・時限・コードの昇順で上限件数まで載せる。"""
    codes = tuple(f"A00000000{i}" for i in range(1, 5))
    index = {
        "A000000001": _offered("A000000001", day="水", period=3),
        "A000000002": _offered("A000000002", day="月", period=2),
        "A000000003": _offered("A000000003", day="月", period=1),
        "A000000004": _offered("A000000004", day=None, period=None),
    }
    candidate = Candidate(course=_loaded().curriculum.courses[0], codes=codes)

    attached = attach_offerings([candidate], index, max_classes_per_course=2)

    assert [c.syllabus_code for c in attached[0].classes] == ["A000000003", "A000000002"]
    # 元のコード一覧は保つ(絞ったのは表示だけ)
    assert attached[0].codes == codes


# ---------------------------------------------------------------------------
# 4b. 履修可否(§6.1)
# ---------------------------------------------------------------------------


def _merged_with_aliases(aliases: list[str]) -> MergedCurriculum:
    """`program.name_aliases` を持つマージ済み履修要項。改称の吸収を確かめる用。"""
    raw = _program("01").model_dump()
    raw["program"]["name_aliases"] = aliases
    program = Curriculum.model_validate(raw)
    others = [program, _other_program("02"), _other_program("03")]
    return merge(program, _liberal_arts(), others)


def _fake_search_by_program(by_program: dict[str | None, list[str]], calls: list[dict]):
    """`program` ごとにコード一覧を返す `search_syllabi` の差し替え。

    api-clean の `program` は完全一致であり、対象課程を持たないシラバスは
    絞り込みから落ちる。その振る舞いを、辞書に無い課程名を空で返すことで模す。
    """

    async def fake_search_syllabi(**kwargs):
        calls.append(kwargs)
        codes = by_program.get(kwargs.get("program"), [])
        rows = [_row(c) for c in codes] if kwargs["offset"] == 0 else []
        return {
            "count": len(rows),
            "limit": kwargs["limit"],
            "offset": kwargs["offset"],
            "results": rows,
        }

    return fake_search_syllabi


def _fake_masters(names: list[str]):
    async def fake_get_masters():
        return {"course_program": [{"id": i, "name": n} for i, n in enumerate(names, 1)]}

    return fake_get_masters


def test_eligibility_allows_own_program():
    """対象課程に学生の課程が入っていれば履修可。"""
    e = pa.Eligibility(mine=frozenset({"A1"}), any_program=frozenset({"A1", "B1"}))
    assert e.allows("A1") is True


def test_eligibility_rejects_other_program_only():
    """他課程だけが対象のクラスは履修不可。"""
    e = pa.Eligibility(mine=frozenset({"A1"}), any_program=frozenset({"A1", "B1"}))
    assert e.allows("B1") is False


def test_eligibility_allows_course_without_program():
    """どの課程の結果にも現れないコードは課程指定なし。学部の科目として履修可。"""
    e = pa.Eligibility(mine=frozenset({"A1"}), any_program=frozenset({"A1", "B1"}))
    assert e.allows("G1") is True


@pytest.mark.asyncio
async def test_fetch_eligibility_splits_mine_and_any_program(monkeypatch):
    """課程ごとに引いた結果から、自課程の集合と全課程の集合を作る(§6.1)。"""
    calls: list[dict] = []
    monkeypatch.setattr(
        pa,
        "search_syllabi",
        _fake_search_by_program(
            {"テスト課程01": ["A1", "S1"], "テスト課程02": ["B1", "S1"]}, calls
        ),
    )
    monkeypatch.setattr(pa, "get_masters", _fake_masters(["テスト課程01", "テスト課程02"]))

    e = await pa.fetch_eligibility(_loaded().curriculum, year=OFFERING_YEAR)

    assert e.mine == frozenset({"A1", "S1"})
    assert e.any_program == frozenset({"A1", "B1", "S1"})
    assert e.allows("A1") is True      # 自課程
    assert e.allows("S1") is True      # 複数課程が対象(自課程を含む)
    assert e.allows("B1") is False     # 他課程のみ
    assert e.allows("G1") is True      # 課程指定なし
    assert {c["year"] for c in calls} == {OFFERING_YEAR}


@pytest.mark.asyncio
async def test_fetch_eligibility_treats_renamed_program_as_own(monkeypatch):
    """改称後の課程名も自課程として扱う(§4.4.2)。

    課程コード `06` は入学年度で名称が異なり(環境生態工学課程 / 環境科学課程)、
    api-clean は両方を別々の課程として持つ。片方だけで比べると取り違える。
    """
    calls: list[dict] = []
    monkeypatch.setattr(
        pa,
        "search_syllabi",
        _fake_search_by_program({"旧テスト課程01": ["A1"], "テスト課程02": ["B1"]}, calls),
    )
    monkeypatch.setattr(pa, "get_masters", _fake_masters(["旧テスト課程01", "テスト課程02"]))

    e = await pa.fetch_eligibility(_merged_with_aliases(["旧テスト課程01"]), year=OFFERING_YEAR)

    assert e.mine == frozenset({"A1"})
    assert e.allows("A1") is True


@pytest.mark.asyncio
async def test_fetch_eligibility_falls_back_when_masters_unavailable(monkeypatch):
    """課程一覧が引けないときは自課程だけで判定し、候補を絞りすぎない。"""
    calls: list[dict] = []
    monkeypatch.setattr(
        pa, "search_syllabi", _fake_search_by_program({"テスト課程01": ["A1"]}, calls)
    )

    async def boom():
        raise RuntimeError("api-clean に届かない")

    monkeypatch.setattr(pa, "get_masters", boom)

    e = await pa.fetch_eligibility(_loaded().curriculum, year=OFFERING_YEAR)

    # 自課程のコードは履修可。他は「課程指定なし」と同じ扱いになり落とさない
    assert e.mine == frozenset({"A1"})
    assert e.any_program == frozenset({"A1"})
    assert e.allows("A1") is True
    assert e.allows("B1") is True


def test_attach_offerings_drops_ineligible_classes():
    """履修登録できないクラスは候補から落とす(§6.1)。"""
    index = {
        "A000000001": _offered("A000000001", day="月", period=1),
        "A000000002": _offered("A000000002", day="火", period=2),
    }
    candidate = Candidate(
        course=_loaded().curriculum.courses[0], codes=("A000000001", "A000000002")
    )
    eligibility = pa.Eligibility(
        mine=frozenset({"A000000002"}), any_program=frozenset({"A000000001", "A000000002"})
    )

    attached = attach_offerings([candidate], index, eligibility=eligibility)

    assert [c.syllabus_code for c in attached[0].classes] == ["A000000002"]


def test_attach_offerings_filters_before_capping_class_count():
    """**上限で切る前に**履修可否で落とす(§6.1)。

    これが逆だと、他課程指定のクラスが早い時限に並ぶ科目(「英語総合1(A)」は
    火2が他課程・火3が知能情報メディア課程)で履修できるクラスが1つも残らない。
    実データでも4科目がこの状態になっていた。
    """
    index = {
        "OTHER00001": _offered("OTHER00001", day="火", period=2),
        "OTHER00002": _offered("OTHER00002", day="火", period=2),
        "MINE000001": _offered("MINE000001", day="火", period=3),
    }
    candidate = Candidate(
        course=_loaded().curriculum.courses[0],
        codes=("OTHER00001", "OTHER00002", "MINE000001"),
    )
    eligibility = pa.Eligibility(
        mine=frozenset({"MINE000001"}), any_program=frozenset(index)
    )

    attached = attach_offerings(
        [candidate], index, eligibility=eligibility, max_classes_per_course=2
    )

    assert [c.syllabus_code for c in attached[0].classes] == ["MINE000001"]
    # 絞り込みの母数も履修できるクラスだけで数える
    assert attached[0].matched == 1


def test_attach_offerings_keeps_classes_without_program():
    """課程指定なしのクラスは残す(全学向けの教養教育科目・学部名義のクラス)。"""
    index = {"G000000001": _offered("G000000001")}
    candidate = Candidate(course=_loaded().curriculum.courses[0], codes=("G000000001",))
    eligibility = pa.Eligibility(mine=frozenset(), any_program=frozenset({"Y000000009"}))

    attached = attach_offerings([candidate], index, eligibility=eligibility)

    assert [c.syllabus_code for c in attached[0].classes] == ["G000000001"]


def test_attach_offerings_drops_course_with_no_eligible_class():
    """履修できるクラスが1つも無い科目は候補から外す。"""
    index = {"OTHER00001": _offered("OTHER00001")}
    candidate = Candidate(course=_loaded().curriculum.courses[0], codes=("OTHER00001",))
    eligibility = pa.Eligibility(
        mine=frozenset(), any_program=frozenset({"OTHER00001"})
    )

    assert attach_offerings([candidate], index, eligibility=eligibility) == []


# ---------------------------------------------------------------------------
# 5. プロンプトの組み立て(§7.2)
# ---------------------------------------------------------------------------


def _rendered(
    profile: StudentProfile, *, wishes: str | None = None, track: str | None = None
) -> str:
    loaded = _loaded()
    selected = select_candidates(loaded, profile)
    index = {
        code: _offered(code) for candidate in selected for code in candidate.codes
    }
    return render_prompt(
        loaded,
        profile,
        judge_requirements(loaded, profile, track=track),
        attach_offerings(selected, index),
        wishes=wishes,
    )


def test_render_prompt_contains_shortfall_per_slot():
    """要件枠ごとの不足単位を渡す(要件§4.3.2 の単位数の最適化に要る)。"""
    prompt = _rendered(_profile(completed_courses=[_passed("微分積分")]))

    assert "卒業必要単位: 16" in prompt
    assert "basic.required: 必要 4 / 修得 2 / 不足 2" in prompt
    # `credits: 0` の通過点スロットは不足という概念を持たないため出さない
    assert "related:" not in prompt


def test_render_prompt_contains_registration_limits():
    """CAP(`registration_limits`)と、学年に対応するセメスターの印(§5.1.2)。"""
    prompt = _rendered(_profile(grade=1))

    assert "1・2セメスター: 各学期 22単位 ← 該当" in prompt
    assert "7・8セメスター: 通年で 48単位" in prompt
    assert "7・8セメスター: 通年で 48単位 ← 該当" not in prompt
    assert "通年科目は前期・後期で2分割して計算する。" in prompt
    assert "累積GPA3.5以上" in prompt


def test_render_prompt_contains_completed_and_retake_courses():
    profile = _profile(
        completed_courses=[
            _passed("微分積分"),
            StudentCourse(
                title="線形代数", year=2024, term="前期", credits=2, status="failed"
            ),
        ]
    )
    prompt = _rendered(profile)

    assert "修得済み: 微分積分(2単位)" in prompt
    assert "線形代数(failed)" in prompt


def test_render_prompt_contains_candidates_with_offering_info():
    """候補科目はシラバスコード・単位・曜日時限つきで並べる(§7.2)。"""
    prompt = _rendered(_profile())

    assert "[Y000000001] 微分積分 | 専門基礎科目 | 必修 | 2単位 | 配当1年〜 | 前期 / 月1 / 1-101" in prompt
    # 他課程から導出した専門関連科目はその旨を添える(§4.4.3)
    assert "有機化学 | 専門関連科目 | 選択 | 2単位 | 配当1年〜 | 他課程開講(専門関連科目)" in prompt


def test_render_prompt_contains_wishes():
    assert "1限は避けたい" in _rendered(_profile(), wishes="  1限は避けたい  ")
    assert "特になし" in _rendered(_profile())


def test_render_prompt_notes_unselected_track():
    """コース未選択のときは選択できるコースを示す(下限は判定していない。§4.4.5)。"""
    prompt = _rendered(_profile(grade=2))

    assert "コース未選択(選択できるコース: info(情報コース))" in prompt
    assert "コース別下限" not in prompt


def test_render_prompt_contains_track_constraints():
    """コースを選んでいれば、コース別下限の不足も渡す(§5.1.5 `tracks[].constraints`)。"""
    prompt = _rendered(_profile(grade=2), track="info")

    assert "選択コース: info" in prompt
    assert "コース別下限 applied.elective / 情報系: 必要 2 / 修得 0 / 不足 2" in prompt


def test_render_prompt_omits_class_remainder_note_when_all_shown():
    prompt = _rendered(_profile())

    assert "同名の別クラスが他に" not in prompt


def test_render_prompt_notes_truncated_classes():
    loaded = _loaded()
    candidate = next(
        c for c in select_candidates(loaded, _profile()) if c.course.title == "仏教の思想A"
    )
    index = {code: _offered(code, period=i + 1) for i, code in enumerate(candidate.codes)}
    attached = attach_offerings([candidate], index, max_classes_per_course=1)

    prompt = render_prompt(
        loaded, _profile(), judge_requirements(loaded, _profile()), attached
    )

    assert "(同名の別クラスが他に1件ある)" in prompt


def test_render_prompt_does_not_count_unmatched_codes_as_classes():
    """api-clean 側に見つからなかったコードを「別クラス」として数えない。"""
    loaded = _loaded()
    candidate = next(
        c for c in select_candidates(loaded, _profile()) if c.course.title == "仏教の思想A"
    )
    code = candidate.codes[0]
    attached = attach_offerings([candidate], {code: _offered(code)})

    prompt = render_prompt(
        loaded, _profile(), judge_requirements(loaded, _profile()), attached
    )

    assert attached[0].matched == 1
    assert "同名の別クラスが他に" not in prompt


# ---------------------------------------------------------------------------
# 全体の組み立て(§7.2)
# ---------------------------------------------------------------------------


@pytest.fixture
def loaded_curricula(monkeypatch):
    """`get_curricula()` を合成カリキュラムに差し替える。"""
    monkeypatch.setattr(
        pa, "get_curricula", lambda: {("01", ADMISSION_YEAR): _loaded()}
    )


@pytest.mark.asyncio
async def test_build_proposal_prompt_end_to_end(monkeypatch, loaded_curricula):
    """判定・抽出・突合を通してプロンプトが組み上がる(§7.2 の 1〜5)。"""
    calls: list[dict] = []
    codes = ("G000000001", "G000000003", "Y000000001", "Y000000002")
    rows = [_row(code) for code in codes]

    # 開講情報の一括取得(`program` なし)と、履修可否の課程別取得(`program` あり)の
    # 両方をこの1つで受ける。`Y000000005` は課程 02 だけが対象=履修できないクラス
    async def fake_search_syllabi(**kwargs):
        calls.append(kwargs)
        if kwargs["offset"] > 0:
            return {"count": 0, "limit": kwargs["limit"], "offset": kwargs["offset"], "results": []}
        program = kwargs.get("program")
        if program is None:
            picked = [*rows, _row("Y000000005")]
        elif program == "テスト課程01":
            picked = [_row(c) for c in codes if c.startswith("Y")]
        elif program == "テスト課程02":
            picked = [_row("Y000000005")]
        else:
            picked = []
        return {
            "count": len(picked),
            "limit": kwargs["limit"],
            "offset": kwargs["offset"],
            "results": picked,
        }

    monkeypatch.setattr(pa, "search_syllabi", fake_search_syllabi)
    monkeypatch.setattr(pa, "get_masters", _fake_masters(["テスト課程01", "テスト課程02"]))

    prompt = await build_proposal_prompt(
        _profile(completed_courses=[_passed("微分積分")]),
        ADMISSION_YEAR,
        wishes="午前中に授業を寄せたい",
        offering_year=OFFERING_YEAR,
    )

    assert "【学生情報】" in prompt
    assert "【卒業要件の充足状況】" in prompt
    assert "【履修登録単位数の上限】" in prompt
    assert "【修得済み科目】" in prompt
    assert "【候補科目】" in prompt
    assert "【希望条件】" in prompt
    assert "午前中に授業を寄せたい" in prompt
    # 修得済みの科目は候補に出さず、開講情報の引けた候補だけが並ぶ
    assert "[Y000000002] 線形代数" in prompt
    assert "[Y000000001] 微分積分" not in prompt
    # 課程指定なしの教養教育科目は残る(履修可否の判定で落とさない)
    assert "[G000000003] 哲学" in prompt
    # 他課程だけが対象のクラスはプロンプトに載らない(§6.1)
    assert "Y000000005" not in prompt
    # api-clean は年度を指定して一括で引く(1件ずつ引かない)
    assert all(c["year"] == OFFERING_YEAR for c in calls)
    # 開講情報を1本、履修可否を課程ごとに1本ずつ。候補のコード数には依らない
    assert [c.get("program") for c in calls] == [None, "テスト課程01", "テスト課程02"]


@pytest.mark.asyncio
async def test_build_proposal_prompt_uses_settings_offering_year(
    monkeypatch, loaded_curricula
):
    """開講年度の既定は `settings.offering_year`(§4.4.3)。"""
    calls: list[dict] = []
    monkeypatch.setattr(pa, "search_syllabi", _fake_search([[]], calls))

    # api-clean が空を返すので候補は無く、提案の前提が揃わない(ProposalError)
    with pytest.raises(ProposalError, match="候補科目がありません"):
        await build_proposal_prompt(_profile(), ADMISSION_YEAR)

    assert calls[0]["year"] == pa.get_settings().offering_year


@pytest.mark.asyncio
async def test_build_proposal_prompt_requires_program(loaded_curricula):
    with pytest.raises(ProposalError):
        await build_proposal_prompt(StudentProfile(grade=1), ADMISSION_YEAR)


@pytest.mark.asyncio
async def test_build_proposal_prompt_rejects_unknown_curriculum(loaded_curricula):
    with pytest.raises(ProposalError):
        await build_proposal_prompt(_profile(), 1999)


@pytest.mark.asyncio
async def test_proposal_agent_accepts_built_prompt(monkeypatch, loaded_curricula):
    """組み立てたプロンプトをそのまま渡して構造化出力が得られる(完了条件)。"""
    monkeypatch.setattr(
        pa, "search_syllabi", _fake_search([[_row("Y000000001")]], [])
    )
    prompt = await build_proposal_prompt(
        _profile(), ADMISSION_YEAR, offering_year=OFFERING_YEAR
    )

    seen: dict = {}

    def capture(messages, info: AgentInfo) -> ModelResponse:
        seen["prompt"] = messages[-1].parts[-1].content
        return _proposal_response(messages, info)

    agent = build_proposal_agent()
    with agent.override(model=FunctionModel(capture)):
        result = await agent.run(prompt)

    assert isinstance(result.output, TimetableProposal)
    assert seen["prompt"] == prompt


# ---------------------------------------------------------------------------
# 6. 対象学期(§7.2)と登録済み科目(§5.2.1)
# ---------------------------------------------------------------------------


def _registered(title: str) -> StudentCourse:
    return StudentCourse(
        title=title, year=2026, term="後期", credits=2, status="registered"
    )


def _offered_in(code: str, term: str | None, day: str = "月", period: int = 1) -> OfferedClass:
    return OfferedClass(
        syllabus_code=code,
        course_title="テスト科目",
        term=term,
        day_of_week=day,
        period=period,
        room="1-101",
    )


@pytest.mark.parametrize(
    ("term", "half"),
    [
        ("前期", "前期"),
        ("1Q", "前期"),
        ("２Ｑ", "前期"),
        ("通年", "前期"),  # 通年科目は前期に登録する
        ("サ集", "前期"),  # 夏期集中。後期より前に終わる
        ("後期", "後期"),
        ("3Q", "後期"),
        ("4Q", "後期"),
        ("集中", None),  # マスタに無い表記は判定しない
        (None, None),
    ],
)
def test_registration_half(term, half):
    assert registration_half(term) == half


def test_select_candidates_excludes_registered_courses():
    """登録済み(成績未確定)の科目は提案しない。再履修の候補にもしない(§5.2.1)。"""
    profile = _profile(completed_courses=[_registered("微分積分")])
    titles = _titles(select_candidates(_loaded(), profile))

    assert "微分積分" not in titles
    assert "線形代数" in titles


def test_select_candidates_uses_grade_of_target_term():
    """配当年次は対象学期の学年で絞る(年度をまたぐと成績表の学年より1つ上)。"""
    profile = _profile(grade=1)

    assert "数値解析" not in _titles(select_candidates(_loaded(), profile))
    assert "数値解析" in _titles(select_candidates(_loaded(), profile, grade=2))


def test_attach_offerings_keeps_only_classes_of_target_term():
    """対象学期の履修登録で登録するクラスだけを残す。学期不明のクラスは残す。"""
    codes = ("A000000001", "A000000002", "A000000003", "A000000004")
    index = {
        "A000000001": _offered_in("A000000001", "前期"),
        "A000000002": _offered_in("A000000002", "後期", period=2),
        "A000000003": _offered_in("A000000003", "通年", period=3),
        "A000000004": _offered_in("A000000004", None, period=4),
    }
    candidate = Candidate(course=_loaded().curriculum.courses[0], codes=codes)

    fall = attach_offerings([candidate], index, term="後期")
    spring = attach_offerings([candidate], index, term="前期")

    assert [c.syllabus_code for c in fall[0].classes] == ["A000000002", "A000000004"]
    assert [c.syllabus_code for c in spring[0].classes] == [
        "A000000001",
        "A000000003",
        "A000000004",
    ]


def test_attach_offerings_filters_term_before_capping_class_count():
    """学期の絞り込みは上限で切る前に掛ける。早い時限が他学期でも枠を失わない。"""
    codes = ("A000000001", "A000000002", "A000000003")
    index = {
        "A000000001": _offered_in("A000000001", "前期", period=1),
        "A000000002": _offered_in("A000000002", "前期", period=2),
        "A000000003": _offered_in("A000000003", "後期", period=3),
    }
    candidate = Candidate(course=_loaded().curriculum.courses[0], codes=codes)

    attached = attach_offerings([candidate], index, term="後期", max_classes_per_course=1)

    assert [c.syllabus_code for c in attached[0].classes] == ["A000000003"]


def test_attach_offerings_drops_course_without_class_in_target_term():
    candidate = Candidate(course=_loaded().curriculum.courses[0], codes=("A000000001",))
    index = {"A000000001": _offered_in("A000000001", "前期")}

    assert attach_offerings([candidate], index, term="後期") == []


def _rendered_for(profile: StudentProfile, target: TargetTerm) -> str:
    loaded = _loaded()
    selected = select_candidates(loaded, profile, grade=target.grade)
    index = {code: _offered(code) for candidate in selected for code in candidate.codes}
    return render_prompt(
        loaded,
        profile,
        judge_requirements(loaded, profile),
        attach_offerings(selected, index, term=target.term),
        target=target,
    )


def test_render_prompt_states_target_term_and_marks_its_semester_only():
    """対象学期を明示し、CAP はそのセメスターだけに印を付ける(§5.1.2)。"""
    target = TargetTerm(year=2026, term="前期", grade=1)
    prompt = _rendered_for(_profile(grade=1), target)

    assert "【対象学期】\n2026年度 前期(第1セメスター)" in prompt
    assert "1・2セメスター: 各学期 22単位 ← 該当" in prompt
    assert "学年: 1回生(対象学期の時点)" in prompt


def test_render_prompt_lists_registered_courses_apart_from_retakes():
    """登録済みは【登録済み科目】に載せ、【再履修の対象】には入れない。"""
    profile = _profile(
        completed_courses=[
            _registered("線形代数"),
            StudentCourse(
                title="微分積分", year=2024, term="前期", credits=2, status="failed"
            ),
        ]
    )
    prompt = _rendered_for(profile, TargetTerm(year=2026, term="前期", grade=1))

    assert "【登録済み科目】\n- 線形代数(2単位 / 2026年度 後期)" in prompt
    assert "微分積分(failed)" in prompt
    assert "線形代数(registered)" not in prompt


def test_render_prompt_without_target_term_marks_both_semesters():
    """対象学期を送らない旧い呼び出しでは、従来どおり学年の2学期に印を付ける。"""
    prompt = _rendered(_profile(grade=1))

    assert "【対象学期】\n指定なし" in prompt
    assert "【登録済み科目】\nなし" in prompt


# ---------------------------------------------------------------------------
# 7. 下書きから提案を組み上げる(§7.2)
# ---------------------------------------------------------------------------


def _context(classes: dict[str, ProposedCourse], remaining: float | None = None) -> ProposalContext:
    budget = CreditBudget(cap=remaining, registered=0) if remaining is not None else None
    return ProposalContext(prompt="", classes=classes, budget=budget, output_type=TimetableProposal)


def _cls(code: str, title: str, day: str | None, period: int | None, term: str = "後期", credits: float = 2) -> ProposedCourse:
    return ProposedCourse(
        syllabus_code=code, title=title, day=day, period=period, term=term,
        credits=credits, category="選択", reason="",
    )


def test_assemble_fills_values_from_candidates_and_keeps_order():
    ctx = _context({"A": _cls("A", "線形代数", "月", 1), "B": _cls("B", "統計", "火", 2)})
    courses, notes = assemble_courses([("B", "理由B"), ("A", "理由A")], ctx)

    assert [(c.syllabus_code, c.title, c.day, c.reason) for c in courses] == [
        ("B", "統計", "火", "理由B"),
        ("A", "線形代数", "月", "理由A"),
    ]
    assert notes == []


def test_assemble_drops_same_course_silently_and_ignores_unknown_codes():
    ctx = _context({"A1": _cls("A1", "英語", "月", 1), "A2": _cls("A2", "英語", "水", 1)})
    courses, notes = assemble_courses([("A1", "r"), ("A2", "r"), ("ZZ", "r"), ("A1", "r")], ctx)

    assert [c.syllabus_code for c in courses] == ["A1"]
    assert notes == []


def test_assemble_drops_overlapping_quarters():
    """後期と 3Q は同じコマを取り合う。1Q と 2Q は取り合わない(§5.3)。"""
    ctx = _context({
        "A": _cls("A", "後期の科目", "月", 1, "後期"),
        "B": _cls("B", "3Qの科目", "月", 1, "3Q"),
    })
    courses, notes = assemble_courses([("A", "r"), ("B", "r")], ctx)

    assert [c.syllabus_code for c in courses] == ["A"]
    assert notes == ["「3Qの科目」は「後期の科目」と月1限で開講期間が重なるため外しました。"]


def test_assemble_does_not_note_a_course_taken_in_another_class():
    """同名の別クラスを後で採った科目には「外した」と書かない。"""
    ctx = _context({
        "A": _cls("A", "線形代数", "月", 1),
        "B1": _cls("B1", "英語", "月", 1),
        "B2": _cls("B2", "英語", "火", 1),
    })
    courses, notes = assemble_courses([("A", "r"), ("B1", "r"), ("B2", "r")], ctx)

    assert [c.syllabus_code for c in courses] == ["A", "B2"]
    assert notes == []


def test_assemble_respects_remaining_credits():
    ctx = _context({"A": _cls("A", "a", "月", 1, credits=4), "B": _cls("B", "b", "火", 1, credits=2)}, remaining=4)
    courses, notes = assemble_courses([("A", "r"), ("B", "r")], ctx)

    assert [c.syllabus_code for c in courses] == ["A"]
    assert notes == ["「b」は対象学期に登録できる残り単位(4単位)を超えるため外しました。"]


def test_assemble_records_every_dropped_course_once():
    """外した科目は科目名ごとに1件ずつ、件数で打ち切らずにすべて記録する。"""
    classes = {"X": _cls("X", "基準", "月", 1)}
    classes |= {f"C{i}": _cls(f"C{i}", f"科目{i}", "月", 1) for i in range(8)}
    classes |= {"C0b": _cls("C0b", "科目0", "月", 1)}
    drafts = [("X", "r")] + [(f"C{i}", "r") for i in range(8)] + [("C0b", "r")]
    _, notes = assemble_courses(drafts, _context(classes))

    assert len(notes) == 8
    assert sum("「科目0」" in n for n in notes) == 1


def test_assemble_proposal_keeps_adjustments_out_of_summary():
    """外した科目・打ち切りの記録は summary に混ぜず、別に返す(学生に見せない)。"""
    ctx = _context({"A": _cls("A", "a", "月", 1), "B": _cls("B", "b", "月", 1)})
    proposal, adjustments = assemble_proposal(
        [("A", "r"), ("B", "r")], "方針。", ctx, truncated=True
    )

    assert proposal.total_credits == 2
    assert proposal.summary == "方針。"
    assert adjustments == [
        "「b」は「a」と月1限で開講期間が重なるため外しました。",
        "生成が最後まで完了しなかったため、書き終えた科目までで提案した。",
    ]


def test_assemble_proposal_uses_a_fixed_summary_when_none_was_written():
    ctx = _context({"A": _cls("A", "a", "月", 1)})
    proposal, _ = assemble_proposal([("A", "r")], None, ctx, truncated=True)

    assert proposal.summary == "時間割を提案しました。各科目の理由を確認してください。"


def test_render_prompt_uses_official_slot_names_not_keys():
    """【卒業要件の充足状況】には要件枠の公式の名前を書き、内部の key を出さない。"""
    loaded = _loaded()
    slots = [
        s.model_copy(update={"name": f"公式名-{s.key}"})
        for s in loaded.curriculum.requirement_slots
    ]
    renamed = LoadedCurriculum(
        curriculum=loaded.curriculum.model_copy(update={"requirement_slots": slots}),
        offerings=loaded.offerings,
    )
    profile = _profile()
    prompt = render_prompt(
        renamed, profile, judge_requirements(renamed, profile), [], target=None
    )

    assert "- 公式名-basic.required: 必要 4 / 修得 0 / 不足 4" in prompt
    assert "- basic.required:" not in prompt


def _typed(code: str, title: str, category: str, day: str = "火", period: int = 1, credits: float = 2) -> ProposedCourse:
    return ProposedCourse(
        syllabus_code=code, title=title, day=day, period=period, term="後期",
        credits=credits, category=category, reason="",
    )


def test_assemble_keeps_the_heavier_course_on_overlap():
    """重なったら必修 > 選択必修 > 選択 の順で重い方を残す(先に書いた方とは限らない)。"""
    ctx = _context({
        "E": _typed("E", "英語総合4", "選択"),
        "A": _typed("A", "アルゴリズム及び演習Ⅰ", "必修"),
    })
    courses, notes = assemble_courses([("E", "r"), ("A", "r")], ctx)

    assert [c.syllabus_code for c in courses] == ["A"]
    assert notes == [
        "「英語総合4」は「アルゴリズム及び演習Ⅰ」と火1限で開講期間が重なり、"
        "必修の「アルゴリズム及び演習Ⅰ」を優先したため外しました。"
    ]


def test_assemble_keeps_the_first_course_when_equally_heavy():
    ctx = _context({"X": _typed("X", "x", "選択"), "Y": _typed("Y", "y", "選択")})
    courses, _ = assemble_courses([("X", "r"), ("Y", "r")], ctx)

    assert [c.syllabus_code for c in courses] == ["X"]


def test_assemble_does_not_swap_when_the_swap_breaks_the_credit_cap():
    """入れ替えると残り単位を超えるなら入れ替えない。"""
    ctx = _context(
        {"E": _typed("E", "e", "選択", credits=1), "A": _typed("A", "a", "必修", credits=4)},
        remaining=2,
    )
    courses, notes = assemble_courses([("E", "r"), ("A", "r")], ctx)

    assert [c.syllabus_code for c in courses] == ["E"]
    assert "残り単位" in notes[0]


# --- 説明文の書き直し(§7.2.2) ---


@pytest.fixture
def summary_agent_cache():
    pa.build_summary_agent.cache_clear()
    yield
    pa.build_summary_agent.cache_clear()


@pytest.mark.asyncio
async def test_rewrite_summary_uses_the_settled_timetable(summary_agent_cache):
    seen = {}

    def model(messages, info: AgentInfo) -> ModelResponse:
        seen["prompt"] = messages[-1].parts[-1].content
        return ModelResponse(parts=[TextPart("  必修を中心に組んだ。  ")])

    ctx = _context({"A": _cls("A", "線形代数", "月", 1)})
    ctx = ProposalContext(
        prompt="", classes=ctx.classes, budget=None, output_type=TimetableProposal,
        requirements_text="- 専門基礎科目(必修): 必要 4 / 修得 0 / 不足 4",
    )
    proposal, _ = assemble_proposal([("A", "理由A")], "元の方針。", ctx)

    with pa.build_summary_agent().override(model=FunctionModel(model)):
        text = await pa.rewrite_summary(proposal, "元の方針。", ctx)

    assert text == "必修を中心に組んだ。"
    assert "- 線形代数 | 選択 | 2単位 | 後期 月1 | 理由: 理由A" in seen["prompt"]
    assert "【元の説明文】\n元の方針。" in seen["prompt"]
    assert "専門基礎科目(必修): 必要 4" in seen["prompt"]


@pytest.mark.asyncio
async def test_rewrite_summary_falls_back_on_failure(summary_agent_cache):
    def model(messages, info: AgentInfo) -> ModelResponse:
        raise RuntimeError("down")

    ctx = _context({"A": _cls("A", "a", "月", 1)})
    proposal, _ = assemble_proposal([("A", "r")], "元の方針。", ctx)

    with pa.build_summary_agent().override(model=FunctionModel(model)):
        assert await pa.rewrite_summary(proposal, "元の方針。", ctx) == "元の方針。"


def test_related_course_is_elective_for_the_student():
    """他課程の必修(専門関連科目)は、学生にとっては選択として扱う。

    開講元の課程での区分(必修)のまま扱うと、プロンプトでも組み上げでも
    他課程の必修が自課程の選択より重く見える。
    """
    loaded = _loaded()
    related = next(c for c in loaded.curriculum.courses if not c.own)
    course = related.model_copy(update={"type": "必修"})
    candidate = Candidate(course=course, codes=("Y000000005",), classes=(_offered("Y000000005"),), matched=1)

    assert pa.student_type(course) == "選択"
    assert pa._proposed_course(candidate, candidate.classes[0]).category == "選択"
    assert f"{course.title} | 専門関連科目 | 選択 |" in "\n".join(pa._format_candidates([candidate]))


# ---------------------------------------------------------------------------
# 8. 先修条件(§5.1.5 `prerequisites`)
# ---------------------------------------------------------------------------

from app.schemas.curriculum import Prerequisite  # noqa: E402


def _rule(**kw) -> Prerequisite:
    return Prerequisite.model_validate({"title": "数値解析", "notes": "原文。", **kw})


def _taken(title: str, year: int = 2024, term: str = "前期", status: str = "passed", credits: float = 2) -> StudentCourse:
    return StudentCourse(title=title, year=year, term=term, credits=credits, status=status)


def test_prerequisite_any_of_and_all_of():
    curriculum = _loaded().curriculum
    done = [_taken("微分積分")]

    assert pa.check_prerequisite(_rule(any_of=["微分積分", "線形代数"]), curriculum, done) == "met"
    assert pa.check_prerequisite(_rule(any_of=["線形代数"]), curriculum, done) == "unmet"
    assert pa.check_prerequisite(_rule(all_of=["微分積分", "線形代数"]), curriculum, done) == "unmet"
    # 不合格は修得ではない
    failed = [_taken("線形代数", status="failed")]
    assert pa.check_prerequisite(_rule(any_of=["線形代数"]), curriculum, failed) == "unmet"


def test_prerequisite_min_credits_total_and_by_category():
    curriculum = _loaded().curriculum
    done = [_taken("微分積分"), _taken("線形代数")]

    # accepts 省略は卒業要件総修得単位数
    assert pa.check_prerequisite(_rule(min_credits=[{"credits": 4}]), curriculum, done) == "met"
    assert pa.check_prerequisite(_rule(min_credits=[{"credits": 5}]), curriculum, done) == "unmet"
    by_category = {"credits": 4, "accepts": {"category": "専門基礎科目", "type": "必修"}}
    assert pa.check_prerequisite(_rule(min_credits=[by_category]), curriculum, done) == "met"
    other = {"credits": 2, "accepts": {"category": "専門応用科目"}}
    assert pa.check_prerequisite(_rule(min_credits=[other]), curriculum, done) == "unmet"


def test_prerequisite_as_of_counts_only_courses_until_then():
    """判定時点(as_of)の学期末までに修得した科目だけで数える。"""
    curriculum = _loaded().curriculum  # 2024年度入学
    done = [_taken("微分積分", 2024, "前期"), _taken("線形代数", 2025, "前期")]
    rule = _rule(as_of={"grade": 1, "term": "後期"}, min_credits=[{"credits": 4}])

    # 1年後期(2024年度後期)末までに修得したのは微分積分の2単位だけ
    assert pa.check_prerequisite(rule, curriculum, done) == "unmet"
    later = _rule(as_of={"grade": 2, "term": "前期"}, min_credits=[{"credits": 4}])
    assert pa.check_prerequisite(later, curriculum, done) == "met"


def test_prerequisite_is_unknown_when_not_decidable():
    curriculum = _loaded().curriculum
    # 原文しか無い条件
    assert pa.check_prerequisite(_rule(), curriculum, []) == "unknown"
    # 判定時点が提案する学期以降(まだ成績が出ていない)
    rule = _rule(as_of={"grade": 2, "term": "前期"}, min_credits=[{"credits": 2}])
    target = TargetTerm(year=2025, term="前期", grade=2)
    assert pa.check_prerequisite(rule, curriculum, [], target=target) == "unknown"


def test_prerequisite_min_credits_from_listed_courses():
    """`from` は列挙した科目の単位だけを数える(英語総合のうち4単位以上など)。"""
    curriculum = _loaded().curriculum
    done = [_taken("微分積分"), _taken("線形代数"), _taken("プログラミング演習")]
    listed = {"credits": 4, "from": ["微分積分", "線形代数"]}

    assert pa.check_prerequisite(_rule(min_credits=[listed]), curriculum, done) == "met"
    # 列挙していない科目の単位は数えない(総単位は6あっても、列挙分は2)
    narrow = {"credits": 4, "from": ["微分積分", "確率統計"]}
    assert pa.check_prerequisite(_rule(min_credits=[narrow]), curriculum, done) == "unmet"
    # 表記の揺れは突合の規則(NFKC・空白除去)で吸収する
    spaced = {"credits": 2, "from": ["微分 積分"]}
    assert pa.check_prerequisite(_rule(min_credits=[spaced]), curriculum, done) == "met"


def test_prerequisite_one_of_is_or_and_combines_with_and():
    """`one_of` はどれか1つを満たせばよく、行に直接書いた条件とは AND で結ぶ。"""
    curriculum = _loaded().curriculum
    one_of = [
        {"min_credits": [{"credits": 4, "from": ["微分積分", "線形代数"]}]},
        {"all_of": ["確率統計"]},
    ]

    assert pa.check_prerequisite(_rule(one_of=one_of), curriculum, [_taken("確率統計")]) == "met"
    both = [_taken("微分積分"), _taken("線形代数")]
    assert pa.check_prerequisite(_rule(one_of=one_of), curriculum, both) == "met"
    assert pa.check_prerequisite(_rule(one_of=one_of), curriculum, [_taken("微分積分")]) == "unmet"

    # 行の条件(any_of)と AND: one_of を満たしても行の条件が欠ければ満たさない
    rule = _rule(any_of=["プログラミング演習"], one_of=one_of)
    assert pa.check_prerequisite(rule, curriculum, [_taken("確率統計")]) == "unmet"
    done = [_taken("確率統計"), _taken("プログラミング演習")]
    assert pa.check_prerequisite(rule, curriculum, done) == "met"


def test_prerequisite_one_of_unknown_and_as_of_inheritance():
    """選択肢の判定時点が未到来なら、他が満たさない限り unknown。as_of は行から継ぐ。"""
    curriculum = _loaded().curriculum  # 2024年度入学
    target = TargetTerm(year=2025, term="前期", grade=2)
    one_of = [
        {"as_of": {"grade": 2, "term": "前期"}, "min_credits": [{"credits": 2}]},
        {"all_of": ["確率統計"]},
    ]
    rule = _rule(one_of=one_of)
    assert pa.check_prerequisite(rule, curriculum, [], target=target) == "unknown"
    assert pa.check_prerequisite(rule, curriculum, [_taken("確率統計")], target=target) == "met"

    # 行の as_of(1年前期末)を選択肢が継ぐ: 2024年度後期の修得は数えない
    inherited = _rule(
        as_of={"grade": 1, "term": "前期"},
        one_of=[{"all_of": ["確率統計"]}, {"all_of": ["線形代数"]}],
    )
    late = [_taken("確率統計", 2024, "後期")]
    assert pa.check_prerequisite(inherited, curriculum, late) == "unmet"


def test_english_prerequisites_on_2026_data():
    """2026年度入学の英語3科目は原文だけでなく判定できる(英語総合は各1単位)。"""
    from pathlib import Path

    from app.curricula.loader import load_curricula
    from app.settings import Settings

    root = Path(__file__).resolve().parents[2]
    loaded = load_curricula(
        Settings(curricula_dir=root / "curricula", offerings_dir=root / "offerings")
    )[("02", 2026)]
    rules = {p.title: p for p in loaded.curriculum.prerequisites}

    def english(*titles):
        return [_taken(t, 2026, "前期", credits=1) for t in titles]

    comm2 = rules["英語コミュニケーションⅡ"]
    check = lambda rule, done: pa.check_prerequisite(rule, loaded.curriculum, done)  # noqa: E731
    assert check(comm2, english("英語総合1（Ａ）", "英語総合1（Ｂ）")) == "met"
    assert check(comm2, english("英語総合1（Ａ）")) == "unmet"
    assert check(comm2, [_taken("英語コミュニケーションⅠ", 2026, "前期")]) == "met"

    gue = rules["Global Understanding in English"]
    assert check(gue, english("英語総合1（Ａ）", "英語総合1（Ｂ）", "英語総合2（Ａ）")) == "unmet"
    four = english("英語総合1（Ａ）", "英語総合1（Ｂ）", "英語総合2（Ａ）", "英語総合3")
    assert check(gue, four) == "met"
    assert check(rules["Forum"], four) == "met"


def test_check_prerequisites_drops_unmet_and_reports_all():
    loaded = _loaded()
    rules = [
        _rule(title="微分積分", any_of=["線形代数"], notes="線形代数を修得していること。"),
        _rule(title="線形代数", notes="原文のみの条件。"),
    ]
    curriculum = loaded.curriculum.model_copy(update={"prerequisites": rules})
    candidates = select_candidates(loaded, _profile())

    kept, results = pa.check_prerequisites(candidates, curriculum, [])

    assert "微分積分" not in _titles(kept)
    assert "線形代数" in _titles(kept)
    assert {(r.title, r.status) for r in results} == {("微分積分", "unmet"), ("線形代数", "unknown")}
    lines = pa._format_prerequisites(results)
    assert "- 微分積分: 満たしていない(候補から外した)。条件: 線形代数を修得していること。" in lines
    assert "- 線形代数: 確認が要る(システムでは判定できない)。条件: 原文のみの条件。" in lines


def test_seminar_prerequisite_on_real_data():
    """知能情報メディアセミナー(3年前期終了時点で80単位以上、専門基礎科目(必修)20単位以上)。

    スモークの合成プロファイル(83単位・専門基礎科目(必修)28単位)は満たし、
    3年前期の科目を落として78単位にすると満たさない。
    """
    from pathlib import Path

    import importlib.util

    from app.curricula.loader import load_curricula
    from app.settings import Settings

    root = Path(__file__).resolve().parents[2]
    spec = importlib.util.spec_from_file_location(
        "smoke_proposal", root / "backend" / "scripts" / "smoke_proposal.py"
    )
    smoke = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(smoke)
    _default_completed = smoke._default_completed
    loaded = load_curricula(
        Settings(curricula_dir=root / "curricula", offerings_dir=root / "offerings")
    )[("02", 2024)]
    seminar = next(p for p in loaded.curriculum.prerequisites if p.title == "知能情報メディアセミナー")
    target = TargetTerm(year=2026, term="後期", grade=3)
    completed = [StudentCourse.model_validate(c) for c in _default_completed()]

    assert pa.check_prerequisite(seminar, loaded.curriculum, completed, target=target) == "met"

    fewer = [c for c in completed if not (c.year == 2026 and c.status == "passed")]
    assert pa.check_prerequisite(seminar, loaded.curriculum, fewer, target=target) == "unmet"


def test_instructions_forbid_credit_arithmetic_in_summary():
    """説明文に単位数の合計や内訳を書かせない(2026-09-23 の実機で合計を誤った)。"""
    assert "単位数の合計や内訳の計算を書かない" in pa._INSTRUCTIONS
    assert "単位数の合計や内訳の計算を書かない" in pa._SUMMARY_INSTRUCTIONS


# ---------------------------------------------------------------------------
# 9. 単位が入る要件枠(§7.2.1)
# ---------------------------------------------------------------------------


def _real_smoke():
    """実データ(2024年度入学・知能情報メディア課程)とスモークの合成プロファイル。"""
    from pathlib import Path

    import importlib.util

    from app.curricula.loader import load_curricula
    from app.settings import Settings

    root = Path(__file__).resolve().parents[2]
    spec = importlib.util.spec_from_file_location(
        "smoke_proposal", root / "backend" / "scripts" / "smoke_proposal.py"
    )
    smoke = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(smoke)
    loaded = load_curricula(
        Settings(curricula_dir=root / "curricula", offerings_dir=root / "offerings")
    )[("02", 2024)]
    completed = [StudentCourse.model_validate(c) for c in smoke._default_completed()]
    return loaded.curriculum, completed


def test_slot_destinations_follow_kikan_and_overflow():
    """〈基幹〉でない社会科学系科目は基幹・社会の枠に入らない(2026-09-23 の実機で誤った)。

    合成プロファイルは基幹・社会が2単位不足、教養教育科目(選択)が2単位不足。
    """
    from app.curricula.requirements import judge

    curriculum, completed = _real_smoke()
    index = {c.title: c for c in curriculum.own_courses}
    titles = ["法学のすすめ", "現代社会と労働", "英語総合4", "知能情報メディアセミナー"]

    got = pa.slot_destinations(
        curriculum, completed, judge(curriculum, completed), [index[t] for t in titles]
    )

    assert got["法学のすすめ"] == "教養教育科目(選択必修〈基幹〉・社会)"
    assert got["現代社会と労働"] == "教養教育科目(選択)"
    assert got["英語総合4"] == "教養教育科目(必修・言語)"
    assert got["知能情報メディアセミナー"] == "専門応用科目(必修)"


def test_placed_slots_reflect_competition_between_courses():
    """同じ枠の科目を不足より多く選ぶと、超えた分は下流の枠(オールフリー)に入る。"""
    curriculum, completed = _real_smoke()
    index = {c.title: c for c in curriculum.own_courses}
    titles = ["アジアの文学B", "現代社会と労働", "現代社会とメディア"]
    courses = [ProposedCourse(title=t, credits=index[t].credits, reason="r") for t in titles]

    placed = pa.placed_slots(curriculum, completed, courses)

    assert sorted(placed.values()) == [
        "オールフリーゾーン", "オールフリーゾーン", "教養教育科目(選択)"
    ]


def test_candidate_lines_carry_destination():
    """候補の行に「入る枠」を添え、規則5で推測させないと書く。"""
    loaded = _loaded()
    profile = _profile()
    selected = select_candidates(loaded, profile)
    index = {code: _offered(code) for candidate in selected for code in candidate.codes}
    attached = attach_offerings(selected, index)
    requirements = judge_requirements(loaded, profile)
    destinations = pa.slot_destinations(
        loaded.curriculum, [], requirements, (c.course for c in attached)
    )

    prompt = render_prompt(loaded, profile, requirements, attached, destinations=destinations)

    assert "| 配当年次 | 入る枠 | 学期" in prompt
    assert "微分積分 | 専門基礎科目 | 必修 | 2単位 | 配当1年〜 | 入る枠: basic.required |" in prompt
    assert "「入る枠」に従い、区分や科目名から推測しない" in pa._INSTRUCTIONS


@pytest.mark.asyncio
async def test_rewrite_summary_gets_placed_slots(summary_agent_cache):
    seen = {}

    def model(messages, info: AgentInfo) -> ModelResponse:
        seen["prompt"] = messages[-1].parts[-1].content
        return ModelResponse(parts=[TextPart("書き直した。")])

    base = _context({"A": _cls("A", "線形代数", "月", 1)})
    ctx = ProposalContext(
        prompt="", classes=base.classes, budget=None, output_type=TimetableProposal,
        place=lambda courses: {pa.normalize_title(c.title): "専門基礎科目(必修)" for c in courses},
    )
    proposal, _ = assemble_proposal([("A", "理由A")], "元の方針。", ctx)

    with pa.build_summary_agent().override(model=FunctionModel(model)):
        await pa.rewrite_summary(proposal, "元の方針。", ctx)

    assert "- 線形代数 | 選択 | 2単位 | 入る枠: 専門基礎科目(必修) | 後期 月1" in seen["prompt"]
