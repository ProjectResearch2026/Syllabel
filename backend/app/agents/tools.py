import asyncio
from functools import lru_cache
from typing import Any

import httpx

from app.agents.instructor_name import instructor_queries
from app.settings import get_settings


@lru_cache
def _get_client() -> httpx.AsyncClient:
    """モジュールスコープで共有する httpx.AsyncClient を返す。design.md §6.2。

    トークンゲートウェイ経由で api-clean を引くときは Bearer トークンを付ける
    (§3.4.4)。api-clean を直接叩く開発環境ではトークンが無いため、ヘッダ自体を
    付けない(api-clean は無認証で、余計なヘッダを送る理由がない)。
    """
    s = get_settings()
    headers = (
        {"Authorization": f"Bearer {s.api_clean_api_key}"}
        if s.api_clean_api_key
        else {}
    )
    return httpx.AsyncClient(
        base_url=s.api_clean_base_url,
        timeout=s.http_timeout,
        headers=headers,
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


#: 表記の揺れを埋めるために引き直す教員名の、同時実行数。
#: 経路にトークンゲートウェイが挟まるため同時リクエストは控えめにする(§3.4.3)。
_INSTRUCTOR_QUERY_CONCURRENCY = 3


async def search_syllabi_by_instructor(instructor: str, **params: Any) -> dict:
    """教員名でシラバスを検索する。表記の揺れを埋めて引き直す。design.md §6.1 / §6.2。

    **api-clean の `instructor` は登録された表記のままの部分一致であり、姓名の
    区切りの揺れを吸収しない。** 教員名は全角スペース区切りで登録されているため、
    `search_syllabi(instructor=...)` をそのまま使うと「山田 太郎」(半角)も
    「山田太郎」(区切りなし)も0件になる。入力どおりの語で空振りしたときは、
    区切りを書き換えた語で引き直して束ねる(`app/agents/instructor_name.py`)。

    引き直しは**空振りしたときだけ**行う。姓のみ(`山田`)や全角区切りの
    フルネーム(`山田　太郎`)は入力どおりの1回で当たるため、リクエストは
    従来と同じ1回で済む。

    **引き直しのどれかが失敗したら例外をそのまま送出する。** 取れた分だけ返すと、
    当たるはずだった語が落ちたときに「見つからない」という誤った答えになる。

    Args:
        instructor: 担当教員名。空白だけのときは教員名の条件なしで引く
        **params: `search_syllabi()` に渡すその他の条件(`instructor` 以外)

    Returns:
        `search_syllabi()` と同じ形。引き直したときは `results` を
        シラバスコードで畳んだうえで、`count` をその件数に直して返す
        (api-clean の `count` は総ヒット数ではなくそのページの件数である)。
    """
    queries = instructor_queries(instructor)
    if not queries:
        return await search_syllabi(**params)

    first = await search_syllabi(instructor=queries[0], **params)
    if first.get("results") or len(queries) == 1:
        return first

    semaphore = asyncio.Semaphore(_INSTRUCTOR_QUERY_CONCURRENCY)

    async def fetch(query: str) -> dict:
        async with semaphore:
            return await search_syllabi(instructor=query, **params)

    rounds = await asyncio.gather(*(fetch(query) for query in queries[1:]))

    # 書き換えた語は同じ教員に当たり得る(登録表記が科目ごとに違う場合)ため畳む
    merged: list[dict] = []
    seen: set[str] = set()
    for payload in rounds:
        for row in payload.get("results") or []:
            code = row.get("syllabus_code")
            if code is not None:
                if code in seen:
                    continue
                seen.add(code)
            merged.append(row)

    # 束ねた結果が `limit` を超えないようにする(引き直しは語の数だけ結果を増やす)
    limit = params.get("limit")
    if limit is not None:
        merged = merged[:limit]
    return {**first, "count": len(merged), "results": merged}


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


async def get_masters() -> dict:
    """検索絞り込み用の値マスタを返す。design.md §6.2 GET /masters。

    Returns:
        api-clean の /masters レスポンス(dict)をそのまま返す。
    """
    resp = await _get_client().get("/masters")
    resp.raise_for_status()
    return resp.json()
