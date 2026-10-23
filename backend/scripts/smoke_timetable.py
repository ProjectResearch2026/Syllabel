"""時間割の組み立て・アシスタント(`/api/timetable/*`)を実 vLLM + api-clean 相手に試すスモーク。

使い方(起動中の backend に HTTP で問い合わせる。既定 http://localhost:8000):

    python -m scripts.smoke_timetable build ['{"freeDayCount": 1}']
    python -m scripts.smoke_timetable chat "全休が欲しい" ["水曜は空けたい" ...]

- `build` はモデルを呼ばない組み立て(`POST /api/timetable/build`)。時間割・レポート・
  手順の数を出し、約束(コマが重ならない・対象学期の科目だけ・修得済みを入れない・
  必修が入る)を確かめる。条件は JSON(camelCase)で渡す
- `chat` はアシスタント(`POST /api/timetable/assistant`)に発話を順に送る。前の応答で
  返った時間割と条件を次の発話に持ち越す。思考・ツールの呼び出し(引数)・組み立て・
  本文を届いた時点で時刻つきで出し、1発話の所要時間と、時間割を組んだか(build_timetable を
  呼んだか)を出す。設計案(docs/proposals/timetable-redesign.md)の実験 E1〜E4・E6 に使う

向き先は SMOKE_BASE_URL、無通信の打ち切り秒数は SMOKE_READ_TIMEOUT、対象の学生は
SMOKE_PROGRAM_CODE / SMOKE_ADMISSION_YEAR / SMOKE_GRADE で変えられる。**対象学期**は
SMOKE_TARGET_YEAR(年度)/ SMOKE_TARGET_TERM(前期・後期)で与え、省略時は今日の日付から
frontend と同じ規則で決める(`frontend/lib/targetTerm.ts`)。

httpx.ASGITransport は使わない。応答を最後まで溜めてから返すため本文が逐次見えない。

学生データはこのファイル内の合成プロファイルであり、実在の成績ではない。"""
import asyncio
import json
import os
import sys
import time
import unicodedata
from datetime import date

import httpx

from app.curricula.requirements import normalize_title
from app.schemas.proposal import CourseSlot, slots_clash
from app.timetable.offerings import registration_half

BASE_URL = os.environ.get("SMOKE_BASE_URL", "http://localhost:8000")
# トークン間の無通信がこれを超えたら打ち切る。思考(reasoning)の間は何も流れないことがある
READ_TIMEOUT = float(os.environ.get("SMOKE_READ_TIMEOUT", "900"))
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


def request_body(
    *,
    completed: list[dict],
    grade: int,
    target: dict,
    timetable: list[dict] | None = None,
    conditions: dict | None = None,
    program_code: str = PROGRAM_CODE,
    program_name: str = PROGRAM_NAME,
    admission_year: int = ADMISSION_YEAR,
) -> dict:
    """時間割の文脈(§6.1)。課程コードと対象学期は profile と別に送る。"""
    return {
        "studentProfile": {
            "grade": grade,
            "program": program_name,
            "completedCourses": completed,
        },
        "programCode": program_code,
        "admissionYear": admission_year,
        "targetTerm": target,
        "timetable": timetable or [],
        "conditions": conditions or {},
    }


def check(courses: list[dict], body: dict, report: dict) -> list[str]:
    """時間割が約束を守っているかを確かめ、守れていない点を返す。

    全コマどうしでコマが重なっていないか、対象学期以外の科目が混ざっていないか、
    修得済み・登録済みの科目を入れていないか、合計単位が各科目の和と合うか。
    """
    problems: list[str] = []
    target = body["targetTerm"]["term"]
    placed: list[tuple[str, CourseSlot]] = []
    for course in courses:
        title = course.get("title") or "?"
        mine = [CourseSlot(term=t, day=d, period=p) for t, d, p in _slots(course)]
        for slot in mine:
            for other_title, other in placed:
                if slots_clash(slot, other) and course.get("source") != "student":
                    problems.append(f"コマ重複: {title} と {other_title}({slot.day}{slot.period}限)")
        placed.extend((title, slot) for slot in mine)
        half = registration_half(course.get("term"))
        if half is not None and half != target:
            problems.append(f"対象学期({target})以外の科目: {title}({course.get('term')})")
    taken = {
        normalize_title(c["title"]): c["status"]
        for c in body["studentProfile"]["completedCourses"]
        if c["status"] in ("passed", "registered")
    }
    for course in courses:
        status = taken.get(normalize_title(course.get("title") or ""))
        if status:
            problems.append(f"{'修得済み' if status == 'passed' else '登録済み'}の科目: {course.get('title')}")
    total = sum(c.get("credits") or 0 for c in courses)
    if report and report.get("credits", {}).get("total") != total:
        problems.append(f"合計単位の食い違い: レポート {report['credits']['total']} / 各科目の和 {total}")
    return problems


def _show(courses: list[dict], report: dict) -> None:
    print(_grid(courses))
    for course in courses:
        print("  " + _line(course) + f" ({course.get('reason') or ''})")
    credits = report.get("credits", {})
    print(f"単位 {credits.get('total')} / 登録できる単位 {credits.get('limit')}"
          f" / 授業の無い平日: {'・'.join(report.get('freeDays') or []) or 'なし'}")
    for status in report.get("conditions") or []:
        print(f"  条件 {status['condition']}: {status['status']}({status['detail']})")
    for short in report.get("remainingShortfall") or []:
        print(f"  残る不足 {short['slot']}: {short['shortfall']}({short.get('reason') or ''})")
    for item in report.get("needsConfirmation") or []:
        print(f"  確かめること: {item}")


