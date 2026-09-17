"""履修要項の参照と卒業要件の充足判定。design.md §6.1。

`GET /api/curricula/{program_code}/{admission_year}` と
`POST /api/requirements` の2本を持つ(§4.2.1 のファイルツリー)。

## `GET /api/curricula/{program_code}/{admission_year}`

検索画面のタグ表示(§8)と卒業残り単位の表示(§4.4.5)が必要とする**科目レイヤ**
だけを返す。`requirement_slots` / `credit_caps` / `tracks` / `prerequisites` /
`grade_up_requirements` / `registration_limits` の規則レイヤは返さない。要件枠ごとの
不足単位は `POST /api/requirements` で得る(§4.4.3 / §4.4.5)。

backend は次の3点を解決済みの状態で返し、履修要項の構造をクライアントに
持ち込まない(§6.1):

- マージ後の `courses`(教養教育科目の取り込み・課程別除外・他課程からの
  専門関連科目の導出)。検索結果には他課程が開講する科目も現れるため、
  当該課程の設置科目だけではその大半がタグなしになる
- 各科目の `syllabusCodes`。コードは `curricula/` 側になく開講年度ファイルの
  `resolved` が持つ(§4.4.2)ため、解決は backend が行う。当年度不開講
  (`not_offered`)・名寄せ未解決(`unresolved`)の科目は空配列とし、
  クライアントはタグ付けの対象外として扱う(§5.1.4)
- `own`。当該課程の設置科目なら true、他課程から導出した専門関連科目なら false。
  導出科目の `category` / `type` は**導出元の課程にとっての**区分であり、
  閲覧している学生にとっては専門関連科目にあたる。そのまま出すと誤ったタグに
  なるため、クライアントは `own: false` の科目を `専門関連` として扱う(§8)

## `POST /api/requirements`

要件枠ごとの修得済み単位・不足単位を返す。判定規則(規則レイヤ)をクライアントへ
渡さないための口であり、判定そのものは `app/curricula/requirements.py` の純関数が
担う(§4.4.5)。既修得科目を本文で受けるため `POST` とし、受け取った学生プロファイルは
永続化もログ記録もしない(§4.2.3)。

レスポンスは camelCase(`to_camel`)。`curricula/` の YAML は snake_case のまま
扱う規約(§5.1.5)であり、変換はこのレスポンスモデル側の責務である。
"""

import hashlib
import json

from fastapi import APIRouter, Header, HTTPException, Response
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.curricula.loader import LoadedCurriculum, get_curricula
from app.curricula.requirements import RequirementsError, UncountedReason, judge
from app.schemas.curriculum import (
    Category,
    CourseType,
    Quarter,
    Subcategory,
    Term,
)
from app.schemas.student import StudentProfile
from app.settings import get_settings

router = APIRouter(prefix="/api", tags=["curricula"])

# 学生データを含まない GET であり、内容は `curricula/` / `offerings/` の更新
# (= デプロイ)でしか変わらない(§4.4.4)。ETag による再検証を効かせて、
# マージ後の全課程分の再送を避ける(§4.4.3)。2024年度入学コホートは科目の実体が
# 650件(教養129 + 6課程の専攻521)で、1課程あたりのレスポンスはそこから自課程が
# 同名で開講する分の重複を除いた568〜577科目、約129KB / gzip 約9KB となる
CACHE_CONTROL = "public, max-age=3600, must-revalidate"


