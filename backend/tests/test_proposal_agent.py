"""履修提案エージェントのテスト。design.md §7.2。

実サーバ(vllm / api-clean)には接続しない。モデルは `FunctionModel` で差し替え、
api-clean は `search_syllabi` を差し替える。判定・抽出・突合の各段階は、手組みの
合成カリキュラム(`test_curricula_requirements.py` と同じ構成を小さくしたもの)に
手組みの学生ケースを与えて確かめる。
"""

from functools import lru_cache

import pytest
from pydantic_ai import Agent
from pydantic_ai.messages import ModelResponse, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from app.agents import proposal_agent as pa
from app.agents.proposal_agent import (
    Candidate,
    OfferedClass,
    ProposalError,
    attach_offerings,
    build_proposal_agent,
    build_proposal_prompt,
    fetch_offering_index,
    judge_requirements,
    render_prompt,
    select_candidates,
)
from app.curricula.loader import LoadedCurriculum
from app.curricula.merge import MergedCurriculum, merge
from app.schemas.curriculum import Curriculum, LiberalArtsCurriculum
from app.schemas.offering import Offering
from app.schemas.proposal import TimetableProposal
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
                    "key": "liberal.buddhism",
                    "credits": 2,
                    "accepts": {"subcategory": "「仏教の思想」科目", "type": "必修"},
                },
                {
                    "key": "liberal.elective",
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
                    "key": "basic.required",
                    "credits": 4,
                    "accepts": {"category": "専門基礎科目", "type": "必修"},
                },
                {
                    "key": "applied.elective",
                    "credits": 2,
                    "accepts": {"category": "専門応用科目", "type": "選択"},
                    "overflow_to": "free.faculty",
                },
                {
                    "key": "related",
                    "credits": 0,
                    "accepts": {"category": "専門関連科目"},
                    "overflow_to": "free.faculty",
                },
                {
                    "key": "free.faculty",
                    "credits": 2,
                    "accepts": {
                        "category": ["専門基礎科目", "専門応用科目", "専門関連科目"]
                    },
                    "overflow_to": "free.all",
                },
                {"key": "free.all", "credits": 2, "accepts": {"category": "any"}},
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

    `max_tokens` が小さいと構造化出力が途中で切れ、検証に落ちて作り直し
    (`OUTPUT_RETRIES`)が走り、所要時間が倍以上になる。
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
async def test_agent_retries_on_time_conflict():
    """コマ重複は `TimetableProposal` の検証で弾かれ、モデルに作り直させる(§7.2)。"""
    calls = {"n": 0}

    def conflicting_then_valid(messages, info: AgentInfo) -> ModelResponse:
        calls["n"] += 1
        if calls["n"] == 1:
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
                            "totalCredits": 4,
                            "summary": "コマが重複した提案。検証で弾かれる。",
                        },
                    )
                ]
            )
        return _proposal_response(messages, info)

    agent = build_proposal_agent()
    with agent.override(model=FunctionModel(conflicting_then_valid)):
        result = await agent.run("提案して")

    assert calls["n"] == 2
    assert len(result.output.courses) == 1


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
