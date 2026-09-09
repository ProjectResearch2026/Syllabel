"""履修提案エージェント。design.md §7.2。

学生プロファイル・履修要項・開講情報から**次学期の時間割**(`TimetableProposal`)を
構造化出力するエージェントと、そのプロンプトを組み立てる関数を持つ。

**エージェントはツールを持たない。** 提案に要る情報(要件枠ごとの不足単位・候補科目・
開講情報)は backend が事前に集めてプロンプトへ入れる(§7.2 のシーケンス)。tool calling を
伴うのは提案後の対話(`POST /api/chat/proposal`、§7.3)であり、そちらは `chat_agent` の
責務である。

プロンプトの組み立ては次の順に行い、各段階を単体テストできるよう関数に分ける:

1. `resolve_curriculum()` — `get_curricula()[(課程コード, 入学年度)]` でマージ済みの
   履修要項を引く(§4.4.3)
2. `judge_requirements()` — 要件充足判定(§4.4.5)を **HTTP を経由せず直接呼び**、
   要件枠ごとの不足単位を得る。要件§4.3.2 の「単位数の最適化」はこの値を要する
3. `select_candidates()` — 履修可能な候補科目を絞る(`type != "随意"` / 配当年次 /
   未修得)
4. `fetch_offering_index()` + `attach_offerings()` — 候補のシラバスコードを開講年度
   ファイルの `resolved` から採り(§4.4.2)、曜日・時限・教室は api-clean から
   **一括取得**してコードで突合する(§7.2)
5. `render_prompt()` — 上記に CAP(`registration_limits`)・修得済み一覧・希望条件を
   加えて1つの文字列にする

**学生データはログに出さない(§4.2.3)。** 本モジュールのログは件数だけを扱う。
"""

import logging
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from functools import lru_cache

from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModelSettings

from app.agents import build_model
from app.agents.tools import search_syllabi
from app.curricula.loader import LoadedCurriculum, get_curricula
from app.curricula.merge import MergedCourse, MergedCurriculum
from app.curricula.requirements import (
    RequirementsResult,
    judge,
    normalize_title,
)
from app.schemas.proposal import TimetableProposal
from app.schemas.student import Course as StudentCourse
from app.schemas.student import StudentProfile
from app.settings import get_settings

logger = logging.getLogger(__name__)

# 構造化出力の検証(コマ重複を含む `TimetableProposal` の model_validator)に落ちたとき、
# 検証エラーをモデルへ返して作り直させる回数(§7.2)。pydantic-ai 2 系では
# `Agent(output_retries=...)` が `retries={"output": ...}` に統合されている
OUTPUT_RETRIES = 2

# 実機計測(2026-09-09 / DGX Spark + Qwen3.6-27B-FP8)に基づく推論の設定。
#
# **思考(reasoning)を切る。** 思考を有効にすると、候補科目 643行・約39,000トークンの
# プロンプトに対して600トークン生成しても本文へ到達せず、900秒待っても提案が出なかった
# (vLLM 側は 7.3 tokens/s で生成を続けており、停止ではなく思考の継続だった)。
# `enable_thinking: false` を渡すと `final_result` の生成が即座に始まる。提案は
# 【候補科目】からの選択と転記が主で、必要な判断材料は backend が事前に揃えている(§7.2)
# ため、長い思考を要する課題ではない。
#
# **`max_tokens` は出力が途中で切れない大きさにする。** 途中で切れると構造化出力の検証に
# 落ち、`OUTPUT_RETRIES` の作り直しが走って所要時間が倍以上になる。CAP(各学期22単位)
# いっぱいの11科目でおよそ1,900トークンであり、2倍の余裕を見る。
#
# **`timeout` を置く。** 上限に達したときに無言で待たせず、502 相当で返せるようにする。
#
# なお生成は約7.3 tokens/s であり、**所要時間は出力トークン数でほぼ決まる**
# (プロンプト39,000トークンのプリフィルは約20秒)。
MODEL_SETTINGS = OpenAIChatModelSettings(
    extra_body={"chat_template_kwargs": {"enable_thinking": False}},
    max_tokens=4000,
    timeout=900.0,
)

