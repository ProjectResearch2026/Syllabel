from functools import lru_cache
from typing import Any

import httpx

from app.agents.instructor_name import spell_instructor_name
from app.agents.title_search import matches_title
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
    text: str | None = None,
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
        q: キーワード検索(科目名だけに当たる)
        text: 講義の本文の検索(科目名・サブタイトル・講義概要・到達目標・授業計画)。
            空白で区切った語は AND。api-clean 0.4.0 以降(`api_clean_version()`)。
            古い api-clean は未知の条件を黙って無視して全件を返すので、版を確かめてから送る
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
        "text": text,
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


async def search_syllabi_by_instructor(instructor: str, **params: Any) -> dict:
    """教員名でシラバスを検索する。表記の揺れを埋めて引き直す。design.md §6.1 / §6.2。

    **api-clean の `instructor` は登録された表記のままの部分一致であり、姓名の
    区切りの揺れを吸収しない。** 教員名は全角スペース区切りで登録されているため、
    `search_syllabi(instructor=...)` をそのまま使うと「山田 太郎」(半角)も
    「山田太郎」(区切りなし)も0件になる。入力どおりの語で空振りしたときは、
    登録表記を組み立て直して引き直す(`app/agents/instructor_name.py`)。

    引き直しは**空振りしたときだけ**行う。姓のみ(`山田`)や全角区切りの
    フルネーム(`山田　太郎`)は入力どおりの1回で当たるため、リクエストは
    従来と同じ1回で済む。組み立ての問い合わせは `limit=1` で引く。

    **問い合わせのどれかが失敗したら例外をそのまま送出する。** 失敗を「外れ」と
    扱うと、当たるはずだった語が落ちたときに「見つからない」という誤った答えになる。

    Args:
        instructor: 担当教員名。空白だけのときは教員名の条件なしで引く
        **params: `search_syllabi()` に渡すその他の条件(`instructor` 以外)。
            組み立ての問い合わせにも同じ条件を掛ける

    Returns:
        `search_syllabi()` と同じ形。組み立てられなかったときは入力どおりで
        引いた結果(0件)を返す。
    """
    word = instructor.strip()
    if not word:
        return await search_syllabi(**params)

    first = await search_syllabi(instructor=word, **params)
    if first.get("results"):
        return first

    async def exists(query: str) -> bool:
        payload = await search_syllabi(instructor=query, **{**params, "limit": 1})
        return bool(payload.get("results"))

    spelled = await spell_instructor_name(word, exists)
    if spelled is None or spelled == word:
        return first
    return await search_syllabi(instructor=spelled, **params)


# 科目名の照合のために全件を辿るときの1ページあたりの件数(api-clean の `MAX_ROWS`)と、
# 辿るページ数の上限
_ALL_PAGE_SIZE = 500
_ALL_MAX_PAGES = 40


async def search_syllabi_by_title(
    q: str,
    *,
    instructor: str | None = None,
    limit: int | None = None,
    offset: int | None = None,
    **params: Any,
) -> dict:
    """科目名の表記の揺れを畳んでシラバスを検索する。design.md §6.1 / §6.2。

    **api-clean の `q` は正規化の無い `ILIKE` であり、科目名の表記の揺れを吸収しない。**
    「プログラミング基礎演習1」(登録は `Ⅰ`)や「仏教の思想Ａ」(登録は半角 `A`)は
    `q` では0件になる。そこで `q` は api-clean に送らず、その他の条件に当たる全件を
    500件ずつ辿ってから手元で照合する(`app/agents/title_search.py`)。照合の規則は
    検索画面(frontend の `lib/titleSearch.ts`)と同じである。

    教員名が指定されたときは、教員名の表記の揺れも埋めて引く
    (`search_syllabi_by_instructor()`)。`limit` / `offset` は照合後の並びに掛ける。

    Returns:
        `search_syllabi()` と同じ形。`count` は返した件数。
    """
    rows: list[dict] = []
    for page in range(_ALL_MAX_PAGES):
        page_params = {**params, "limit": _ALL_PAGE_SIZE, "offset": page * _ALL_PAGE_SIZE}
        payload = (
            await search_syllabi_by_instructor(instructor, **page_params)
            if instructor
            else await search_syllabi(**page_params)
        )
        batch = payload.get("results") or []
        rows += batch
        if len(batch) < _ALL_PAGE_SIZE:
            break

    hits = [row for row in rows if matches_title(row.get("course_title") or "", q)]
    start = offset or 0
    results = hits[start : start + limit] if limit is not None else hits[start:]
    return {"count": len(results), "limit": limit, "offset": start, "results": results}


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


async def get_healthz() -> dict:
    """api-clean の死活と版を返す。design.md §6.2 GET /healthz。

    0.4.0 以降は `{"status": "ok", "version": "0.4.0"}` を返す。トークンゲートウェイは
    `/healthz` を通す(`/` の目次は通さない)ため、版を知る口はここだけである。
    """
    resp = await _get_client().get("/healthz")
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
