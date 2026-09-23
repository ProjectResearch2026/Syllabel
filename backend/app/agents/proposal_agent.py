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
   未修得 / 登録済みでない)
4. `fetch_offering_index()` + `fetch_eligibility()` + `attach_offerings()` — 候補の
   シラバスコードを開講年度ファイルの `resolved` から採り(§4.4.2)、曜日・時限・教室は
   api-clean から**一括取得**してコードで突合する(§7.2)。あわせて**その学生が
   履修登録できるクラスだけを残し**(§6.1。下記)、**対象学期に登録するクラスだけを
   残す**(下記「対象学期」)
5. `render_prompt()` — 上記に CAP(`registration_limits`)・修得済み一覧・希望条件を
   加えて1つの文字列にする

## 履修可否(§6.1)

**履修要項は「科目」の単位で書かれており、その学生がその開講クラスを履修登録
できるかを持たない。** 判定の正本はシラバス側の対象課程であり、規則は
frontend のタグ表示と共通で次の3分岐である。

- 対象課程に学生の課程が入っている → 履修可
- 対象課程が空で、対象学部に先端理工学部が入る → 課程指定なし。履修可
- それ以外 → 他課程指定のクラス。履修不可

**候補を絞る前にこれを掛けることが要る。** 掛けていなかったとき、2026年度開講・
2024年度入学の知能情報メディア課程(3回生・既修得12科目)では、プロンプトに載る
673 クラス行のうち 189 行がその学生には履修登録できないものだった。さらに悪いことに、
`MAX_CLASSES_PER_COURSE` が曜日・時限の早い順で切るため、**履修できるクラスが
1つも候補に載らない科目が4件**あった。

| 科目 | 履修できるクラス | 候補に載っていたもの |
|---|---|---|
| 英語総合1(A) | 11(火3) | 火2の他課程クラス6件 |
| 英語総合2(A) | 11 | 他課程クラス6件 |
| スポーツ技術学A | 10 | 他課程クラス6件 |
| スポーツ技術学B | 10 | 他課程クラス6件 |

コードだけでなく曜日・時限が丸ごと違うため、コマ重複の判定(`_INSTRUCTIONS` 規則3)も
誤った前提で行われていた。掛けたあとは 508 クラス行・履修不可 0 行になる。

**api-clean の一覧は対象課程を返さない。** 1科目に複数の課程が対応するため
`SELECT DISTINCT` から外されており、対象課程は `GET /syllabi/{code}` にしかない
(§6.2)。候補は1,000コード規模になり1件ずつ詳細を引くのは避けたい(§7.2)ため、
**課程名で絞った一覧を課程ごとに引いて集合演算で判定する**(`fetch_eligibility()`)。
api-clean の `program` は `cp.name = %s` の完全一致であり、対象課程を持たない
シラバスは絞り込みから落ちる。したがって「どの課程の結果にも現れないコード」が
課程指定なしのコードである。

## 対象学期(§7.2)

**提案は1つの学期(次に履修登録する学期)に対して作る。** 対象学期を与えないと
【候補科目】に前期・後期・通年のクラスが混ざり、CAP も2学期ぶんに印が付くため、
モデルは学期を混ぜて提案する(時間割表では同じコマの前期・後期の科目が上書き
し合い、合計単位も2学期ぶんになる)。対象学期は frontend が成績表の作成日と在籍
年数から推定し、学生が画面で確認した値(`TargetTerm`)である。

- クラスは**その学期の履修登録で登録するもの**だけを残す。前期の登録では前期・
  1Q・2Q・通年・サ集(夏期集中)、後期の登録では後期・3Q・4Q(通年科目は前期に
  登録する)。学期が判定できないクラスは落とさずに残す
- 配当年次の絞り込みと CAP の該当セメスターには**対象学期の学年**を使う