# api-clean の `GET /syllabi` を一括取得するときの1ページあたりの件数と、辿るページ数の
# 上限。候補科目は多い課程・学年で 1,000 コード規模になるため1件ずつ引かず(§7.2)、
# 応答の `count` が `limit` に満たなくなるか、必要なコードが揃った時点で打ち切る
PAGE_SIZE = 500
MAX_PAGES = 40

# 同一科目名で多数のクラスが開講される科目(「英語総合1(A)」で22クラス、
# 「スポーツ技術学A」で32クラス)がプロンプトを占有しないよう、1科目あたりに
# 載せるクラス数を絞る。曜日・時限・コードの昇順で選ぶため候補は毎回同じになる
MAX_CLASSES_PER_COURSE = 6

_INSTRUCTIONS = (
    "あなたは龍谷大学先端理工学部の履修登録を支援するAIアシスタントです。\n"
    "与えられた学生の状況から、**次の学期に履修する時間割**を提案してください。\n"
    "\n"
    "提案は次の規則に従ってください。\n"
    "1. 提案してよいのは【候補科目】に挙がっている科目だけである。"
    "一覧に無い科目名やシラバスコードを作り出してはならない。\n"
    "2. 各科目の syllabusCode・title・credits・term・day・period は、"
    "【候補科目】の行に書かれている値をそのまま転記する。推測して補わない。\n"
    "3. 同じ曜日・時限・学期に2科目以上を割り当ててはならない。"
    "曜日・時限が「未定」の科目(集中講義など)はこの制約の対象外とする。\n"
    "4. 合計単位数は【履修登録単位数の上限】を超えてはならない。\n"
    "5. 【卒業要件の充足状況】で不足している要件枠を優先して埋める。"
    "不足単位を大きく超える科目数を詰め込まない一方、"
    "卒業に必要な単位を取り残さない。過不足のない分量にすること。\n"
    "6. 【修得済み科目】に挙がっている科目は再度提案しない。"
    "ただし不合格・履修辞退の科目は未修得であり、提案してよい。\n"
    "7. 【希望条件】がある場合はそれを尊重する。"
    "卒業要件と両立しない希望は、summary でその旨を説明する。\n"
    "8. reason には、その科目を勧める理由(どの要件枠を埋めるか、"
    "希望条件のどれに合うか)を40字以内の1文で書く。\n"
    "9. summary には提案全体の方針と履修上の注意点を2〜4文で書く。"
    "先修要件・進級要件・抽選科目など確認が要る点があれば触れる。"
)


class ProposalError(ValueError):
    """提案の前提が揃わない(未知の課程・入学年度、学年の欠落)。"""


@lru_cache
def build_proposal_agent() -> Agent[None, TimetableProposal]:
    """履修提案エージェントを生成する。`build_model()`(§6.3)と同じ遅延初期化。

    ツールは登録しない(§7.2)。役割定義は毎リクエストで変わらないため
    `instructions` に固定で持たせ、学生ごとの事実は `run()` のプロンプトで渡す。
    推論の設定は `MODEL_SETTINGS` を参照(思考を切る理由と実機の計測値)。
    """
    return Agent(
        build_model(),
        output_type=TimetableProposal,
        retries={"output": OUTPUT_RETRIES},
        instructions=_INSTRUCTIONS,
        model_settings=MODEL_SETTINGS,
    )


# --- 1. 履修要項の解決(§4.4.3) ---


def resolve_curriculum(program_code: str, admission_year: int) -> LoadedCurriculum:
    """(課程コード, 入学年度)でマージ済みの履修要項を引く。

    Raises:
        ProposalError: 当該の組み合わせがロードされていない場合。
    """
    loaded = get_curricula().get((program_code, admission_year))
    if loaded is None:
        raise ProposalError(
            f"履修要項がありません: 課程コード {program_code} / {admission_year}年度入学"
        )
    return loaded


