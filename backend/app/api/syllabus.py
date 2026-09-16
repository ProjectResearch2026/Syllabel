import hashlib
import json
import logging
import time

from fastapi import APIRouter, Header, HTTPException, Query, Response
import httpx

from app.agents.tools import get_masters, get_syllabus, search_syllabi

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["syllabus"])


@router.get("/syllabi")
async def api_search_syllabi(
    q: str | None = Query(default=None),
    faculty: str | None = Query(default=None),
    program: str | None = Query(default=None),
    campus: str | None = Query(default=None),
    term: str | None = Query(default=None),
    day: str | None = Query(default=None),
    period: str | None = Query(default=None),
    year: int | None = Query(default=None),
    instructor: str | None = Query(default=None),
    grade: int | None = Query(default=None),
    limit: int | None = Query(default=None),
    offset: int | None = Query(default=None),
):
    try:
        return await search_syllabi(
            q=q, faculty=faculty, program=program, campus=campus,
            term=term, day=day, period=period, year=year,
            instructor=instructor, grade=grade, limit=limit, offset=offset,
        )
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404)
        raise HTTPException(status_code=502, detail="upstream error")


@router.get("/syllabi/{code}")
async def api_get_syllabus(code: str):
    try:
        return await get_syllabus(code)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404)
        raise HTTPException(status_code=502, detail="upstream error")


@router.get("/masters")
async def api_get_masters():
    try:
        return await get_masters()
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404)
        raise HTTPException(status_code=502, detail="upstream error")


# --- GET /api/course-targets(§6.1.3 / §8) ---
#
# **検索結果のタグ付けは、絞り込みの対象となる全コードの対象課程を要する。**
# タグは学生プロファイルとの突合で決まり(§6.1)、プロファイルはブラウザにしか
# 無い(要件§5)。したがって絞り込みは api-clean の検索条件にできず、クライアントが
# 手元で振り分けるしかない。**さらに、絞り込んだ結果をサーバへ送ることもできない**
# — 「修得済みのコード一覧」はその学生の成績そのものであり、送れば成績を
# サーバに渡すことになる。よって振り分けはクライアントで閉じる必要があり、
# そのためには**検索結果の全件ぶんの対象課程**が手元に要る。
#
# api-clean の `GET /syllabi`(一覧)は対象課程を返さない(1科目に複数の課程が
# 対応するため `SELECT DISTINCT` から外れている。§6.2)。1件ずつ詳細を引くと
# 1,200 リクエストになるため、**課程名で絞った一覧を課程ごとに引いて集合演算で
# 組み立てる**(履修提案の `fetch_eligibility()` と同じ手)。
#
# **このレスポンスに学生データは1件も含まれない。** (開講年度, 学部)だけで決まる
# ため ETag を効かせて再送を避けられる。2026年度・先端理工学部で 1,219 コード /
# 約 99KB / gzip 約 4KB。

# 一括取得の1ページあたりの件数と、辿るページ数の上限(`proposal_agent` と同じ根拠)
_PAGE_SIZE = 500
_MAX_PAGES = 40

# 組み立て結果の保持期間(秒)。`curricula` と違い上流(api-clean)の更新で変わり得る
# ため、恒久キャッシュにはしない
_TARGETS_TTL_SECONDS = 3600

# (開講年度, 学部) → (本文, ETag, 作った時刻)
_targets_cache: dict[tuple[int, str], tuple[bytes, str, float]] = {}


def clear_targets_cache() -> None:
    """`_targets_cache` を捨てる(テスト用)。"""
    _targets_cache.clear()


async def _codes_of(*, year: int, faculty: str, program: str | None = None) -> list[str]:
    """条件に当たるシラバスコードを一括取得する。"""
    codes: list[str] = []
    for page in range(_MAX_PAGES):
        payload = await search_syllabi(
            year=year,
            faculty=faculty,
            program=program,
            limit=_PAGE_SIZE,
            offset=page * _PAGE_SIZE,
        )
        rows = payload.get("results") or []
        codes += [c for row in rows if (c := row.get("syllabus_code"))]
        if len(rows) < _PAGE_SIZE:
            break
    else:
        logger.warning(
            "対象課程の取得がページ上限に達しました: 学部=%s 課程=%s", faculty, program
        )
    return codes


async def _build_targets(year: int, faculty: str) -> dict[str, list[str]]:
    """`シラバスコード → 対象課程` を組み立てる。

    課程名の一覧は `GET /masters` の `course_program` から採る(検索画面の
    絞り込みと同じ出所)。**どの課程の結果にも現れないコードは対象課程を持たない**
    = 課程指定なしであり、空配列になる(全学向けの教養教育科目・学部名義のクラス)。
    """
    masters = await get_masters()
    names = [
        name
        for item in (masters.get("course_program") or [])
        if (name := item.get("name"))
    ]

    targets: dict[str, list[str]] = {code: [] for code in await _codes_of(year=year, faculty=faculty)}
    for name in names:
        for code in await _codes_of(year=year, faculty=faculty, program=name):
            if code in targets:
                targets[code].append(name)
    return targets


async def _targets_payload(year: int, faculty: str) -> tuple[bytes, str]:
    """レスポンス本文(JSON バイト列)と ETag を返す。"""
    key = (year, faculty)
    cached = _targets_cache.get(key)
    if cached is not None and time.monotonic() - cached[2] < _TARGETS_TTL_SECONDS:
        return cached[0], cached[1]

    targets = await _build_targets(year, faculty)
    body = json.dumps(
        {"offeringYear": year, "faculty": faculty, "targets": targets},
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    etag = f'"{hashlib.sha256(body).hexdigest()[:32]}"'
    _targets_cache[key] = (body, etag, time.monotonic())
    logger.info("対象課程を組み立てました: %s / %d年度 / %d件", faculty, year, len(targets))
    return body, etag


@router.get("/course-targets")
async def api_course_targets(
    year: int = Query(description="開講年度"),
    faculty: str = Query(description="学部名。完全一致"),
    if_none_match: str | None = Header(default=None, alias="If-None-Match"),
) -> Response:
    """開講年度と学部で、シラバスコード → 対象課程の対応をまとめて返す(§6.1.3)。

    検索結果のタグ付けが**絞り込みの対象となる全件**について履修可否を判定できる
    ようにするための口である。学生データは含まない。
    """
    try:
        body, etag = await _targets_payload(year, faculty)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise HTTPException(status_code=404) from exc
        raise HTTPException(status_code=502, detail="upstream error") from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail="upstream error") from exc

    headers = {"ETag": etag, "Cache-Control": "public, max-age=3600, must-revalidate"}
    if if_none_match and any(
        v.strip().removeprefix("W/") == etag or v.strip() == "*"
        for v in if_none_match.split(",")
    ):
        return Response(status_code=304, headers=headers)
    return Response(content=body, media_type="application/json", headers=headers)
