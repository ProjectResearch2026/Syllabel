import asyncio
from collections import Counter
from functools import lru_cache

import httpx

from app.settings import get_settings

# 検索結果のうち詳細を補う上限。1件ずつ api-clean を叩くため青天井にはしない
_ENRICH_LIMIT = 20


@lru_cache
def _get_client() -> httpx.AsyncClient:
    """モジュールスコープで共有する httpx.AsyncClient を返す。design.md §6.2。"""
    s = get_settings()
    return httpx.AsyncClient(
        base_url=s.api_clean_base_url,
        timeout=s.http_timeout,
    )


async def search_syllabi(
    q: str | None = None,
    faculty: str | None = None,
    program: str | None = None,
    campus: str | None = None,
    term: str | None = None,
    day: str | None = None,
    period: str | None = None,
    year: int | None = None,
    instructor: str | None = None,
    grade: int | None = None,
    limit: int | None = None,
    offset: int | None = None,
) -> dict:
    """シラバス一覧を検索して返す。design.md §6.2 GET /syllabi。

    Args:
        q: キーワード検索
        faculty: 学部
        program: 課程
        campus: キャンパス
        term: 開講学期
        day: 開講曜日
        period: 開講時限
        year: 開講年度
        instructor: 担当教員名
        grade: 対象学年
        limit: 取得件数上限
        offset: 取得開始位置

    Returns:
        api-clean の /syllabi レスポンス。実形式(2026-07-09 実疎通確認済み):
        {
            "count": int,    # 返却件数(総ヒット数ではない)
            "limit": int,
            "offset": int,
            "results": [
                {
                    "syllabus_code": str,  # 講義コード。get_syllabus() に渡すキー
                    "year": int,
                    "course_title": str,
                    ...
                }
            ]
        }
    """
    params = {
        "q": q,
        "faculty": faculty,
        "program": program,
        "campus": campus,
        "term": term,
        "day": day,
        "period": period,
        "year": year,
        "instructor": instructor,
        "grade": grade,
        "limit": limit,
        "offset": offset,
    }
    # None のパラメータは送らない
    params = {k: v for k, v in params.items() if v is not None}
    resp = await _get_client().get("/syllabi", params=params)
    resp.raise_for_status()
    return resp.json()


async def get_syllabus(code: str) -> dict:
    """シラバス詳細を返す。design.md §6.2 GET /syllabi/{code}。

    Args:
        code: シラバスコード(api-clean の syllabus_code)

    Returns:
        api-clean の /syllabi/{code} レスポンス(dict)をそのまま返す。
    """
    resp = await _get_client().get(f"/syllabi/{code}")
    resp.raise_for_status()
    return resp.json()


async def search_syllabi_for_agent(**kwargs) -> dict:
    """検索結果に、クラスを見分けるための情報を足して返す。design.md §7.4.1 規則6。

    一覧(GET /syllabi)は担当教員も term_schedule_raw も返さない。そのため LLM は
    同名科目のクラスを区別できず、2026-09-06 の実機検証では詳細を1件ずつ取得した
    うえで別クラスの属性を混ぜた(植村担当クラスに丸山担当クラスの時限を付けた)。
    詳細取得を backend 側で並行して済ませ、行ごとに確定した情報として渡す。
    LLM にクラス単位の往復をさせるより速く、取り違えの余地も小さい。

    Returns:
        search_syllabi() のレスポンスに次を足したもの。
        results[].instructors: 担当教員名のリスト(詳細から)
        results[].term_schedule_raw: 開講コマの原文(連続コマはここにしかない)
        same_title_classes: 同名科目のクラス数。同名が複数ある科目のみ
        may_have_more: 取得件数が上限に達しており続きがありうる場合のみ True
    """
    data = await search_syllabi(**kwargs)
    results = data.get("results") or []

    targets = [r for r in results if r.get("syllabus_code")][:_ENRICH_LIMIT]
    details = await asyncio.gather(
        *(get_syllabus(r["syllabus_code"]) for r in targets),
        return_exceptions=True,
    )
    for row, detail in zip(targets, details):
        # 1件の失敗で検索全体を落とさない。その行は補われないだけ
        if isinstance(detail, BaseException):
            continue
        row["instructors"] = [
            i["kanji_name"] for i in detail.get("instructors") or [] if i.get("kanji_name")
        ]
        row["term_schedule_raw"] = detail.get("term_schedule_raw")

    counts = Counter(r.get("course_title") for r in results)
    data["same_title_classes"] = {t: n for t, n in counts.items() if t and n > 1}

    # 件数は取得できた範囲のものである。打ち切られていれば「これで全部」と書かせない
    limit, count = data.get("limit"), data.get("count")
    if isinstance(limit, int) and isinstance(count, int) and count >= limit:
        data["may_have_more"] = True

    return data


async def get_masters() -> dict:
    """検索絞り込み用の値マスタを返す。design.md §6.2 GET /masters。

    Returns:
        api-clean の /masters レスポンス(dict)をそのまま返す。
    """
    resp = await _get_client().get("/masters")
    resp.raise_for_status()
    return resp.json()