# --- 2. 要件充足判定(§4.4.5) ---


def judge_requirements(
    loaded: LoadedCurriculum, profile: StudentProfile, *, track: str | None = None
) -> RequirementsResult:
    """要件枠ごとの不足単位を得る。`POST /api/requirements` を経由しない(§4.4.5)。"""
    return judge(loaded.curriculum, profile.completed_courses, track=track)


# --- 3. 候補科目の抽出(§5.1.5) ---


@dataclass(frozen=True)
class OfferedClass:
    """api-clean の `GET /syllabi` が返す開講クラス1件のうち、時間割に要る値(§6.2)。"""

    syllabus_code: str
    course_title: str
    term: str | None = None
    day_of_week: str | None = None
    period: int | None = None
    room: str | None = None


@dataclass(frozen=True)
class Candidate:
    """提案の候補にできる科目1件と、その開講クラス。

    `codes` は開講年度ファイルの `resolved` が持つシラバスコード(§4.4.2)、
    `classes` は api-clean から引いた開講情報で、`attach_offerings()` が埋める。
    `matched` は突合できたクラス数であり、`classes` を `MAX_CLASSES_PER_COURSE` で
    絞ったときに「他に何件あるか」を書くのに使う(コード数から引くと、api-clean 側に
    見つからなかったコードまで別クラスとして数えてしまう)。
    """

    course: MergedCourse
    codes: tuple[str, ...]
    classes: tuple[OfferedClass, ...] = ()
    matched: int = 0


def _passed_titles(completed: Sequence[StudentCourse]) -> set[str]:
    """修得済み(合格)の科目名を正規化して集める。

    不合格・履修辞退は**修得していない**ため除く。再履修は提案の対象になる
    (要件§4.2 の単位計算と同じく `passed` だけを修得とみなす)。
    """
    return {normalize_title(c.title) for c in completed if c.status == "passed"}


def select_candidates(
    loaded: LoadedCurriculum, profile: StudentProfile
) -> list[Candidate]:
    """履修可能な候補科目を絞る(§7.2)。

    次のすべてを満たす科目を候補とする:

    - `type != "随意"` — 随意科目は卒業要件単位に算入しない(§5.1.5 `excluded_types`)
    - `course.grade <= 学生の学年` — 配当年次は「この年次**から**履修可能」(§5.1.5)
    - 未修得 — 既修得科目と科目名で突合する(表記ゆれは `normalize_title()` が吸収)
    - シラバスコードを持つ — `not_offered`(当年度不開講)/ `unresolved`(名寄せ未解決)
      の科目は時間割に置けないため候補から外す(§5.1.4)

    マージ済みの `courses` には他課程から導出した同名の専門関連科目が複数入り得る
    (§4.4.3)。ここでは科目名で1件に寄せ、当該課程の設置科目(`own`)を優先し、
    次いで課程コードの小さい出典を採る(`requirements.py` の科目索引と同じ順序)。

    Raises:
        ProposalError: `profile.grade` が無い場合。配当年次で絞れない。
    """
    if profile.grade is None:
        raise ProposalError("学年(profile.grade)が必要です")

    passed = _passed_titles(profile.completed_courses)
    candidates: dict[str, Candidate] = {}
    for course in sorted(
        loaded.curriculum.courses, key=lambda c: (not c.own, c.source_program_code)
    ):
        if course.type == "随意":
            continue
        if course.grade > profile.grade:
            continue
        title = normalize_title(course.title)
        if title in passed or title in candidates:
            continue
        codes = loaded.syllabus_codes(course)
        if not codes:
            continue
        candidates[title] = Candidate(course=course, codes=tuple(codes))

    ordered = sorted(candidates.values(), key=lambda c: (c.course.grade, c.course.title))
    logger.info("候補科目を抽出しました: %d件", len(ordered))
    return ordered


# --- 4. 開講情報の突合(§7.2 / §6.2) ---


