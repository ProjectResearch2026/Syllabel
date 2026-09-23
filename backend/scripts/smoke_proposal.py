"""実 vLLM + api-clean 相手の履修提案(POST /api/proposal)疎通スモーク。
   使い方: python -m scripts.smoke_proposal [希望条件]
   起動中の backend に HTTP で問い合わせる(既定 http://localhost:8000)。
   compose なら docker compose exec backend python -m scripts.smoke_proposal。

   向き先は SMOKE_BASE_URL、無通信の打ち切り秒数は SMOKE_READ_TIMEOUT、
   対象の学生は SMOKE_PROGRAM_CODE / SMOKE_ADMISSION_YEAR / SMOKE_GRADE で変えられる。
   **提案する学期**(§7.2)は SMOKE_TARGET_YEAR(年度)/ SMOKE_TARGET_TERM(前期・後期)で
   与え、省略時は今日の日付から frontend と同じ規則で決める(4月 → 同年度の前期、
   5〜9月 → 同年度の後期、10〜3月 → 翌年度の前期。`frontend/lib/targetTerm.ts`)。
   SMOKE_GRADE は今日時点の学年であり、提案する学期が次の年度に入るぶん繰り上げて送る。

   確かめるのは design.md §7.2 の次の点:
   - snapshot が時間割を**逐次**組み上げていくこと(確定を待たずに描画できる)
   - result がコマ重複のない、候補科目から採った提案になっていること(複数コマの
     科目は全コマで見る。§5.3)
   - result の科目が**すべて提案する学期のもの**であること(前期・後期が混ざらない)
   - 修得済み・登録済みの科目を提案していないこと
   - done で締めること

   別の学生データで試すときは、このモジュールの `main()` に履修科目の一覧を渡す
   (`completed=[{"title": ..., "year": ..., "term": ..., "credits": ..., "status": ...}]`)。

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
from datetime import date

import httpx

from app.agents.proposal_agent import registration_half
from app.curricula.requirements import normalize_title
from app.schemas.proposal import CourseSlot, slots_clash

BASE_URL = os.environ.get("SMOKE_BASE_URL", "http://localhost:8000")
# トークン間の無通信がこれを超えたら打ち切る。提案の生成は候補科目を載せた長い
# プロンプトを1回投げるだけだが、思考(reasoning)の間は何も流れない
READ_TIMEOUT = float(os.environ.get("SMOKE_READ_TIMEOUT", "900"))
# 最初の snapshot が届くまでの待ち時間を知らせる間隔
HEARTBEAT = 30.0
# backend の起動を待つ上限。compose の up 直後は listen まで数秒かかる
STARTUP_WAIT = 60.0

PROGRAM_CODE = os.environ.get("SMOKE_PROGRAM_CODE", "02")
PROGRAM_NAME = os.environ.get("SMOKE_PROGRAM_NAME", "知能情報メディア課程")
ADMISSION_YEAR = int(os.environ.get("SMOKE_ADMISSION_YEAR", "2024"))
GRADE = int(os.environ.get("SMOKE_GRADE", "3"))
TARGET_YEAR = os.environ.get("SMOKE_TARGET_YEAR")
TARGET_TERM = os.environ.get("SMOKE_TARGET_TERM")

# 土曜も開講がある(教職・学芸員課程や教養の特別講義。§5.3)
DAYS = ["月", "火", "水", "木", "金", "土"]
PERIODS = [1, 2, 3, 4, 5]
RULE = "-" * 60

# 2024年度入学・知能情報メディア課程の3回生(2026年前期まで履修済み)を想定した
# 合成プロファイル。実在の成績ではない。科目名・単位・学期は履修要項データ
# (`curricula/admission-2024/`)の設置科目から採り、年度は配当年次から決めた。
#
# 実物の3回生の成績表(2026年9月作成)と同程度の約85単位とし、次を作り込んでいる:
# - 教養教育科目の必修・専門基礎科目の必修は、英語総合4 を除いて修得済み
# - 専門応用科目の必修は2年後期の「知能情報メディア演習」まで。3年後期の
#   「ネットワークシステム・演習」「知能情報メディアセミナー」が未修得で残る
# - 不合格(再履修の対象)が2科目: 英語総合4(2年後期)、画像メディア処理論(3年前期)
# - 教養教育科目(選択必修〈基幹〉・社会)は未修得
COMPLETED = [
    # 教養教育科目(必修)
    ("仏教の思想A", 2024, "前期", 2, "passed"),
    ("仏教の思想B", 2024, "後期", 2, "passed"),
    ("英語総合1(A)", 2024, "前期", 1, "passed"),
    ("英語総合1(B)", 2024, "前期", 1, "passed"),
    ("英語総合2(A)", 2024, "後期", 1, "passed"),
    ("英語総合2(B)", 2024, "後期", 1, "passed"),
    ("英語総合3", 2025, "前期", 1, "passed"),
    ("英語総合4", 2025, "後期", 1, "failed"),
    ("スポーツ技術学A", 2024, "前期", 1, "passed"),
    ("スポーツ技術学B", 2024, "後期", 1, "passed"),
    # 教養教育科目(選択必修〈基幹〉・人文)/(選択)
    ("哲学入門", 2024, "前期", 2, "passed"),
    ("データサイエンス・AI入門", 2024, "前期", 2, "passed"),
    ("情報社会とメディア", 2024, "前期", 2, "passed"),
    ("生活の中の物理", 2024, "前期", 2, "passed"),
    ("人権論B", 2024, "後期", 2, "passed"),
    ("情報と人間", 2024, "後期", 2, "passed"),
    # 専門基礎科目(必修)
    ("情報基礎", 2024, "前期", 2, "passed"),
    ("メディア処理基礎", 2024, "前期", 2, "passed"),
    ("ネットワーク基礎", 2024, "前期", 2, "passed"),
    ("微分積分・演習", 2024, "前期", 4, "passed"),
    ("ソフトウェア基礎", 2024, "後期", 2, "passed"),
    ("プログラミング基礎演習Ⅰ", 2024, "後期", 2, "passed"),
    ("プログラミング基礎演習Ⅱ", 2024, "後期", 2, "passed"),
    ("情報システム基礎", 2025, "前期", 2, "passed"),
    ("ハードウェア基礎", 2025, "前期", 2, "passed"),
    ("線形代数・演習", 2025, "前期", 4, "passed"),
    ("データ構造とアルゴリズム・演習", 2025, "前期", 4, "passed"),
    # 専門基礎科目(選択)
    ("フレッシャーズセミナー", 2024, "前期", 2, "passed"),
    ("理工学のすすめ", 2024, "後期", 2, "passed"),
    ("確率・統計", 2024, "後期", 2, "passed"),
    ("情報数学基礎", 2024, "後期", 2, "passed"),
    ("システムソフトウェア", 2025, "前期", 2, "passed"),
    ("データベース", 2025, "前期", 2, "passed"),
    ("情報とセキュリティ", 2025, "前期", 2, "passed"),
    # 専門応用科目(必修)/(選択)
    ("知能情報メディア演習", 2025, "後期", 4, "passed"),
    ("コンピュータビジョン", 2025, "前期", 2, "passed"),
    ("CGとVR", 2025, "後期", 2, "passed"),
    ("データインテリジェンス", 2025, "後期", 2, "passed"),
    ("ニューロとAI", 2025, "後期", 2, "passed"),
    ("言語メディア処理論", 2025, "後期", 2, "passed"),
    ("実践プログラミング・演習", 2026, "前期", 2, "passed"),
    ("応用アルゴリズム", 2026, "前期", 2, "passed"),
    ("画像メディア処理論", 2026, "前期", 2, "failed"),
]


def _default_completed() -> list[dict]:
    """埋め込みの合成プロファイルを `completedCourses` の形にする。"""
    return [
        {"title": title, "year": year, "term": term, "credits": credits, "status": status}
        for title, year, term, credits, status in COMPLETED
    ]


def _fiscal_year(today: date) -> int:
    """年度(4月始まり)。"""
    return today.year if today.month >= 4 else today.year - 1


def target_term_for(today: date) -> tuple[int, str]:
    """今日に次に登録する学期。frontend の `termFromDate()` と同じ規則。"""
    fiscal = _fiscal_year(today)
    if today.month == 4:
        return fiscal, "前期"
    if 5 <= today.month <= 9:
        return fiscal, "後期"
    return fiscal + 1, "前期"


def _target(grade_now: int, today: date) -> dict:
    """提案する学期(§6.1 の `targetTerm`)。学年は提案する学期の時点に繰り上げる。"""
    year, term = target_term_for(today)
    if TARGET_YEAR:
        year = int(TARGET_YEAR)
    if TARGET_TERM:
        term = TARGET_TERM
    grade = min(4, max(1, grade_now + (year - _fiscal_year(today))))
    return {"year": year, "term": term, "grade": grade}


def request_body(
    preferences: str | None,
    *,
    completed: list[dict],
    grade: int,
    target: dict,
    program_code: str = PROGRAM_CODE,
    program_name: str = PROGRAM_NAME,
    admission_year: int = ADMISSION_YEAR,
) -> dict:
    """`POST /api/proposal` の本文(§6.1)。課程コードと提案する学期は profile と別に送る。"""
    return {
        "studentProfile": {
            "grade": grade,
            "program": program_name,
            "completedCourses": completed,
        },
        "programCode": program_code,
        "admissionYear": admission_year,
        "preferences": preferences,
        "targetTerm": target,
    }


def _payload(line: str) -> dict | None:
    """SSE の1行から data のペイロードを取り出す。イベント区切りの空行等は None。"""
    if not line.startswith("data: "):
        return None
    return json.loads(line.removeprefix("data: "))


def _slots(course: dict) -> list[tuple[str | None, str, int]]:
    """科目1件が占めるコマ (学期, 曜日, 時限) の全部。

    `slots`(全コマ。§5.3)を使い、無ければ `day` / `period`(1コマ目)の1コマとする。
    """
    slots = [
        (s.get("term"), s["day"], s["period"])
        for s in course.get("slots") or []
        if s.get("day") and s.get("period")
    ]
    if slots:
        return slots
    day, period = course.get("day"), course.get("period")
    return [(course.get("term"), day, period)] if day and period else []


def _slot(course: dict) -> str:
    """科目1件の開講コマ(「金4・金5」)。学期の違うコマは学期を添える。無ければ「未定」。"""
    slots = _slots(course)
    if not slots:
        return "未定"
    with_term = len({term for term, _, _ in slots}) > 1
    return "・".join(f"{term if with_term else ''}{day}{period}" for term, day, period in slots)


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
        f"{_pad(_slot(course), 10)}{course.get('title') or '(名称未定)'}"
        f" [{course.get('syllabusCode') or 'コード無'}]"
        f" {course.get('term') or '学期未定'}"
        f" {'?' if credits is None else credits}単位"
    )


def _settled(snapshot: dict) -> list[dict]:
    """snapshot のうち、値が届き終えた科目。

    snapshot には完成した値だけが順に載る(§7.2)。科目名が届いた時点で出すと、
    曜日・時限がまだ届いていない科目まで「未定」と書いてしまい、モデルがコマを
    埋められなかったのか単に途中なのかが読めない。スキーマの最後のフィールドで
    ある `reason` が載った時点をその科目の完成とみなす。
    """
    return [c for c in (snapshot.get("courses") or []) if c.get("reason")]


def _grid(courses: list[dict]) -> str:
    """曜日×時限の表。コマ重複(§7.2)を目で確かめるために出す。"""
    # マス → 科目名 → その科目がそのマスを占める学期
    cells: dict[tuple[str, int], dict[str, list[str]]] = {}
    for course in courses:
        # 複数コマの科目(「金4・金5」)は全部のマスに置く
        for term, day, period in _slots(course):
            if day not in DAYS or period not in PERIODS:
                continue
            terms = cells.setdefault((day, period), {}).setdefault(course.get("title") or "?", [])
            if term and term not in terms:
                terms.append(term)

    def _label(title: str, terms: list[str], short: bool) -> str:
        # クォーター科目は学期を科目名より先に書く(マスの幅で後ろが切れても見えるように)。
        # 同じ科目の 3Q・4Q は1つにまとめる
        quarters = [t for t in terms if t not in ("前期", "後期")]
        name = title[:2] if short else title
        if not quarters:
            return name
        return f"{'・'.join(quarters)}{name}" if short else f"({'・'.join(quarters)}){name}"

    def _clash(day: str, period: int, a: list[str], b: list[str]) -> bool:
        return any(
            slots_clash(CourseSlot(term=x, day=day, period=period), CourseSlot(term=y, day=day, period=period))
            for x in (a or [None])
            for y in (b or [None])
        )

    def _cell(day: str, period: int, entries: dict[str, list[str]]) -> str:
        if len(entries) <= 1:
            return "".join(_label(t, terms, short=False) for t, terms in entries.items())
        # 2科目以上は両方が見えるよう科目名を2文字に詰める(「3Q生理/4Q高分」)。
        # 1Q と 2Q のように期間が重ならなければ重複ではないので、印は重なるときだけ付ける
        items = list(entries.items())
        clash = any(
            _clash(day, period, a[1], b[1])
            for i, a in enumerate(items)
            for b in items[i + 1:]
        )
        text = "/".join(_label(t, terms, short=True) for t, terms in items)
        return f"重複:{text}" if clash else text

    # 1マス15桁+区切り1桁。溢れた科目名は切るが、隣のマスとくっつかないようにする
    lines = ["    " + "".join(_pad(day, 15) + " " for day in DAYS)]
    for period in PERIODS:
        row = f"{period}限 "
        for day in DAYS:
            row += _pad(_cell(day, period, cells.get((day, period), {})), 15) + " "
        lines.append(row.rstrip())

    undecided = [c for c in courses if _slot(c) == "未定"]
    if undecided:
        lines.append(
            "曜日時限未定: " + "、".join(c.get("title") or "?" for c in undecided)
        )
    return "\n".join(lines)


def _check(result: dict, body: dict) -> list[str]:
    """提案が §7.2 の約束を守っているかを確かめ、守れていない点を返す。

    見るのは、全コマどうしでコマが重なっていないか(1コマ目だけを見ていた頃は
    「金4・金5」の科目と金5の科目を並べていた)、提案する学期以外の科目が
    混ざっていないか、修得済み・登録済みの科目を提案していないか、合計単位が
    各科目の和と合うか、の4点である。
    """
    problems: list[str] = []
    courses = result.get("courses") or []
    target = body["targetTerm"]["term"]

    placed: list[tuple[str, CourseSlot]] = []
    for course in courses:
        title = course.get("title") or "?"
        mine = [CourseSlot(term=t, day=d, period=p) for t, d, p in _slots(course)]
        for slot in mine:
            for other_title, other in placed:
                if slots_clash(slot, other):
                    problems.append(
                        f"コマ重複: {title} と {other_title}({slot.day}{slot.period}限)"
                    )
        placed.extend((title, slot) for slot in mine)

    for course in courses:
        half = registration_half(course.get("term"))
        if half is not None and half != target:
            problems.append(
                f"提案する学期({target})以外の科目: {course.get('title')}({course.get('term')})"
            )
        elif half is None:
            problems.append(f"学期が判定できない科目: {course.get('title')}({course.get('term')})")

    taken = {
        normalize_title(c["title"]): c["status"]
        for c in body["studentProfile"]["completedCourses"]
        if c["status"] in ("passed", "registered")
    }
    for course in courses:
        status = taken.get(normalize_title(course.get("title") or ""))
        if status:
            label = "修得済み" if status == "passed" else "登録済み"
            problems.append(f"{label}の科目を提案: {course.get('title')}")

    credits = [c.get("credits") for c in courses]
    if None not in credits and result.get("totalCredits") is not None:
        if abs(sum(credits) - result["totalCredits"]) > 1e-6:
            problems.append(f"合計単位の食い違い: totalCredits={result['totalCredits']} / 各科目の和={sum(credits)}")
    return problems


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


async def stream(client: httpx.AsyncClient, body: dict) -> None:
    """SSE を受け、途中経過と確定版を表示する。

    snapshot は値が1つ完成するたびに届き、全文を出すと読めないため、
    **新しく確定した科目の行だけ**を出す。逐次描画が成立しているか
    (確定を待たずに時間割が埋まっていくか)はこれで見る。
    """
    target = body["targetTerm"]
    completed = body["studentProfile"]["completedCourses"]
    counts = {s: sum(c["status"] == s for c in completed) for s in ("passed", "failed", "withdrawn", "registered")}
    print(f"=== POST {BASE_URL}/api/proposal ===")
    print(
        f"対象: 課程コード {body['programCode']} / {body['admissionYear']}年度入学"
        f" / 提案する学期 {target['year']}年度 {target['term']}({target['grade']}回生)"
    )
    print(
        f"履修科目: 合格 {counts['passed']} / 不合格 {counts['failed']}"
        f" / 辞退 {counts['withdrawn']} / 登録済み {counts['registered']}"
    )
    print(f"希望条件: {body['preferences'] or '(なし)'}")
    started = time.monotonic()
    state = {"started": False}
    notice = asyncio.create_task(_wait_notice(started, state))
    snapshots = 0
    shown = 0
    result: dict | None = None
    adjustments: list[str] = []
    done = False
    try:
        async with client.stream(
            "POST", "/api/proposal", json=body
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
                    settled = _settled(payload["snapshot"])
                    for course in settled[shown:]:
                        print(f"  + {_line(course)}", flush=True)
                    shown = len(settled)
                elif "result" in payload:
                    result = payload["result"]
                    adjustments = payload.get("adjustments") or []
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
        # backend が外した科目・打ち切りの記録。画面には出ない(§7.2.2)
        if adjustments:
            print("[backend の調整(学生には表示しない)]")
            for note in adjustments:
                print(f"  - {note}")
        else:
            print("backend の調整: なし")
        print(RULE)
        problems = _check(result, body)
        if problems:
            print("[要確認]")
            for problem in problems:
                print(f"  - {problem}")
        else:
            print(
                "確認: コマ重複なし(全コマ) / 提案する学期以外の科目なし / "
                "修得済み・登録済みの科目なし / 合計単位一致"
            )
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


async def main(
    preferences: str | None = None,
    *,
    completed: list[dict] | None = None,
    grade: int = GRADE,
    target: dict | None = None,
    today: date | None = None,
    **profile,
) -> None:
    """提案を1回頼んで表示する。

    Args:
        completed: 履修科目(`completedCourses`)。省略時は埋め込みの合成プロファイル。
        grade: 今日(`today`)時点の学年。
        target: 提案する学期 `{"year", "term", "grade"}`。省略時は今日から決める。
        profile: `program_code` / `program_name` / `admission_year` の上書き。
    """
    body = request_body(
        preferences,
        completed=completed if completed is not None else _default_completed(),
        grade=grade,
        target=target or _target(grade, today or date.today()),
        **profile,
    )
    timeout = httpx.Timeout(READ_TIMEOUT, connect=5.0)
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=timeout) as client:
        if not await _wait_for_server(client):
            return
        await stream(client, body)


if __name__ == "__main__":
    asyncio.run(main(" ".join(sys.argv[1:]) or None))
