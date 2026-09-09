"""実 vLLM + api-clean 相手の履修提案(POST /api/proposal)疎通スモーク。
   使い方: python -m scripts.smoke_proposal [希望条件]
   起動中の backend に HTTP で問い合わせる(既定 http://localhost:8000)。
   compose なら docker compose exec backend python -m scripts.smoke_proposal。

   向き先は SMOKE_BASE_URL、無通信の打ち切り秒数は SMOKE_READ_TIMEOUT、
   対象の学生は SMOKE_PROGRAM_CODE / SMOKE_ADMISSION_YEAR / SMOKE_GRADE で変えられる。

   確かめるのは design.md §7.2 の3点:
   - snapshot が時間割を**逐次**組み上げていくこと(確定を待たずに描画できる)
   - result がコマ重複のない、候補科目から採った提案になっていること
   - done で締めること

   httpx.ASGITransport は使わない。応答を最後まで溜めてから返すため本文が
   逐次見えず、かつ timeout が一切効かない(生成が詰まると止められない)。

   学生データはこのファイル内の合成プロファイルであり、実在の成績ではない。"""
import asyncio
import contextlib
import json
import os
import sys
import time
import unicodedata

import httpx

BASE_URL = os.environ.get("SMOKE_BASE_URL", "http://localhost:8000")
# トークン間の無通信がこれを超えたら打ち切る。提案の生成は候補科目を載せた長い
# プロンプトを1回投げるだけだが、思考(reasoning)の間は何も流れない
READ_TIMEOUT = float(os.environ.get("SMOKE_READ_TIMEOUT", "900"))
# 最初の snapshot が届くまでの待ち時間を知らせる間隔
HEARTBEAT = 30.0
# backend の起動を待つ上限。compose の up 直後は listen まで数秒かかる
STARTUP_WAIT = 60.0

PROGRAM_CODE = os.environ.get("SMOKE_PROGRAM_CODE", "02")
ADMISSION_YEAR = int(os.environ.get("SMOKE_ADMISSION_YEAR", "2024"))
GRADE = int(os.environ.get("SMOKE_GRADE", "3"))

DAYS = ["月", "火", "水", "木", "金"]
PERIODS = [1, 2, 3, 4, 5]
RULE = "-" * 60

# 2024年度入学・知能情報メディア課程の3回生を想定した合成プロファイル。
# frontend の `lib/dummy/profiles.ts` と同じ内容(成績表取り込みの出力を模したもの)
COMPLETED = [
    ("仏教の思想A", 2024, "前期", 2),
    ("仏教の思想B", 2024, "後期", 2),
    ("英語総合1(A)", 2024, "前期", 1),
    ("英語総合1(B)", 2024, "後期", 1),
    ("英語総合2(A)", 2025, "前期", 1),
    ("英語総合2(B)", 2025, "後期", 1),
    ("スポーツ技術学A", 2024, "前期", 1),
    ("情報基礎", 2024, "前期", 2),
    ("メディア処理基礎", 2024, "後期", 2),
    ("ネットワーク基礎", 2024, "前期", 2),
    ("微分積分・演習", 2024, "通年", 4),
    ("情報システム基礎", 2025, "前期", 2),
    ("プログラミング基礎演習Ⅰ", 2024, "前期", 2),
    ("プログラミング基礎演習Ⅱ", 2025, "前期", 2),
    ("ソフトウェア基礎", 2025, "前期", 2),
    ("ハードウェア基礎", 2025, "後期", 2),
    ("データ構造とアルゴリズム・演習", 2025, "後期", 4),
]


def _request_body(preferences: str | None) -> dict:
    """`POST /api/proposal` の本文(§6.1)。課程コードは profile と別に送る。"""
    return {
        "studentProfile": {
            "grade": GRADE,
            "program": "知能情報メディア課程",
            "completedCourses": [
                {
                    "title": title,
                    "year": year,
                    "term": term,
                    "credits": credits,
                    "status": "passed",
                }
                for title, year, term, credits in COMPLETED
            ],
        },
        "programCode": PROGRAM_CODE,
        "admissionYear": ADMISSION_YEAR,
        "preferences": preferences,
    }


def _payload(line: str) -> dict | None:
    """SSE の1行から data のペイロードを取り出す。イベント区切りの空行等は None。"""
    if not line.startswith("data: "):
        return None
    return json.loads(line.removeprefix("data: "))


def _slot(course: dict) -> str:
    """科目1件の開講コマ。曜日・時限が無いものは「未定」と書く。"""
    day, period = course.get("day"), course.get("period")
    if day and period:
        return f"{day}{period}"
    return "未定"


def _width(text: str) -> int:
    """端末上の表示幅。日本語は2桁として数える(表の桁を揃えるため)。"""
    return sum(2 if unicodedata.east_asian_width(c) in "FWA" else 1 for c in text)


def _pad(text: str, width: int) -> str:
    """表示幅 `width` に収めて右を空白で埋める。溢れる分は切り捨てる。"""
    while _width(text) > width:
        text = text[:-1]
    return text + " " * (width - _width(text))


def _line(course: dict) -> str:
    """科目1件を1行にする。"""
    credits = course.get("credits")
    return (
        f"{_pad(_slot(course), 5)}{course.get('title') or '(名称未定)'}"
        f" [{course.get('syllabusCode') or 'コード無'}]"
        f" {course.get('term') or '学期未定'}"
        f" {'?' if credits is None else credits}単位"
    )