def _to_int(value: object) -> int | None:
    """api-clean の値を時限(int)にする。欠測・数値でない値は None にする。"""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return None


def _to_str(value: object) -> str | None:
    """api-clean の値を文字列にする。空文字は欠測として None にする。"""
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _to_offered_class(row: dict) -> OfferedClass | None:
    """`GET /syllabi` の1件を `OfferedClass` にする。コードが無い行は捨てる。"""
    code = _to_str(row.get("syllabus_code"))
    if code is None:
        return None
    return OfferedClass(
        syllabus_code=code,
        course_title=_to_str(row.get("course_title")) or "",
        term=_to_str(row.get("term")),
        day_of_week=_to_str(row.get("day_of_week")),
        period=_to_int(row.get("period")),
        room=_to_str(row.get("room")),
    )


async def fetch_offering_index(
    codes: Iterable[str],
    *,
    year: int,
    page_size: int = PAGE_SIZE,
    max_pages: int = MAX_PAGES,
) -> dict[str, OfferedClass]:
    """候補のシラバスコードに対応する開講情報を**一括取得**する(§7.2)。

    `GET /syllabi?year=<開講年度>` をページ送りで辿り、`codes` に含まれるコードだけを
    索引に残す。1件ずつ `GET /syllabi/{code}` を叩かないのは、候補が数百件規模に
    なるためである(§7.2)。必要なコードが揃った時点、または返却件数が `limit` に
    満たなくなった時点で打ち切る。
    """
    wanted = set(codes)
    if not wanted:
        return {}

    index: dict[str, OfferedClass] = {}
    for page in range(max_pages):
        payload = await search_syllabi(
            year=year, limit=page_size, offset=page * page_size
        )
        rows = payload.get("results") or []
        for row in rows:
            offered = _to_offered_class(row)
            if offered is not None and offered.syllabus_code in wanted:
                index.setdefault(offered.syllabus_code, offered)
        if len(index) >= len(wanted) or len(rows) < page_size:
            break
    else:
        logger.warning(
            "開講情報の取得がページ上限に達しました: %d件中 %d件を解決", len(wanted), len(index)
        )

    logger.info("開講情報を突合しました: %d件中 %d件", len(wanted), len(index))
    return index


def attach_offerings(
    candidates: Sequence[Candidate],
    index: dict[str, OfferedClass],
    *,
    max_classes_per_course: int = MAX_CLASSES_PER_COURSE,
) -> list[Candidate]:
    """候補にシラバスコードで開講情報を結び付ける(§7.2)。

    api-clean 側に1クラスも見つからない科目は、曜日・時限が分からず時間割に
    置けないため候補から外す。クラスが多すぎる科目は曜日・時限・コードの昇順で
    `max_classes_per_course` 件に絞る。
    """
    attached: list[Candidate] = []
    for candidate in candidates:
        # 曜日・時限が欠測のクラス(集中講義など)は末尾に寄せる
        classes = sorted(
            (index[code] for code in candidate.codes if code in index),
            key=lambda c: (c.day_of_week or "\uffff", c.period or 99, c.syllabus_code),
        )
        if not classes:
            continue
        attached.append(
            Candidate(
                course=candidate.course,
                codes=candidate.codes,
                classes=tuple(classes[:max_classes_per_course]),
                matched=len(classes),
            )
        )
    logger.info("開講情報のある候補科目: %d件", len(attached))
    return attached


# --- 5. プロンプトの組み立て(§7.2) ---


def _oneline(text: str) -> str:
    """履修要項の `notes` を1行にたたむ。節が1項目1行の並びで読めるようにする。"""
    return " ".join(text.split())


def _credits(value: float) -> str:
    """単位数を書く。0.5 刻みで現れ得るが、整数は `2.0` ではなく `2` と書く。"""
    return str(int(value)) if float(value).is_integer() else str(value)


