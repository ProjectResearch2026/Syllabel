"""展示用ダミー学生プロファイル(48件)を生成する。design.md §8.1.2。

   使い方: python -m scripts.generate_dummy_profiles [出力先]
   既定の出力先は ../frontend/lib/dummy/profiles.json。api-clean の宛先は
   DUMMY_API_CLEAN_URL(既定 http://localhost:5050)。

**1件 = 課程(6) × 提案を受ける学年(4) × 提案する学期(前期・後期)。** 提案する学期は
すべて 2026年度に置く(開講科目データ `offerings/` が 2026年度分だけのため)。
入学年度は学年から決まる(2026年度に g 年生 → 2027 - g 年度入学)。成績は提案する
学期の直前の学期まで付いている。前期の提案は3月中旬、後期の提案は9月初旬に公開
される成績表にあたる。1年前期は入学直後で成績が1件も無い。

でたらめな履修にしないため、次のデータだけから組み立てる:

- **履修要項**(`curricula/`): 科目名・単位・区分・配当年次・学期、先修条件、
  履修登録制限単位数(CAP)。必修は配当された学期に必ず履修する
- **api-clean**: 選択科目は、その学期に実際に開講されていた科目だけから選ぶ。
  api-clean は 2025・2026年度しか持たず、2025年度は教養教育科目を持たない。
  その年度のデータで引けない科目は、引ける年度の開講学期で代用する。
  どの年度でも引けない選択科目は選ばない

科目は成績の評価ではなく履修状態(`passed` / `failed` / `withdrawn` / `registered`)で
書き出す(design.md §5.2.1)。点数は生成の中で合否を決めるのにだけ使う。

乱数の種は (課程コード, 学年, 学期) から決めるので、何度実行しても同じ結果になる。
学生データは合成であり、実在の成績ではない。"""

from __future__ import annotations

import json
import os
import random
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

import httpx

from app.agents.proposal_agent import check_prerequisite
from app.curricula.loader import get_curricula
from app.curricula.merge import MergedCourse, MergedCurriculum
from app.curricula.requirements import judge
from app.curricula.titles import normalize_title
from app.schemas.student import Course as StudentCourse

API_CLEAN_URL = os.environ.get("DUMMY_API_CLEAN_URL", "http://localhost:5050")
DEFAULT_OUT = Path(__file__).resolve().parents[2] / "frontend" / "lib" / "dummy" / "profiles.json"

TARGET_YEAR = 2026
PROGRAM_CODES = ["01", "02", "03", "04", "05", "06"]
HALVES = ("前期", "後期")

# 学期ごとに目指す登録単位数(CAP の範囲内。4年次は研究が中心で少ない)
TARGET_CREDITS = {1: (18, 22), 2: (18, 22), 3: (16, 22), 4: (6, 12)}
# 教養教育の選択科目を1学期に取る数
LIBERAL_ELECTIVES = {1: (1, 3), 2: (1, 2), 3: (0, 1), 4: (0, 0)}

# 選択科目として無作為に選ばない科目(学外実習・海外研修・単位互換など、
# 希望者だけが取る特殊な科目)
SKIP_WORDS = ("インターンシップ", "キャリア実習", "海外", "研修", "ASEAN", "グローバル",
              "プロジェクトリサーチ", "特別講義", "職業指導", "補習")

# 成績発表前(`***`)の科目を載せる1件。実物の2025年9月作成の成績表で、前期の
# ASEANグローバルプログラムが `***` のまま載っていた(design.md §5.2.1)のと同じ形
REGISTERED_EXTRA = {("05", 2, "後期"): "ASEANグローバルプログラム"}


def half_of(term: str) -> set[str]:
    """api-clean の開講期を前期・後期に丸める。"""
    if term in ("前期", "1Q", "2Q"):
        return {"前期"}
    if term in ("後期", "3Q", "4Q"):
        return {"後期"}
    if term == "通年":
        return {"前期", "後期"}
    return set()