async def _wait_for_server(client: httpx.AsyncClient) -> bool:
    """backend が listen するまで待つ。"""
    deadline = time.monotonic() + STARTUP_WAIT
    while True:
        try:
            resp = await client.get("/healthz", timeout=5.0)
            if resp.status_code == 200:
                return True
        except httpx.ConnectError:
            pass
        if time.monotonic() >= deadline:
            print(f"[接続失敗] {BASE_URL} に繋がらない。backend が起動しているか確認する")
            return False
        await asyncio.sleep(1.0)


async def build(client: httpx.AsyncClient, body: dict) -> None:
    started = time.monotonic()
    resp = await client.post("/api/timetable/build", json=body)
    elapsed = time.monotonic() - started
    if resp.status_code != 200:
        print(f"[失敗] {resp.status_code} {resp.text[:300]}")
        return
    data = resp.json()
    print(f"組み立て: {elapsed:.1f}秒 / 手順 {len(data['steps'])}件")
    _show(data["timetable"], data["report"])
    print("\n" + data["message"])
    problems = check(data["timetable"], body, data["report"])
    print("\n" + ("[約束違反]\n  " + "\n  ".join(problems) if problems else "[OK] 約束を守っている"))


def _settle_tool(tool: dict | None, printed: dict | None) -> dict | None:
    """ツールの呼び出しの確定した引数を、まだ出していなければ出す。出した引数を返す。"""
    if tool is None or tool["args"] == printed:
        return printed
    print(f"           引数 {json.dumps(tool['args'], ensure_ascii=False)}", flush=True)
    return tool["args"]


async def chat(client: httpx.AsyncClient, body: dict, utterances: list[str]) -> None:
    """発話を順に送る。思考・ツールの呼び出し・本文は届いた時点で出す(待っている間も進み具合が見える)。"""
    messages: list[dict] = []
    for text in utterances:
        messages.append({"role": "user", "content": text})
        print(f"\n{RULE}\n学生: {text}", flush=True)
        started = time.monotonic()
        first: float | None = None
        reply = ""
        built = False
        thinking = 0
        # 書きかけの引数は同じ呼び出し(id)で何度も流れる。呼び出しの始まりと、確定した引数だけを出す
        tool: dict | None = None
        tool_printed: dict | None = None

        async with client.stream(
            "POST", "/api/timetable/assistant", json={**body, "messages": messages}
        ) as resp:
            if resp.status_code != 200:
                print(f"[失敗] {resp.status_code} {(await resp.aread())[:300]!r}")
                return
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                event = json.loads(line.removeprefix("data: "))
                now = time.monotonic() - started
                if first is None:
                    first = now
                if "activity" in event:
                    act = event["activity"]
                    if tool is None or act.get("id") != tool.get("id"):
                        tool_printed = _settle_tool(tool, tool_printed)
                        print(f"  [{now:5.1f}s] {act['label']}", flush=True)
                        tool_printed = None
                    tool = act
                    continue
                tool_printed = _settle_tool(tool, tool_printed)
                if "thinking" in event:
                    if thinking == 0:
                        print(f"  [{now:5.1f}s] 考えている…", flush=True)
                    thinking += len(event["thinking"])
                elif "build" in event:
                    built = True
                elif "timetable" in event:
                    body["timetable"] = event["timetable"]["courses"]
                    print(f"  [{now:5.1f}s] 時間割を受け取った")
                    _show(event["timetable"]["courses"], event["timetable"]["report"])
                    problems = check(event["timetable"]["courses"], body, event["timetable"]["report"])
                    if problems:
                        print("  [約束違反] " + " / ".join(problems))
                elif "conditions" in event:
                    body["conditions"] = event["conditions"]
                elif "delta" in event:
                    if not reply:
                        print(f"  [{now:5.1f}s] 本文を書き始めた\nAI: ", end="", flush=True)
                    reply += event["delta"]
                    print(event["delta"], end="", flush=True)
                elif "error" in event:
                    print(f"\n  [エラー] {event['error']}", flush=True)
        total = time.monotonic() - started
        if not reply:
            print("AI: (本文なし)")
        print(
            f"\n(最初のイベント {first or 0:.1f}秒 / 合計 {total:.1f}秒 / 思考 {thinking}字 / "
            f"時間割を{'組んだ' if built else '組んでいない'})",
            flush=True,
        )
        messages.append({"role": "assistant", "content": reply})


async def main(argv: list[str]) -> None:
    command = argv[0] if argv else "build"
    body = request_body(
        completed=_default_completed(), grade=GRADE, target=_target(GRADE, date.today())
    )
    timeout = httpx.Timeout(READ_TIMEOUT, connect=5.0)
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=timeout) as client:
        if not await _wait_for_server(client):
            return
        if command == "build":
            if len(argv) > 1:
                body["conditions"] = json.loads(argv[1])
            await build(client, body)
        elif command == "chat":
            await chat(client, body, argv[1:] or ["全休が欲しい"])
        else:
            print(__doc__)


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))