def _format_slots(result: RequirementsResult) -> list[str]:
    """要件枠ごとの不足単位。不足のある枠を先に並べる(要件§4.3.2)。"""
    lines: list[str] = []
    for slot in sorted(result.slots, key=lambda s: (s.shortfall <= 0, s.key)):
        # `required: 0` の枠は受け皿を持たない通過点であり、不足という概念がない
        if slot.required == 0:
            continue
        line = (
            f"- {slot.key}: 必要 {slot.required} / "
            f"修得 {_credits(slot.earned)} / 不足 {_credits(slot.shortfall)}"
        )
        if slot.notes:
            line += f"({_oneline(slot.notes)})"
        lines.append(line)
    return lines


def _format_registration_limits(
    curriculum: MergedCurriculum, grade: int
) -> list[str]:
    """CAP制(`registration_limits`)。学年に対応するセメスターに印を付ける(§5.1.2)。

    セメスターは1年前期を1として数えるため、`grade` 年次は `2*grade-1` と `2*grade`
    に当たる。次学期が前期・後期のどちらかはプロファイルから決まらないため、
    両方を該当として示し、判断はモデルに委ねる。
    """
    current = {grade * 2 - 1, grade * 2}
    lines: list[str] = []
    for limit in curriculum.registration_limits.by_semester:
        semesters = "・".join(str(s) for s in limit.semesters)
        if limit.max_credits_per_semester is not None:
            cap = f"各学期 {limit.max_credits_per_semester}単位"
        else:
            cap = f"通年で {limit.max_credits_per_year}単位"
        mark = " ← 該当" if current & set(limit.semesters) else ""
        line = f"- {semesters}セメスター: {cap}{mark}"
        if limit.notes:
            line += f"({_oneline(limit.notes)})"
        lines.append(line)
    if curriculum.registration_limits.notes:
        lines.append(f"補足: {_oneline(curriculum.registration_limits.notes)}")
    if curriculum.registration_limits.gpa_exception:
        lines.append(f"例外: {_oneline(curriculum.registration_limits.gpa_exception)}")
    return lines


def _format_class(offered: OfferedClass) -> str:
    """開講クラス1件を「前期 / 月2 / 1-101」の形にする。欠測は「未定」と書く。"""
    if offered.day_of_week and offered.period is not None:
        slot = f"{offered.day_of_week}{offered.period}"
    elif offered.day_of_week:
        slot = f"{offered.day_of_week}曜(時限未定)"
    else:
        slot = "曜日時限未定"
    room = offered.room or "教室未定"
    term = offered.term or "学期未定"
    return f"{term} / {slot} / {room}"


def _format_candidates(candidates: Sequence[Candidate]) -> list[str]:
    """候補科目1行1クラス。モデルが転記するだけで済む並びにする。"""
    lines: list[str] = []
    for candidate in candidates:
        course = candidate.course
        head = (
            f"{course.title} | {course.category} | {course.type} | "
            f"{course.credits}単位 | 配当{course.grade}年〜"
        )
        if not course.own:
            head += " | 他課程開講(専門関連科目)"
        for offered in candidate.classes:
            lines.append(f"- [{offered.syllabus_code}] {head} | {_format_class(offered)}")
        remainder = candidate.matched - len(candidate.classes)
        if remainder > 0:
            lines.append(f"  (同名の別クラスが他に{remainder}件ある)")
    return lines


def _format_completed(completed: Sequence[StudentCourse]) -> list[str]:
    """修得済みと、未修得のまま残っている不合格・履修辞退。

    要件充足判定は `passed` だけを数える(要件§4.2)ため、不合格・履修辞退は
    判定結果に現れない。再履修の要否はモデルの判断材料になるので、ここで渡す。
    """
    lines: list[str] = []
    passed = [c for c in completed if c.status == "passed"]
    if passed:
        lines.append(
            "修得済み: "
            + "、".join(f"{c.title}({_credits(c.credits)}単位)" for c in passed)
        )
    retake = [c for c in completed if c.status != "passed"]
    if retake:
        lines.append(
            "未修得(不合格・履修辞退。再履修の対象): "
            + "、".join(f"{c.title}({c.status})" for c in retake)
        )
    if not lines:
        lines.append("修得済みの科目はない。")
    return lines