def fetch_offered() -> dict[int, dict[str, set[str]]]:
    """年度 → 正規化した科目名 → 開講した学期(前期・後期)。瀬田キャンパスの全シラバス。"""
    offered: dict[int, dict[str, set[str]]] = {}
    with httpx.Client(base_url=API_CLEAN_URL, timeout=60) as client:
        for year in (2025, 2026):
            index: dict[str, set[str]] = defaultdict(set)
            offset = 0
            while True:
                res = client.get(
                    "/syllabi",
                    params={"campus": "瀬田", "year": year, "limit": 500, "offset": offset},
                )
                res.raise_for_status()
                rows = res.json()["results"]
                for row in rows:
                    halves: set[str] = set()
                    for slot in row.get("slots") or [{"term": row["term"]}]:
                        halves |= half_of(slot["term"] or "")
                    if not halves and row["term"]:
                        halves = half_of(row["term"])
                    index[normalize_title(row["course_title"])] |= halves
                if len(rows) < 500:
                    break
                offset += 500
            offered[year] = dict(index)
            print(f"api-clean {year}年度: {len(index)}科目", file=sys.stderr)
    return offered


@dataclass
class Semester:
    number: int  # 1〜8
    grade: int
    half: str
    year: int  # 年度


def semesters_before(admission_year: int, grade: int, half: str) -> list[Semester]:
    """提案する学期(grade 年の half)より前の学期。"""
    last = (grade - 1) * 2 + (1 if half == "前期" else 2) - 1
    return [
        Semester(n, (n + 1) // 2, "前期" if n % 2 else "後期", admission_year + (n - 1) // 2)
        for n in range(1, last + 1)
    ]


@dataclass
class Record:
    course: MergedCourse
    year: int
    term: str  # 成績表の学期(前期・後期・通年)
    raw: str  # 点数 / J / ***


@dataclass
class Student:
    curriculum: MergedCurriculum
    rng: random.Random
    offered: dict[int, dict[str, set[str]]]
    records: dict[str, Record] = field(default_factory=dict)  # 正規化名 → 最終結果
    failed_required: list[Record] = field(default_factory=list)

    def passed(self) -> list[StudentCourse]:
        return [
            StudentCourse(title=r.course.title, year=r.year, term=r.term,
                          credits=r.course.credits, status="passed")
            for r in self.records.values()
            if r.raw.isdigit() and int(r.raw) >= 60
        ]

    def is_passed(self, course: MergedCourse) -> bool:
        r = self.records.get(normalize_title(course.title))
        return r is not None and r.raw.isdigit() and int(r.raw) >= 60

    def was_offered(self, course: MergedCourse, year: int, half: str) -> bool | None:
        """その年度・学期に開講されていたか。どの年度でも引けなければ None。"""
        key = normalize_title(course.title)
        if key in self.offered.get(year, {}):
            return half in self.offered[year][key]
        for other in (2026, 2025):
            if key in self.offered[other]:
                return half in self.offered[other][key]
        return None

    def prerequisites_met(self, course: MergedCourse) -> bool:
        rules = [p for p in self.curriculum.prerequisites
                 if normalize_title(p.title) == normalize_title(course.title)]
        passed = self.passed()
        return all(check_prerequisite(r, self.curriculum, passed) == "met" for r in rules)

    def language_in_order(self, course: MergedCourse) -> bool:
        """選択外国語は Ⅰ から取る。Ⅱ は同じ言語の Ⅰ を修得してから。"""
        if course.subcategory != "選択外国語科目":
            return True
        if "Ⅱ" not in course.title:
            return "Ⅰ" in course.title
        language = course.title.split("Ⅱ")[0]
        return any(
            r.course.title.startswith(language + "Ⅰ") and r.raw.isdigit() and int(r.raw) >= 60
            for r in self.records.values()
        )

    def score(self) -> str:
        return str(max(60, min(98, round(self.rng.gauss(78, 9)))))

    def fail_score(self) -> str:
        return str(self.rng.randint(35, 58))


def status_of(raw: str) -> str:
    """生成の中で付けた成績(点数 / `J` / `***`)を履修状態に直す。"""
    if raw == "***":
        return "registered"
    if raw == "J":
        return "withdrawn"
    return "passed" if int(raw) >= 60 else "failed"


def must_register(course: MergedCourse) -> bool:
    """配当された学期に必ず履修する科目。必修と、履修要項が「必ず履修登録」と定める科目。"""
    return course.type == "必修" or "必ず履修登録" in (course.notes or "")


def load_limit(curriculum: MergedCurriculum, number: int) -> int:
    for limit in curriculum.registration_limits.by_semester:
        if number in limit.semesters:
            if limit.max_credits_per_semester:
                return limit.max_credits_per_semester
            if limit.max_credits_per_year:
                return limit.max_credits_per_year // 2
    return 22


def generate(code: str, grade: int, half: str, offered) -> dict:
    admission_year = TARGET_YEAR - grade + 1
    loaded = get_curricula()[(code, admission_year)]
    curriculum = loaded.curriculum
    rng = random.Random(f"{code}-{grade}-{half}")
    student = Student(curriculum, rng, offered)

    # 学生の性格。おおむね3人に1人が不合格の科目を持ち、5人に1人が履修辞退をしている
    struggles = rng.random() < 0.35
    withdraws = rng.random() < 0.2
    semesters = semesters_before(admission_year, grade, half)
    fail_semesters = set(rng.sample([s.number for s in semesters], min(len(semesters), rng.randint(1, 2)))) if struggles and semesters else set()
    withdraw_semester = rng.choice(semesters).number if withdraws and semesters else None

    own = [c for c in curriculum.own_courses if c.type != "随意" and c.term in ("前期", "後期", "通年")]
    liberal_required_done = {"人文科学系科目": False, "社会科学系科目": False}
    extra = REGISTERED_EXTRA.get((code, grade, half))

    for sem in semesters:
        limit = load_limit(curriculum, sem.number)
        low, high = TARGET_CREDITS[sem.grade]
        target = min(limit, rng.randint(low, high))
        taken: list[tuple[MergedCourse, str]] = []  # (科目, 成績表の学期)
        credits = 0.0

        def add(course: MergedCourse, term: str) -> None:
            nonlocal credits
            taken.append((course, term))
            credits += course.credits / 2 if term == "通年" else course.credits

        # 1) 配当された必修(「配当年次に必ず履修登録」の選択科目を含む)。
        #    通年科目は後期に1年ぶんが確定する
        for c in own:
            if c.grade != sem.grade or not must_register(c) or student.is_passed(c):
                continue
            if c.term == sem.half:
                add(c, sem.half)
            elif c.term == "通年" and sem.half == "後期":
                add(c, "通年")

        # 2) 落とした必修の再履修(同じ学期の開講を待つ)
        for r in list(student.failed_required):
            if r.course.term == sem.half and not student.is_passed(r.course):
                add(r.course, sem.half)
                student.failed_required.remove(r)

        # 成績発表前の科目は、直前の学期に登録した科目として CAP の内に数える
        if extra and sem is semesters[-1]:
            add(next(c for c in own if c.title == extra), sem.half)

        # 3) 教養教育の選択必修(人文・社会)。1・2年のうちに1科目ずつ
        for sub, done in liberal_required_done.items():
            last_chance = sem.grade == 2 and sem.half == "後期"
            if done or sem.grade > 2 or (not last_chance and rng.random() < 0.5):
                continue
            pool = [c for c in own if c.subcategory == sub and c.type == "選択必修" and c.term == sem.half
                    and c.grade <= sem.grade and not student.is_passed(c)
                    and student.was_offered(c, sem.year, sem.half)]
            if pool:
                add(rng.choice(pool), sem.half)
                liberal_required_done[sub] = True

        # 4) 教養教育の選択科目
        lo, hi = LIBERAL_ELECTIVES[sem.grade]
        pool = [c for c in own if c.category == "教養教育科目" and c.type == "選択"
                and c.term == sem.half and c.grade <= sem.grade
                and not any(w in c.title for w in SKIP_WORDS)
                and not student.is_passed(c) and c not in [t for t, _ in taken]
                and student.was_offered(c, sem.year, sem.half)
                and student.prerequisites_met(c)
                and student.language_in_order(c)]
        rng.shuffle(pool)
        for c in pool[: rng.randint(lo, hi)]:
            if credits + c.credits <= limit:
                add(c, sem.half)

        # 5) 専攻の選択・選択必修。配当年次の科目を優先して、目標の単位まで
        pool = [c for c in own if c.category != "教養教育科目" and c.type in ("選択", "選択必修")
                and c.term == sem.half and c.grade <= sem.grade
                and not any(w in c.title for w in SKIP_WORDS)
                and not student.is_passed(c) and c not in [t for t, _ in taken]
                and student.was_offered(c, sem.year, sem.half)
                and student.prerequisites_met(c)]
        rng.shuffle(pool)
        pool.sort(key=lambda c: (c.grade != sem.grade, c.type != "選択必修"))
        for c in pool:
            if credits >= target:
                break
            if credits + c.credits <= limit:
                add(c, sem.half)

        # 成績を付ける
        fail_one = sem.number in fail_semesters
        candidates_to_fail = [i for i, (c, t) in enumerate(taken) if t != "通年" and c.title != extra]
        fail_index = rng.choice(candidates_to_fail) if fail_one and candidates_to_fail else None
        withdraw_pool = [i for i, (c, t) in enumerate(taken) if c.type == "選択" and i != fail_index]
        withdraw_index = rng.choice(withdraw_pool) if sem.number == withdraw_semester and withdraw_pool else None
        for i, (c, term) in enumerate(taken):
            key = normalize_title(c.title)
            if extra and c.title == extra:
                record = Record(c, sem.year, term, "***")
            elif i == fail_index:
                record = Record(c, sem.year, term, student.fail_score())
                if c.type == "必修":
                    student.failed_required.append(record)
            elif i == withdraw_index:
                record = Record(c, sem.year, term, "J")
            else:
                record = Record(c, sem.year, term, student.score())
            # 再履修で合格したら、成績表の行は合格した学期の1行になる(評価欄は最終結果)
            student.records[key] = record

    rows = sorted(
        ([r.course.title, r.year, r.term, r.course.credits, status_of(r.raw)]
         for r in student.records.values()),
        key=lambda row: (row[1], {"前期": 0, "後期": 1, "通年": 2}[row[2]]),
    )
    passed = student.passed()
    result = judge(curriculum, passed)
    return {
        "programCode": code,
        "program": curriculum.program.name,
        "grade": grade,
        "term": half,
        "admissionYear": admission_year,
        "courses": rows,
        "_earned": result.earned_credits,
    }


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT
    offered = fetch_offered()
    profiles = []
    for code in PROGRAM_CODES:
        for grade in range(1, 5):
            for half in HALVES:
                profile = generate(code, grade, half, offered)
                earned = profile.pop("_earned")
                fails = sum(1 for r in profile["courses"] if r[4] == "failed")
                print(
                    f"{code} {grade}年{half}: {len(profile['courses'])}科目 "
                    f"卒業要件算入 {earned}単位 不合格 {fails}",
                    file=sys.stderr,
                )
                profiles.append(profile)
    out.write_text(
        json.dumps({"targetYear": TARGET_YEAR, "profiles": profiles}, ensure_ascii=False,
                   separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(f"{out} に {len(profiles)}件を書き出しました", file=sys.stderr)


if __name__ == "__main__":
    main()