class _CamelModel(BaseModel):
    """レスポンスモデルの基底。JSON は camelCase で出す(§6.1)。"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class GraduationOut(_CamelModel):
    """卒業要件のうちクライアントが必要とする2値(§6.1)。

    卒業残り単位の表示(§4.4.5)に要る。**設置科目の単位数の総和は卒業必要
    単位数ではない**ため、クライアントは `courses` から算出できない。
    `excluded_types` は卒業要件単位数に算入しない科目種別(例: `随意`)。
    """

    total_credits: int
    excluded_types: list[CourseType]


class CourseOut(_CamelModel):
    """マージ後の科目1件(§6.1)。

    `own` は当該課程の設置科目(教養教育科目 + 専攻科目)なら true、他課程から
    導出した専門関連科目なら false。`syllabus_codes` は開講年度ファイルの
    `resolved` から合成した値で、コードを持たない科目では空配列となる。
    """

    title: str
    category: Category
    subcategory: Subcategory | None = None
    type: CourseType
    credits: int
    grade: int
    term: Term
    quarters: list[Quarter] | None = None
    kikan: bool
    own: bool
    syllabus_codes: list[str]


class CurriculaResponse(_CamelModel):
    """`GET /api/curricula/{program_code}/{admission_year}` のレスポンス(§6.1)。

    `offering_year` は `syllabus_codes` の出所となった開講年度であり、backend が
    参照する1年度(§4.4.3)。クライアントがどの年度の名寄せ結果を見ているかを
    判別できるように返す。
    """

    program_code: str
    admission_year: int
    offering_year: int
    graduation: GraduationOut
    courses: list[CourseOut]


def _build(loaded: LoadedCurriculum) -> CurriculaResponse:
    """ロード済みの履修要項からレスポンスを組み立てる。

    `program_code` / `admission_year` はリクエストのパスではなくロード結果の値を
    返す(ロードのキーはこの2つであり、両者は一致する)。
    """
    merged = loaded.curriculum
    return CurriculaResponse(
        program_code=merged.program.code,
        admission_year=merged.admission_year,
        offering_year=get_settings().offering_year,
        graduation=GraduationOut(
            total_credits=merged.graduation.total_credits,
            excluded_types=merged.graduation.excluded_types,
        ),
        courses=[
            CourseOut(
                title=c.title,
                category=c.category,
                subcategory=c.subcategory,
                type=c.type,
                credits=c.credits,
                grade=c.grade,
                term=c.term,
                quarters=c.quarters,
                kikan=c.kikan,
                own=c.own,
                syllabus_codes=loaded.syllabus_codes(c),
            )
            for c in merged.courses
        ],
    )


# 課程・入学年度ごとの本文と ETag。履修要項は起動時に1度読んだきり変わらない
# (§4.4.3)ため、リクエストごとに数百科目を組み直さずに済ませる。304 を返す経路も
# これで本文の組み立てを伴わない
_payloads: dict[tuple[str, int], tuple[bytes, str]] = {}


def clear_payload_cache() -> None:
    """`_payloads` を捨てる。`get_curricula.cache_clear()` と対で使う(テスト用)。"""
    _payloads.clear()


def _payload(program_code: str, admission_year: int) -> tuple[bytes, str]:
    """レスポンス本文(JSON バイト列)と ETag を返す。

    Raises:
        HTTPException: 当該の (課程コード, 入学年度) が存在しない場合の 404。
    """
    key = (program_code, admission_year)
    cached = _payloads.get(key)
    if cached is not None:
        return cached

    loaded = get_curricula().get(key)
    if loaded is None:
        raise HTTPException(
            status_code=404,
            detail=f"履修要項がありません: 課程コード {program_code} / {admission_year}年度入学",
        )

    body = json.dumps(
        _build(loaded).model_dump(by_alias=True),
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    # 内容から作るため、再起動やレプリカ間でも同じ内容なら同じ値になる
    etag = f'"{hashlib.sha256(body).hexdigest()[:32]}"'
    _payloads[key] = (body, etag)
    return body, etag


def _matches(if_none_match: str | None, etag: str) -> bool:
    """`If-None-Match` が現在の ETag に一致するか(RFC 9110 §13.1.2)。

    カンマ区切りの複数指定と `*`、および弱い検証子の接頭辞 `W/` を受ける。
    """
    if not if_none_match:
        return False
    for candidate in (v.strip() for v in if_none_match.split(",")):
        if candidate == "*":
            return True
        if candidate.removeprefix("W/") == etag:
            return True
    return False


@router.get(
    "/curricula/{program_code}/{admission_year}",
    response_model=CurriculaResponse,
    response_model_by_alias=True,
)
def get_curriculum(
    program_code: str,
    admission_year: int,
    if_none_match: str | None = Header(default=None, alias="If-None-Match"),
) -> Response:
    """課程コード・入学年度で履修要項の科目レイヤを引く(§6.1)。

    `program_code` は課程コード2桁("02" 等)。課程は改称され得るため課程名では
    なくコードを識別子とする(§4.4.2)。未知の組み合わせは 404。
    """
    body, etag = _payload(program_code, admission_year)
    headers = {"ETag": etag, "Cache-Control": CACHE_CONTROL}
    if _matches(if_none_match, etag):
        return Response(status_code=304, headers=headers)
    return Response(
        content=body,
        media_type="application/json",
        headers=headers,
    )


# --- POST /api/requirements(§4.4.5 / §6.1) ---
#
# 既修得科目を本文で受けるため `GET` ではなく `POST` とする(成績情報を URL や
# アクセスログに残さないため。§4.4.5)。判定そのものは `app/curricula/requirements.py`
# の純関数が担い、本モジュールは (課程コード, 入学年度) の解決と JSON の形だけを
# 受け持つ。受け取った学生プロファイルは永続化もログ記録もしない(§4.2.3)。


class RequirementsRequest(_CamelModel):
    """`POST /api/requirements` のリクエスト(§6.1)。

    課程コードは `profile.program` から採る。frontend は `GET /api/curricula` の
    パスにも同じ値を用いており(§5.2.1 の `program` は課程コード)、本文に
    重ねて持たせると両者が食い違ったときの解釈が定まらない。入学年度は
    プロファイルに無いため別に受け取る(クライアントは学年から算出する)。
    """

    profile: StudentProfile
    admission_year: int
    track: str | None = None


class AssignedCourseOut(_CamelModel):
    """要件枠に計上した科目1件。カスケードで分かれた分は枠ごとに現れる。"""

    title: str
    credits: float


class SlotStatusOut(_CamelModel):
    """要件枠1つの充足状況。`shortfall` が不足単位(§4.4.5)。"""

    key: str
    required: int
    earned: float
    shortfall: float
    notes: str | None = None
    courses: list[AssignedCourseOut]


class TrackConstraintStatusOut(_CamelModel):
    """コース別下限1件の充足状況(§5.1.5 `tracks[].constraints`)。"""

    slot: str
    track_group: str
    pool: int
    required: int
    earned: float
    shortfall: float


class UncountedCourseOut(_CamelModel):
    """卒業要件単位に算入しなかった科目(またはその一部)と理由。"""

    title: str
    credits: float
    reason: UncountedReason


class TrackInfoOut(_CamelModel):
    """選択できるコース。`track` を指定しなかったクライアントへの案内。"""

    key: str
    name: str


class RequirementsResponse(_CamelModel):
    """`POST /api/requirements` のレスポンス(§6.1)。"""

    program_code: str
    admission_year: int
    total_credits: int
    earned_credits: float
    remaining_credits: float
    satisfied: bool
    slots: list[SlotStatusOut]
    track: str | None = None
    track_constraints: list[TrackConstraintStatusOut]
    available_tracks: list[TrackInfoOut]
    uncounted: list[UncountedCourseOut]


@router.post(
    "/requirements",
    response_model=RequirementsResponse,
    response_model_by_alias=True,
)
def post_requirements(request: RequirementsRequest, response: Response) -> RequirementsResponse:
    """要件枠ごとの修得済み単位・不足単位を返す(§4.4.5 / §6.1)。

    未知の (課程コード, 入学年度) は 404、`profile.program` が空の場合と
    未知のコースを指定した場合は 400。
    """
    program_code = request.profile.program
    if not program_code:
        raise HTTPException(
            status_code=400,
            detail="profile.program に課程コードが必要です",
        )

    loaded = get_curricula().get((program_code, request.admission_year))
    if loaded is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"履修要項がありません: 課程コード {program_code} / "
                f"{request.admission_year}年度入学"
            ),
        )

    try:
        result = judge(
            loaded.curriculum,
            request.profile.completed_courses,
            track=request.track,
        )
    except RequirementsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # 成績情報を含むため、ブラウザにも中間経路にも残させない(§4.2.3)
    response.headers["Cache-Control"] = "no-store"
    return RequirementsResponse.model_validate(result.model_dump())