def _section(title: str, lines: Sequence[str]) -> str:
    return f"【{title}】\n" + "\n".join(lines)


def render_prompt(
    loaded: LoadedCurriculum,
    profile: StudentProfile,
    requirements: RequirementsResult,
    candidates: Sequence[Candidate],
    *,
    wishes: str | None = None,
) -> str:
    """組み立て済みの材料を1つのプロンプトにする(§7.2)。

    学生プロファイル・要件充足状況・CAP・候補科目+開講情報・希望条件を節に分けて
    並べる。モデルが値を作り出さずに済むよう、単位数・曜日・時限は候補科目の行に
    書いた値をそのまま転記させる(`_INSTRUCTIONS` 規則2)。
    """
    curriculum = loaded.curriculum
    grade = profile.grade or 1

    student = [
        f"学年: {grade}回生",
        f"課程: {curriculum.program.code} {curriculum.program.name}",
        f"入学年度: {curriculum.admission_year}年度",
    ]
    if requirements.track:
        student.append(f"選択コース: {requirements.track}")
    elif requirements.available_tracks:
        names = "、".join(f"{t.key}({t.name})" for t in requirements.available_tracks)
        student.append(f"コース未選択(選択できるコース: {names})")

    status = [
        f"卒業必要単位: {requirements.total_credits} / "
        f"修得済み: {_credits(requirements.earned_credits)} / "
        f"残り: {_credits(requirements.remaining_credits)}",
        "要件枠ごとの不足単位:",
        *_format_slots(requirements),
    ]
    for constraint in requirements.track_constraints:
        status.append(
            f"- コース別下限 {constraint.slot} / {constraint.track_group}: "
            f"必要 {constraint.required} / 修得 {_credits(constraint.earned)} / "
            f"不足 {_credits(constraint.shortfall)}"
        )

    sections = [
        _section("学生情報", student),
        _section("卒業要件の充足状況", status),
        _section("履修登録単位数の上限", _format_registration_limits(curriculum, grade)),
        _section("修得済み科目", _format_completed(profile.completed_courses)),
        _section(
            "候補科目",
            [
                "形式: [シラバスコード] 科目名 | 区分 | 履修区分 | 単位 | 配当年次 | 学期 / 曜日時限 / 教室",
                *_format_candidates(candidates),
            ],
        ),
        _section("希望条件", [wishes.strip() if wishes and wishes.strip() else "特になし"]),
    ]
    return "\n\n".join(sections)


async def build_proposal_prompt(
    profile: StudentProfile,
    admission_year: int,
    *,
    track: str | None = None,
    wishes: str | None = None,
    offering_year: int | None = None,
) -> str:
    """履修提案のプロンプトを組み立てる(§7.2 の 1〜5)。

    Args:
        profile: 学生プロファイル(§5.2.1)。`program` は課程コード、`grade` は必須。
        admission_year: 入学年度。プロファイルに無いため呼び出し側が渡す(§6.1)。
        track: 選択したコースの `tracks[].key`。コース別下限の判定に使う。
        wishes: 希望条件(自由文)。
        offering_year: 参照する開講年度。既定は `settings.offering_year`(§4.4.3)。

    Raises:
        ProposalError: 課程コードが無い、履修要項が無い、学年が無い場合。
    """
    program_code = profile.program
    if not program_code:
        raise ProposalError("課程コード(profile.program)が必要です")

    loaded = resolve_curriculum(program_code, admission_year)
    requirements = judge_requirements(loaded, profile, track=track)
    candidates = select_candidates(loaded, profile)
    year = offering_year if offering_year is not None else get_settings().offering_year
    index = await fetch_offering_index(
        (code for candidate in candidates for code in candidate.codes), year=year
    )
    return render_prompt(
        loaded,
        profile,
        requirements,
        attach_offerings(candidates, index),
        wishes=wishes,
    )