**学生データはログに出さない(§4.2.3)。** 本モジュールのログは件数だけを扱う。
"""

import logging
import unicodedata
from typing import Literal
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from functools import lru_cache

from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModelSettings

from app.agents import build_model
from app.agents.tools import get_masters, search_syllabi
from app.curricula.loader import LoadedCurriculum, get_curricula
from app.curricula.merge import MergedCourse, MergedCurriculum
from app.schemas.curriculum import Prerequisite
from app.curricula.requirements import (
    RequirementsResult,
    _course_index,
    accepts_course,
    judge,
    normalize_title,
)
from app.schemas.proposal import (
    HalfTerm,
    ProposedCourse,
    TargetTerm,
    TimetableProposal,
    proposal_draft_model,
    quarters_of,
)
from app.schemas.student import Course as StudentCourse
from app.schemas.student import StudentProfile
from app.settings import get_settings

logger = logging.getLogger(__name__)

# 構造化出力の検証に落ちたとき、検証エラーをモデルへ返して作り直させる回数(§7.2)。
# pydantic-ai 2 系では `Agent(output_retries=...)` が `retries={"output": ...}` に
# 統合されている。
#
# **0 とする(作り直させない)。** 作り直しは1回4〜5分かかる。提案の下書きは vLLM の
# 構造化出力が形式を縛るため、検証に落ちるのは実質的に**出力の上限で途中で切れた
# とき**だけである。pydantic-ai は切れた下書きも「JSON が不正」として作り直しを頼み、
# 上限に達したと分かるのは作り直しを使い切った後になる(2回なら所要時間が3倍)。
# 0 にすると切れた時点で例外になり、書き終えた科目までで確定版にできる
# (`app/api/proposal.py`)。同じ科目・コマ重複・単位の上限超過も作り直させず、
# backend が外す(`assemble_courses()`)
OUTPUT_RETRIES = 0

# 実機計測(2026-09-09 / DGX Spark + Qwen3.6-27B-FP8)に基づく推論の設定。
#
# **思考(reasoning)を切る。** 思考を有効にすると、候補科目 643行・約39,000トークンの
# プロンプトに対して600トークン生成しても本文へ到達せず、900秒待っても提案が出なかった
# (vLLM 側は 7.3 tokens/s で生成を続けており、停止ではなく思考の継続だった)。
# `enable_thinking: false` を渡すと `final_result` の生成が即座に始まる。提案は
# 【候補科目】からの選択と転記が主で、必要な判断材料は backend が事前に揃えている(§7.2)
# ため、長い思考を要する課題ではない。
#
# **`max_tokens` は出力が途中で切れない大きさにする。** 途中で切れると pydantic-ai は
# 作り直さずに例外を投げる(`IncompleteToolCall`)。その場合は書き終えた科目までで
# 確定版にする(`app/api/proposal.py`)が、切れないに越したことはない。全項目を
# 書かせていた頃は CAP いっぱいの11科目でおよそ1,900トークンだった。下書き
# (コードと理由だけ)になって減っているが、上限は据え置く。
#
# 2026-09-23 の実機(Qwen3.8)では、全項目を書かせる形式で**同じ科目の並びを繰り返し
# 書き続けて**この上限で切れた(620秒)。下書きの件数の上限(`_max_items()`)は、
# 繰り返しが起きても上限に届く前に書き終わらせるための暴走止めである。
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

# 下書きの `courses` の件数の上限(暴走止め)の天井。単位数の上限(CAP)から
# 「上限単位 ÷ 候補の最小単位」で計算し、これを超えないようにする(§7.2)
MAX_DRAFT_ITEMS = 30

# 件数の上限に足す余裕。上限単位 ÷ 最小単位ちょうどだと、上限を超える科目や重なる
# 科目を書いた分だけ(backend が外すので)提案が細る。外される分を見込んで数件足す
DRAFT_ITEMS_SLACK = 3

_INSTRUCTIONS = (
    "あなたは龍谷大学先端理工学部の履修登録を支援するAIアシスタントです。\n"
    "与えられた学生の状況から、**【対象学期】に履修する時間割**を提案してください。\n"
    "\n"
    "提案は次の規則に従ってください。\n"
    "1. 提案してよいのは【候補科目】に挙がっている科目だけである。"
    "一覧に無い科目名やシラバスコードを作り出してはならない。\n"
    "2. courses の各要素には syllabusCode(【候補科目】の行の [ ] 内のコード)と"
    " reason だけを書く。科目名・曜日・時限・学期・単位はシステムが候補一覧から補う。"
    "同じ科目(同名の別クラスを含む)を2回入れない。\n"
    "3. 同じ曜日・時限で開講期間が重なる2科目を割り当ててはならない"
    "(前期と1Q・2Q、通年と前期・後期は重なる)。"
    "曜日・時限が「未定」の科目(集中講義など)はこの制約の対象外とする。\n"
    "4. 提案する科目の単位の合計は、【履修登録単位数の上限】の"
    "「対象学期に登録できる残り単位」を超えてはならない。\n"
    "5. 【卒業要件の充足状況】で不足している要件枠を優先して埋める。"
    "不足単位を大きく超える科目数を詰め込まない一方、"
    "卒業に必要な単位を取り残さない。過不足のない分量にすること。\n"
    "6. 【修得済み科目】に挙がっている科目と【登録済み科目】は提案しない。"
    "ただし不合格・履修辞退の科目は未修得であり、提案してよい。\n"
    "7. 【希望条件】がある場合はそれを尊重する。"
    "卒業要件と両立しない希望は、summary でその旨を説明する。\n"
    "8. reason には、その科目を勧める理由(どの要件枠を埋めるか、"
    "希望条件のどれに合うか)を40字以内の1文で書く。\n"
    "9. summary には提案全体の方針と履修上の注意点を2〜4文で書く。"
    "【先修条件】で「確認が要る」とされた科目、進級要件・抽選科目など確認が要る点が"
    "あれば触れる。【先修条件】で満たしているとされた条件について、不確かな書き方をしない。\n"
    "10. summary に単位数の合計や内訳の計算を書かない。単位数はシステムが計算して"
    "画面に表示する。"
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


# --- 説明文の書き直し(§7.2.2) ---
#
# 説明文(summary)はモデルが下書きを書く時点の、backend が科目を外す**前**の並びを
# 見て書かれる。2026-09-23 の実機では、外された科目(「アルゴリズム及び演習Ⅰ・Ⅱで
# 4単位確保」)に触れた説明文が画面の時間割と食い違った。科目を外したときだけ、
# 確定した時間割を渡して説明文だけを書き直させる。出力は数文なので、提案本体
# (4〜5分)に比べて短い。

# 書き直しの推論設定。思考を切る理由は `MODEL_SETTINGS` と同じ。出力は2〜4文
SUMMARY_SETTINGS = OpenAIChatModelSettings(
    extra_body={"chat_template_kwargs": {"enable_thinking": False}},
    max_tokens=800,
    timeout=180.0,
)

_SUMMARY_INSTRUCTIONS = (
    "あなたは龍谷大学先端理工学部の履修登録を支援するAIアシスタントです。\n"
    "履修提案の【確定した時間割】について、学生に見せる説明文を書き直してください。\n"
    "【元の説明文】は、確定した時間割に入っていない科目に触れていることがあります。\n"
    "\n"
    "1. 【確定した時間割】にある科目だけに基づいて書く。時間割に無い科目名を書かない。\n"
    "2. 【卒業要件の充足状況】を踏まえ、提案全体の方針と履修上の注意点を2〜4文で書く。\n"
    "3. 元の説明文の方針や注意点のうち、確定した時間割と矛盾しないものは生かす。\n"
    "4. 科目を入れ替えた・外したといった作成の経緯には触れない。\n"
    "5. 単位数の合計や内訳の計算を書かない。単位数はシステムが計算して画面に表示する。\n"
    "6. 説明文の本文だけを出力する。見出しや前置きを付けない。"
)


@lru_cache
def build_summary_agent() -> Agent[None, str]:
    """説明文を書き直すエージェント。出力は文字列(説明文の本文)。"""
    return Agent(
        build_model(),
        output_type=str,
        instructions=_SUMMARY_INSTRUCTIONS,
        model_settings=SUMMARY_SETTINGS,
    )


def render_summary_prompt(
    proposal: TimetableProposal, original: str | None, requirements_text: str
) -> str:
    """書き直しのプロンプト。確定した時間割・元の説明文・卒業要件の充足状況。"""
    lines = []
    for course in proposal.courses:
        slot = (
            f"{course.day}{course.period}"
            if course.day and course.period is not None
            else "曜日時限未定"
        )
        lines.append(
            f"- {course.title} | {course.category or '区分不明'} | "
            f"{_credits(course.credits or 0)}単位 | {course.term or '学期未定'} {slot}"
            f" | 理由: {course.reason}"
        )
    total = proposal.total_credits
    lines.append(f"合計: {_credits(total) if total is not None else '不明'}単位")
    return "\n\n".join(
        [
            _section("確定した時間割", lines),
            _section("元の説明文", [(original or "").strip() or "なし"]),
            _section("卒業要件の充足状況", [requirements_text or "不明"]),
        ]
    )


async def rewrite_summary(
    proposal: TimetableProposal, original: str | None, context: "ProposalContext"
) -> str:
    """確定した時間割に合わせて説明文を書き直す。失敗したら元の説明文を返す。

    書き直しに失敗しても提案そのものは成立しているため、エラーにはしない。
    """
    fallback = proposal.summary
    try:
        result = await build_summary_agent().run(
            render_summary_prompt(proposal, original, context.requirements_text)
        )
    except Exception:  # noqa: BLE001 - 書き直しは付加的な処理であり、提案を落とさない
        logger.warning("説明文の書き直しに失敗しました。元の説明文を使います")
        return fallback
    text = (result.output or "").strip()
    return text or fallback


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


def _taken_titles(completed: Sequence[StudentCourse]) -> set[str]:
    """提案しない科目名を正規化して集める。修得済み(合格)と登録済みである。

    不合格・履修辞退は**修得していない**ため除く。再履修は提案の対象になる
    (要件§4.2 の単位計算と同じく `passed` だけを修得とみなす)。登録済み
    (`registered`。成績未確定)は修得ではないが、すでに登録しているので提案しない。
    """
    return {
        normalize_title(c.title)
        for c in completed
        if c.status in ("passed", "registered")
    }


def select_candidates(
    loaded: LoadedCurriculum, profile: StudentProfile, *, grade: int | None = None
) -> list[Candidate]:
    """履修可能な候補科目を絞る(§7.2)。

    次のすべてを満たす科目を候補とする:

    - `type != "随意"` — 随意科目は卒業要件単位に算入しない(§5.1.5 `excluded_types`)
    - `course.grade <= 学生の学年` — 配当年次は「この年次**から**履修可能」(§5.1.5)
    - 未修得かつ未登録 — 既修得・登録済みの科目と科目名で突合する(表記ゆれは
      `normalize_title()` が吸収)
    - シラバスコードを持つ — `not_offered`(当年度不開講)/ `unresolved`(名寄せ未解決)
      の科目は時間割に置けないため候補から外す(§5.1.4)

    マージ済みの `courses` には他課程から導出した同名の専門関連科目が複数入り得る
    (§4.4.3)。ここでは科目名で1件に寄せ、当該課程の設置科目(`own`)を優先し、
    次いで課程コードの小さい出典を採る(`requirements.py` の科目索引と同じ順序)。

    Args:
        grade: 対象学期の学年(`TargetTerm.grade`)。省略時は `profile.grade`。

    Raises:
        ProposalError: 学年が無い場合。配当年次で絞れない。
    """
    grade = grade if grade is not None else profile.grade
    if grade is None:
        raise ProposalError("学年(profile.grade)が必要です")

    taken = _taken_titles(profile.completed_courses)
    candidates: dict[str, Candidate] = {}
    for course in sorted(
        loaded.curriculum.courses, key=lambda c: (not c.own, c.source_program_code)
    ):
        if course.type == "随意":
            continue
        if course.grade > grade:
            continue
        title = normalize_title(course.title)
        if title in taken or title in candidates:
            continue
        codes = loaded.syllabus_codes(course)
        if not codes:
            continue
        candidates[title] = Candidate(course=course, codes=tuple(codes))

    ordered = sorted(candidates.values(), key=lambda c: (c.course.grade, c.course.title))
    logger.info("候補科目を抽出しました: %d件", len(ordered))
    return ordered


# --- 3b. 先修条件(§5.1.5 `prerequisites`) ---
#
# 履修要項の先修制(「ある科目を履修するには、指定された科目・単位数の修得が要る」)を
# backend が判定する。2026-09-23 の実機では、判定材料を渡していなかったため、モデルが
# 「先修要件がある場合があり」と一般論で書いた。判定の結果は3つに分ける:
#
# - met: 満たしている。プロンプトに明記し、不確かな書き方をさせない
# - unmet: 満たしていない。候補から外し、外したことをプロンプトに書く
# - unknown: 原文(notes)しか無く機械的に判定できない、または判定時点(as_of)が
#   提案する学期以降でまだ決まらない。候補に残し「確認が要る」と書く


PrerequisiteStatus = Literal["met", "unmet", "unknown"]


def _half_index(term: str) -> int:
    """学期を年度内の前半(0)・後半(1)に寄せる。通年は後期に終わるので後半とする。"""
    return 0 if term in ("前期", "1Q", "2Q", "サ集") else 1


def check_prerequisite(
    prerequisite: Prerequisite,
    curriculum: MergedCurriculum,
    completed: Sequence[StudentCourse],
    *,
    target: TargetTerm | None = None,
) -> PrerequisiteStatus:
    """先修条件1件を判定する。`min_credits` / `all_of` / `any_of` は AND で結ぶ。

    `as_of`(判定時点)があれば、その学期末までに修得した科目だけで数える。判定時点が
    提案する学期(`target`)以降なら、まだ成績が出ていないので unknown とする。
    `min_credits` の `accepts` 省略は卒業要件総修得単位数(要件充足判定の
    `earned_credits`)、`accepts` ありは当該区分に当たる修得科目の単位の合計で比べる。
    """
    if not (prerequisite.min_credits or prerequisite.all_of or prerequisite.any_of):
        return "unknown"

    passed = [c for c in completed if c.status == "passed"]
    if prerequisite.as_of is not None:
        as_of = (
            curriculum.admission_year + prerequisite.as_of.grade - 1,
            0 if prerequisite.as_of.term == "前期" else 1,
        )
        if target is not None and as_of >= (target.year, 0 if target.term == "前期" else 1):
            return "unknown"
        passed = [c for c in passed if (c.year, _half_index(c.term)) <= as_of]

    titles = {normalize_title(c.title) for c in passed}
    if prerequisite.all_of and not all(normalize_title(t) in titles for t in prerequisite.all_of):
        return "unmet"
    if prerequisite.any_of and not any(normalize_title(t) in titles for t in prerequisite.any_of):
        return "unmet"
    if prerequisite.min_credits:
        index = _course_index(curriculum)
        total = None
        for threshold in prerequisite.min_credits:
            if threshold.accepts is None:
                if total is None:
                    total = judge(curriculum, passed).earned_credits
                earned = total
            else:
                earned = sum(
                    c.credits
                    for c in passed
                    if (course := index.get(normalize_title(c.title))) is not None
                    and accepts_course(threshold.accepts, course)
                )
            if earned < threshold.credits:
                return "unmet"
    return "met"


@dataclass(frozen=True)
class PrerequisiteResult:
    """候補科目1件の先修条件の判定結果。`notes` は履修要項の原文。"""

    title: str
    status: PrerequisiteStatus
    notes: str


def check_prerequisites(
    candidates: Sequence[Candidate],
    curriculum: MergedCurriculum,
    completed: Sequence[StudentCourse],
    *,
    target: TargetTerm | None = None,
) -> tuple[list[Candidate], list[PrerequisiteResult]]:
    """候補科目の先修条件を判定し、満たさない科目を外す。

    同じ科目に条件が複数あれば、1つでも unmet なら unmet、そうでなく1つでも
    unknown なら unknown とする。先修条件の無い科目はそのまま残し、結果にも載せない。
    """
    by_title: dict[str, list[Prerequisite]] = {}
    for prerequisite in curriculum.prerequisites:
        by_title.setdefault(normalize_title(prerequisite.title), []).append(prerequisite)

    kept: list[Candidate] = []
    results: list[PrerequisiteResult] = []
    for candidate in candidates:
        rules = by_title.get(normalize_title(candidate.course.title))
        if not rules:
            kept.append(candidate)
            continue
        statuses = [
            check_prerequisite(rule, curriculum, completed, target=target) for rule in rules
        ]
        status: PrerequisiteStatus = (
            "unmet" if "unmet" in statuses else "unknown" if "unknown" in statuses else "met"
        )
        results.append(
            PrerequisiteResult(
                title=candidate.course.title,
                status=status,
                notes=" / ".join(_oneline(rule.notes) for rule in rules),
            )
        )
        if status != "unmet":
            kept.append(candidate)
    logger.info(
        "先修条件を判定しました: 満たす %d件 / 満たさない %d件 / 要確認 %d件",
        sum(r.status == "met" for r in results),
        sum(r.status == "unmet" for r in results),
        sum(r.status == "unknown" for r in results),
    )
    return kept, results


def _format_prerequisites(results: Sequence[PrerequisiteResult]) -> list[str]:
    """【先修条件】の中身。候補に関係する先修条件だけを、判定結果ごとに並べる。"""
    if not results:
        return ["候補科目に先修条件のある科目はない。"]
    labels = {
        "met": "満たしている",
        "unmet": "満たしていない(候補から外した)",
        "unknown": "確認が要る(システムでは判定できない)",
    }
    lines: list[str] = []
    for status in ("met", "unmet", "unknown"):
        for result in (r for r in results if r.status == status):
            lines.append(f"- {result.title}: {labels[status]}。条件: {result.notes}")
    return lines


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


@dataclass(frozen=True)
class Eligibility:
    """その学生が履修登録できる開講クラスの判定(§6.1)。

    `mine` は学生の課程が対象課程に入っているコード、`any_program` は**いずれかの
    課程**が対象課程に入っているコードである。api-clean の `program` 絞り込みは
    対象課程を持たないシラバスを落とすため、`any_program` に居ないコードが
    「課程指定なし」であり、学部の科目として履修できる。
    """

    mine: frozenset[str]
    any_program: frozenset[str]

    def allows(self, code: str) -> bool:
        """そのコードのクラスを履修登録できるか。"""
        return code in self.mine or code not in self.any_program


def _program_names_of(curriculum: MergedCurriculum) -> set[str]:
    """学生の課程を指す名称の集合。改称前後の両方を含む(§4.4.2)。

    課程コード `06` は入学年度で名称が異なり(環境生態工学課程 / 環境科学課程)、
    api-clean は**両方を別々の課程として持つ**ため、片方だけで比べると
    履修可否を取り違える。別名は課程ファイルの `program.name_aliases` が持つ。
    """
    return {curriculum.program.name, *curriculum.program.name_aliases}


async def _codes_of_program(
    program: str | None, *, year: int, page_size: int, max_pages: int
) -> set[str]:
    """`program` を対象課程に持つシラバスコードを一括取得する。"""
    codes: set[str] = set()
    for page in range(max_pages):
        payload = await search_syllabi(
            year=year, program=program, limit=page_size, offset=page * page_size
        )
        rows = payload.get("results") or []
        for row in rows:
            code = _to_str(row.get("syllabus_code"))
            if code is not None:
                codes.add(code)
        if len(rows) < page_size:
            break
    else:
        logger.warning(
            "対象課程の取得がページ上限に達しました: 課程=%s / %d件", program, len(codes)
        )
    return codes


async def fetch_eligibility(
    curriculum: MergedCurriculum,
    *,
    year: int,
    page_size: int = PAGE_SIZE,
    max_pages: int = MAX_PAGES,
    program_names: Sequence[str] | None = None,
) -> Eligibility:
    """履修可否の判定に要る2つのコード集合を引く(§6.1)。

    課程名の一覧は `GET /masters` の `course_program` から採る(検索画面の絞り込みと
    同じ出所)。取れなかったときは学生の課程だけを引き、`any_program` をその集合に
    揃える。**判定が「学生の課程に入っているか」だけに退化し、課程指定なしの科目も
    履修可と扱われる**(絞り込みすぎて候補を失うより、従来どおりの振る舞いに倒す)。

    Args:
        program_names: 課程名の一覧。省略時は `/masters` から引く(テスト用の口)。
    """
    mine_names = _program_names_of(curriculum)

    if program_names is None:
        try:
            masters = await get_masters()
            program_names = [
                name
                for item in (masters.get("course_program") or [])
                if (name := _to_str(item.get("name"))) is not None
            ]
        except Exception:  # noqa: BLE001 - 候補を失わないため既定の振る舞いへ倒す
            logger.warning("課程一覧を引けませんでした。履修可否は学生の課程のみで判定します")
            program_names = []

    mine: set[str] = set()
    any_program: set[str] = set()
    for name in program_names:
        codes = await _codes_of_program(
            name, year=year, page_size=page_size, max_pages=max_pages
        )
        any_program |= codes
        if name in mine_names:
            mine |= codes

    if not program_names:
        for name in sorted(mine_names):
            mine |= await _codes_of_program(
                name, year=year, page_size=page_size, max_pages=max_pages
            )
        any_program = set(mine)

    logger.info(
        "履修可否を引きました: 自課程 %d件 / いずれかの課程 %d件", len(mine), len(any_program)
    )
    return Eligibility(mine=frozenset(mine), any_program=frozenset(any_program))


# 開講学期 → そのクラスを登録する履修登録の学期。表記は api-clean の `term` マスタの
# 8種である(2025・2026年度のデータを投入した api-clean で確認)。
#
# - **通年は前期**に登録する(2026年度の通年 118件のうち 110件は「通年　集中」)
# - **サ集(夏期集中。「サ集　集中」)も前期**とする。夏休みに開かれ後期より前に終わる
#   ため、後期の登録で選ぶ余地が無い
_REGISTRATION_HALF: dict[str, HalfTerm] = {
    "前期": "前期",
    "1Q": "前期",
    "2Q": "前期",
    "通年": "前期",
    "サ集": "前期",
    "後期": "後期",
    "3Q": "後期",
    "4Q": "後期",
}


def registration_half(term: str | None) -> HalfTerm | None:
    """開講学期のクラスを、前期・後期のどちらの履修登録で登録するか。

    表記ゆれ(全角の `１Ｑ` など)は NFKC で寄せる。マスタに無い表記や `None` は
    None を返し、呼び出し側は落とさない(判定できないものを捨てない)。
    """
    if term is None:
        return None
    key = unicodedata.normalize("NFKC", term).replace(" ", "")
    return _REGISTRATION_HALF.get(key)


def attach_offerings(
    candidates: Sequence[Candidate],
    index: dict[str, OfferedClass],
    *,
    eligibility: Eligibility | None = None,
    term: HalfTerm | None = None,
    max_classes_per_course: int = MAX_CLASSES_PER_COURSE,
) -> list[Candidate]:
    """候補にシラバスコードで開講情報を結び付ける(§7.2)。

    api-clean 側に1クラスも見つからない科目は、曜日・時限が分からず時間割に
    置けないため候補から外す。クラスが多すぎる科目は曜日・時限・コードの昇順で
    `max_classes_per_course` 件に絞る。

    **`eligibility` を与えたときは、履修登録できないクラスを先に落とす**(§6.1)。
    順序が重要である。上限で切ってから落とすと、他課程指定のクラスが早い時限に
    並ぶ科目(「英語総合1(A)」は火2が他課程・火3が知能情報メディア課程)では
    **履修できるクラスが1つも残らない**。落としてから切れば、上限の枠を履修
    できるクラスに使える。1クラスも残らない科目は候補から外す。

    **`term` を与えたときは、その学期の履修登録で登録するクラスだけを残す**
    (`registration_half()`)。これも上限で切る前に掛ける。学期が判定できない
    クラスは残す。
    """
    attached: list[Candidate] = []
    for candidate in candidates:
        # 曜日・時限が欠測のクラス(集中講義など)は末尾に寄せる
        classes = sorted(
            (
                index[code]
                for code in candidate.codes
                if code in index
                and (eligibility is None or eligibility.allows(code))
                and (term is None or registration_half(index[code].term) in (term, None))
            ),
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
            f"- {slot.name}: 必要 {slot.required} / "
            f"修得 {_credits(slot.earned)} / 不足 {_credits(slot.shortfall)}"
        )
        if slot.notes:
            line += f"({_oneline(slot.notes)})"
        lines.append(line)
    return lines


def semester_cap(
    curriculum: MergedCurriculum, semesters: Iterable[int]
) -> int | None:
    """セメスターの履修登録単位数の上限(CAP)。§5.1.2 `registration_limits`。

    学期ごとの上限(`max_credits_per_semester`)を持つ枠はその値、年間の上限
    (`max_credits_per_year`。7・8セメスター)しか持たない枠は年間の値を返す。
    複数のセメスターを渡したときは大きい方を返す(対象学期が決まらない旧い呼び出し)。
    該当する枠が無ければ None。
    """
    wanted = set(semesters)
    caps = [
        limit.max_credits_per_semester or limit.max_credits_per_year
        for limit in curriculum.registration_limits.by_semester
        if wanted & set(limit.semesters)
    ]
    caps = [c for c in caps if c is not None]
    return max(caps) if caps else None


def registered_credits_in(completed: Sequence[StudentCourse], target: TargetTerm) -> float:
    """対象学期に登録済みの科目の単位の合計。CAP から差し引く(§5.2.1)。"""
    return sum(
        c.credits
        for c in completed
        if c.status == "registered"
        and c.year == target.year
        and registration_half(c.term) == target.term
    )


@dataclass(frozen=True)
class CreditBudget:
    """対象学期に登録できる単位。`cap` から `registered` を引いたものが `remaining`。"""

    cap: float
    registered: float

    @property
    def remaining(self) -> float:
        return max(0.0, self.cap - self.registered)


def _format_registration_limits(
    curriculum: MergedCurriculum,
    grade: int,
    target: TargetTerm | None = None,
    budget: CreditBudget | None = None,
) -> list[str]:
    """CAP制(`registration_limits`)。対象学期のセメスターに印を付ける(§5.1.2)。

    セメスターは1年前期を1として数える。対象学期(`target`)があればそのセメスター
    だけに印を付ける。無いとき(対象学期を送らない旧い呼び出し)は `grade` 年次の
    `2*grade-1` と `2*grade` の両方に付ける。
    """
    current = {target.semester} if target else {grade * 2 - 1, grade * 2}
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
    if budget is not None:
        lines.append(
            f"対象学期に登録できる残り単位: {_credits(budget.remaining)}単位"
            f"(上限 {_credits(budget.cap)} − 登録済み {_credits(budget.registered)})"
        )
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


def student_type(course: MergedCourse) -> str:
    """その学生にとっての履修区分。

    他課程から導出した専門関連科目(`own=False`)の `type` は**開講元の課程にとっての**
    区分であり(地球環境概論A は環境の課程で必修)、閲覧している学生にとっては
    「専門関連科目 選択」である(履修要項の卒業要件単位数表。frontend のタグ表示と
    同じ扱い)。開講元の区分のまま扱うと、他課程の必修が自課程の選択より重く見える。
    """
    return course.type if course.own else "選択"


def _format_candidates(candidates: Sequence[Candidate]) -> list[str]:
    """候補科目1行1クラス。モデルが転記するだけで済む並びにする。"""
    lines: list[str] = []
    for candidate in candidates:
        course = candidate.course
        head = (
            f"{course.title} | {course.category} | {student_type(course)} | "
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
    retake = [c for c in completed if c.status in ("failed", "withdrawn")]
    if retake:
        lines.append(
            "未修得(不合格・履修辞退。再履修の対象): "
            + "、".join(f"{c.title}({c.status})" for c in retake)
        )
    if not lines:
        lines.append("修得済みの科目はない。")
    return lines


def _format_registered(completed: Sequence[StudentCourse]) -> list[str]:
    """登録済みで成績が未確定の科目(成績表の `***` / `*`)。提案しない(規則6)。"""
    registered = [c for c in completed if c.status == "registered"]
    if not registered:
        return ["なし"]
    return [
        f"- {c.title}({_credits(c.credits)}単位 / {c.year}年度 {c.term})"
        for c in registered
    ]


def format_requirements(requirements: RequirementsResult) -> list[str]:
    """【卒業要件の充足状況】の中身。要件枠は公式の名前で書く(§5.1.2)。"""
    status = [
        f"卒業必要単位: {requirements.total_credits} / "
        f"修得済み: {_credits(requirements.earned_credits)} / "
        f"残り: {_credits(requirements.remaining_credits)}",
        "要件枠ごとの不足単位:",
        *_format_slots(requirements),
    ]
    slot_names = {slot.key: slot.name for slot in requirements.slots}
    for constraint in requirements.track_constraints:
        status.append(
            f"- コース別下限 {slot_names.get(constraint.slot, constraint.slot)}"
            f" / {constraint.track_group}: "
            f"必要 {constraint.required} / 修得 {_credits(constraint.earned)} / "
            f"不足 {_credits(constraint.shortfall)}"
        )
    return status


def _section(title: str, lines: Sequence[str]) -> str:
    return f"【{title}】\n" + "\n".join(lines)


def render_prompt(
    loaded: LoadedCurriculum,
    profile: StudentProfile,
    requirements: RequirementsResult,
    candidates: Sequence[Candidate],
    *,
    wishes: str | None = None,
    target: TargetTerm | None = None,
    budget: CreditBudget | None = None,
    prerequisites: Sequence[PrerequisiteResult] = (),
) -> str:
    """組み立て済みの材料を1つのプロンプトにする(§7.2)。

    学生プロファイル・要件充足状況・CAP・候補科目+開講情報・希望条件を節に分けて
    並べる。モデルが書くのはシラバスコードと理由だけで、科目名・曜日・時限・単位は
    backend が候補一覧から補う(`_INSTRUCTIONS` 規則2、`assemble_proposal()`)。
    """
    curriculum = loaded.curriculum
    grade = target.grade if target else (profile.grade or 1)

    student = [
        f"学年: {grade}回生(対象学期の時点)" if target else f"学年: {grade}回生",
        f"課程: {curriculum.program.code} {curriculum.program.name}",
        f"入学年度: {curriculum.admission_year}年度",
    ]
    if requirements.track:
        student.append(f"選択コース: {requirements.track}")
    elif requirements.available_tracks:
        names = "、".join(f"{t.key}({t.name})" for t in requirements.available_tracks)
        student.append(f"コース未選択(選択できるコース: {names})")

    status = format_requirements(requirements)

    sections = [
        _section(
            "対象学期",
            [
                f"{target.year}年度 {target.term}(第{target.semester}セメスター)。"
                "【候補科目】はこの学期の履修登録で登録するクラスに絞ってある。"
                if target
                else "指定なし(前期・後期のクラスが混在している。どちらか一方の学期に絞ること)"
            ],
        ),
        _section("学生情報", student),
        _section("卒業要件の充足状況", status),
        _section(
            "履修登録単位数の上限",
            _format_registration_limits(curriculum, grade, target, budget),
        ),
        _section("修得済み科目", _format_completed(profile.completed_courses)),
        _section("登録済み科目", _format_registered(profile.completed_courses)),
        _section("先修条件", _format_prerequisites(prerequisites)),
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


@dataclass(frozen=True)
class ProposalContext:
    """1回の提案に要るもの。プロンプトと、モデルの下書きを提案に組み上げる材料。

    `classes` は【候補科目】に載せたクラスをシラバスコードで引く表で、値は理由を
    空にした `ProposedCourse` である。`output_type` はその回の候補コードだけを
    選べる下書きの形式(`proposal_draft_model()`)。
    """

    prompt: str
    classes: dict[str, ProposedCourse]
    budget: CreditBudget | None
    output_type: type[BaseModel]
    # 【卒業要件の充足状況】の中身。説明文の書き直し(`rewrite_summary()`)に渡す
    requirements_text: str = ""


def _proposed_course(candidate: Candidate, offered: OfferedClass) -> ProposedCourse:
    """候補の1クラスを、理由を空にした提案の1科目にする。値はすべて候補一覧から採る。"""
    day = offered.day_of_week if offered.day_of_week in _DAYS else None
    return ProposedCourse(
        syllabus_code=offered.syllabus_code,
        title=candidate.course.title,
        day=day,
        period=offered.period if day else None,
        term=offered.term,
        credits=candidate.course.credits,
        category=student_type(candidate.course),
        reason="",
    )


_DAYS = ("月", "火", "水", "木", "金", "土")


def _max_items(classes: dict[str, ProposedCourse], budget: CreditBudget | None) -> int:
    """下書きの件数の上限(暴走止め)。上限単位 ÷ 候補の最小単位 + 余裕で求める。"""
    if budget is None:
        return MAX_DRAFT_ITEMS
    smallest = min((c.credits for c in classes.values() if c.credits), default=1.0)
    fits = int(budget.remaining // smallest)
    return max(1, min(MAX_DRAFT_ITEMS, fits + DRAFT_ITEMS_SLACK))


async def build_proposal_context(
    profile: StudentProfile,
    admission_year: int,
    *,
    track: str | None = None,
    wishes: str | None = None,
    offering_year: int | None = None,
    target: TargetTerm | None = None,
) -> ProposalContext:
    """履修提案のプロンプトと、下書きを提案に組み上げる材料を揃える(§7.2 の 1〜5)。

    Args:
        profile: 学生プロファイル(§5.2.1)。`program` は課程コード、`grade` は必須。
        admission_year: 入学年度。プロファイルに無いため呼び出し側が渡す(§6.1)。
        track: 選択したコースの `tracks[].key`。コース別下限の判定に使う。
        wishes: 希望条件(自由文)。
        offering_year: 参照する開講年度。既定は `settings.offering_year`(§4.4.3)。
        target: 提案する学期(§7.2)。与えると候補のクラスをその学期に絞り、配当年次と
            CAP の該当セメスターにその学期の学年を使う。

    Raises:
        ProposalError: 課程コードが無い、履修要項が無い、学年が無い、候補が無い場合。
    """
    program_code = profile.program
    if not program_code:
        raise ProposalError("課程コード(profile.program)が必要です")

    loaded = resolve_curriculum(program_code, admission_year)
    requirements = judge_requirements(loaded, profile, track=track)
    candidates = select_candidates(
        loaded, profile, grade=target.grade if target else None
    )
    year = offering_year if offering_year is not None else get_settings().offering_year
    index = await fetch_offering_index(
        (code for candidate in candidates for code in candidate.codes), year=year
    )
    # 履修登録できないクラスは候補に載せない(§6.1)。`attach_offerings()` が
    # 1科目あたりのクラス数を絞る**前**に掛かる
    eligibility = await fetch_eligibility(loaded.curriculum, year=year)
    attached = attach_offerings(
        candidates,
        index,
        eligibility=eligibility,
        term=target.term if target else None,
    )
    # 先修条件を満たさない科目は候補から外す。対象学期に開講される候補にだけ掛け、
    # プロンプトの【先修条件】に載るのも実際に選べる科目の条件だけにする
    attached, prerequisites = check_prerequisites(
        attached, loaded.curriculum, profile.completed_courses, target=target
    )
    classes = {
        offered.syllabus_code: _proposed_course(candidate, offered)
        for candidate in attached
        for offered in candidate.classes
    }
    if not classes:
        raise ProposalError("提案できる候補科目がありません")

    grade = target.grade if target else (profile.grade or 1)
    semesters = {target.semester} if target else {grade * 2 - 1, grade * 2}
    cap = semester_cap(loaded.curriculum, semesters)
    budget = (
        CreditBudget(
            cap=cap,
            registered=(
                registered_credits_in(profile.completed_courses, target) if target else 0.0
            ),
        )
        if cap is not None
        else None
    )
    prompt = render_prompt(
        loaded,
        profile,
        requirements,
        attached,
        wishes=wishes,
        target=target,
        budget=budget,
        prerequisites=prerequisites,
    )
    return ProposalContext(
        prompt=prompt,
        classes=classes,
        budget=budget,
        output_type=proposal_draft_model(list(classes), _max_items(classes, budget)),
        requirements_text="\n".join(format_requirements(requirements)),
    )


async def build_proposal_prompt(
    profile: StudentProfile, admission_year: int, **kwargs
) -> str:
    """履修提案のプロンプトだけを返す(`build_proposal_context()` の `prompt`)。"""
    return (await build_proposal_context(profile, admission_year, **kwargs)).prompt


# --- 6. 下書きから提案を組み上げる(§7.2) ---


# コマが重なったときにどちらを残すかの重さ。小さいほど重い(§7.2.2)
_WEIGHT = {"必修": 0, "選択必修": 1, "選択": 2}


def _weight(course: ProposedCourse) -> int:
    """履修区分の重さ。必修 > 選択必修 > 選択 > それ以外。"""
    return _WEIGHT.get(course.category or "", 3)


def _overlaps(a: ProposedCourse, b: ProposedCourse) -> bool:
    """同じ曜日・時限で開講期間が重なるか(§5.3 の検証と同じ規則)。"""
    if a.day is None or a.period is None or (a.day, a.period) != (b.day, b.period):
        return False
    qa, qb = quarters_of(a.term), quarters_of(b.term)
    if qa is not None and qb is not None:
        return bool(qa & qb)
    return a.term == b.term


def assemble_courses(
    drafts: Iterable[tuple[str, str]],
    context: ProposalContext,
) -> tuple[list[ProposedCourse], list[str]]:
    """下書き(シラバスコード, 理由)の並びを提案の科目にし、外した理由を返す。

    **作り直しをさせず、backend が確実な処理で整える**(作り直しは1回4〜5分かかる)。
    モデルの書いた順に1件ずつ見て、次のものを外す:

    - 候補に無いコード(下書きの形式が列挙で縛るので通常は起きない)
    - 同じ科目の2件目以降(同名の別クラスを含む)。情報が失われないので黙って外す
    - 先に採った科目と同じ曜日・時限で開講期間が重なるもの。ただし後から来た科目の
      方が重い(必修 > 選択必修 > 選択)なら、先に採った方を外して入れ替える
    - 採ると対象学期に登録できる残り単位を超えるもの

    後の2つは外した理由(調整の記録)を返す。記録は科目名ごとに1件で、同名の
    別クラスを後で採った科目には付けない。**記録は学生に見せない**(summary に
    混ぜない。`assemble_proposal()`)。
    """
    accepted: list[ProposedCourse] = []
    titles: set[str] = set()
    # 外した科目の理由。科目名ごとに最初の1件だけを持ち、同名の別クラスが後で
    # 採られた科目は最後に除く(採った科目を「外した」と書かないため)
    dropped: dict[str, str] = {}
    # 一度見たコード。同じ並びを繰り返し書く暴走(2026-09-23 の実機)で、外した
    # 科目の注記が繰り返されないよう、2回目以降は採否にかかわらず黙って飛ばす
    seen: set[str] = set()
    total = 0.0
    remaining = context.budget.remaining if context.budget else None
    for code, reason in drafts:
        base = context.classes.get(code)
        if base is None or code in seen:
            continue
        seen.add(code)
        course = base.model_copy(update={"reason": reason})
        key = normalize_title(course.title)
        if key in titles:
            continue
        clashes = [c for c in accepted if _overlaps(c, course)]
        # 重なった相手より重い(必修 > 選択必修 > 選択)なら、相手を外して入れ替える。
        # 同じ重さなら先に書いた方を残す(モデルが先に挙げた方を優先したとみなす)
        if clashes and not all(_weight(course) < _weight(c) for c in clashes):
            clash = clashes[0]
            dropped.setdefault(
                key,
                f"「{course.title}」は「{clash.title}」と{course.day}{course.period}限で"
                "開講期間が重なるため外しました。",
            )
            continue
        freed = sum(c.credits or 0 for c in clashes)
        if remaining is not None and total - freed + (course.credits or 0) > remaining:
            dropped.setdefault(
                key,
                f"「{course.title}」は対象学期に登録できる残り単位"
                f"({_credits(remaining)}単位)を超えるため外しました。",
            )
            continue
        for clash in clashes:
            accepted.remove(clash)
            clash_key = normalize_title(clash.title)
            titles.discard(clash_key)
            total -= clash.credits or 0
            dropped.setdefault(
                clash_key,
                f"「{clash.title}」は「{course.title}」と{clash.day}{clash.period}限で"
                f"開講期間が重なり、{course.category}の「{course.title}」を優先したため"
                "外しました。",
            )
        accepted.append(course)
        titles.add(key)
        total += course.credits or 0

    return accepted, [text for key, text in dropped.items() if key not in titles]


def assemble_proposal(
    drafts: Iterable[tuple[str, str]],
    summary: str | None,
    context: ProposalContext,
    *,
    truncated: bool = False,
) -> tuple[TimetableProposal, list[str]]:
    """下書きから確定版の提案を組み上げ、調整の記録と一緒に返す。

    **調整の記録(外した科目と打ち切り)は summary に混ぜない。** summary は画面の
    吹き出しにそのまま出るため、backend の都合を学生に見せないためである。記録は
    SSE の result イベントに `adjustments` として別に載せる(frontend は読まない。
    確認用のスクリプトが表示する)。summary はモデルが書いたままで、書き終える前に
    切れたときだけ定型文にする。
    """
    courses, notes = assemble_courses(drafts, context)
    if truncated:
        notes.append("生成が最後まで完了しなかったため、書き終えた科目までで提案した。")
    text = (summary or "").strip() or "時間割を提案しました。各科目の理由を確認してください。"
    credits = [c.credits for c in courses]
    total = sum(credits) if None not in credits else None
    return TimetableProposal(courses=courses, total_credits=total, summary=text), notes