def _named(snapshot: dict) -> list[dict]:
    """snapshot のうち、科目名まで届いている科目。"""
    return [c for c in (snapshot.get("courses") or []) if c.get("title")]


def _grid(courses: list[dict]) -> str:
    """曜日×時限の表。コマ重複(§7.2)を目で確かめるために出す。"""
    cells: dict[tuple[str, int], list[str]] = {}
    for course in courses:
        day, period = course.get("day"), course.get("period")
        if day in DAYS and period in PERIODS:
            cells.setdefault((day, period), []).append(course.get("title") or "?")

    lines = ["    " + "".join(_pad(day, 16) for day in DAYS)]
    for period in PERIODS:
        row = f"{period}限 "
        for day in DAYS:
            # 重複は「A / B」と並べて出す。1コマに2つ入っていれば異常
            row += _pad(" / ".join(cells.get((day, period), [])), 16)
        lines.append(row.rstrip())

    undecided = [c for c in courses if _slot(c) == "未定"]
    if undecided:
        lines.append(
            "曜日時限未定: " + "、".join(c.get("title") or "?" for c in undecided)
        )
    return "\n".join(lines)


async def _wait_notice(started: float, state: dict) -> None:
    """最初の snapshot が届くまで待機時間を知らせる。

    思考(ThinkingPart)はクライアントに流れないため、モデルが考えている間は
    何も届かない。無言で待たされると停止と区別がつかないので経過を出す。
    """
    while not state["started"]:
        await asyncio.sleep(HEARTBEAT)
        if state["started"]:
            return
        print(f"… 待機 {time.monotonic() - started:.0f}秒", flush=True)


async def stream(client: httpx.AsyncClient, preferences: str | None) -> None:
    """SSE を受け、途中経過と確定版を表示する。

    snapshot は値が1つ完成するたびに届き、全文を出すと読めないため、
    **新しく科目名が確定した行だけ**を出す。逐次描画が成立しているか
    (確定を待たずに時間割が埋まっていくか)はこれで見る。
    """
    print(f"=== POST {BASE_URL}/api/proposal ===")
    print(f"対象: 課程コード {PROGRAM_CODE} / {ADMISSION_YEAR}年度入学 / {GRADE}回生")
    print(f"希望条件: {preferences or '(なし)'}")
    started = time.monotonic()
    state = {"started": False}
    notice = asyncio.create_task(_wait_notice(started, state))
    snapshots = 0
    shown = 0
    result: dict | None = None
    done = False
    try:
        async with client.stream(
            "POST", "/api/proposal", json=_request_body(preferences)
        ) as resp:
            print("status:", resp.status_code, resp.headers.get("content-type"))
            if resp.status_code != 200:
                # SSE ではなくエラー応答。本文を読まないと原因が分からない
                await resp.aread()
                print("body:", resp.text)
                return

            print(RULE)
            async for line in resp.aiter_lines():
                payload = _payload(line)
                if payload is None:
                    continue
                if "snapshot" in payload:
                    state["started"] = True
                    snapshots += 1
                    named = _named(payload["snapshot"])
                    for course in named[shown:]:
                        print(f"  + {_line(course)}", flush=True)
                    shown = len(named)
                elif "result" in payload:
                    result = payload["result"]
                elif "error" in payload:
                    state["started"] = True
                    print(f"[error] {payload['error']}")
                elif payload.get("done"):
                    done = True
    except httpx.ConnectError:
        print(f"[接続失敗] {BASE_URL} に繋がらない。backend が起動しているか確認する")
        return
    except httpx.ReadTimeout:
        print(f"[打ち切り] {READ_TIMEOUT:.0f}秒 応答が届かなかった")
    finally:
        notice.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await notice

    print(RULE)
    if result is not None:
        courses = result.get("courses") or []
        print(_grid(courses))
        print(f"\n合計 {result.get('totalCredits')}単位 / {len(courses)}科目")
        print(f"\n{result.get('summary')}")
        print(RULE)
    print(
        f"snapshot {snapshots}件 / result {'あり' if result else 'なし'}"
        f" / done {'あり' if done else 'なし'}"
        f" / {time.monotonic() - started:.1f}秒"
    )


async def _wait_for_server(client: httpx.AsyncClient) -> bool:
    """backend が listen するまで待つ。

    `docker compose up -d` の直後は uvicorn の起動が間に合わず接続できない。
    """
    deadline = time.monotonic() + STARTUP_WAIT
    notified = False
    while True:
        try:
            resp = await client.get("/healthz", timeout=5.0)
            if resp.status_code == 200:
                return True
        except httpx.ConnectError:
            pass
        if time.monotonic() >= deadline:
            print(f"[接続失敗] {BASE_URL} に繋がらない。backend が起動しているか確認する")
            print("  docker compose ps / docker compose logs --tail 30 backend")
            return False
        if not notified:
            print(f"{BASE_URL} の起動を待っています…")
            notified = True
        await asyncio.sleep(1.0)


async def main() -> None:
    preferences = " ".join(sys.argv[1:]) or None
    timeout = httpx.Timeout(READ_TIMEOUT, connect=5.0)
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=timeout) as client:
        if not await _wait_for_server(client):
            return
        await stream(client, preferences)


if __name__ == "__main__":
    asyncio.run(main())
