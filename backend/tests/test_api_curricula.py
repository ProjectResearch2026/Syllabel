"""`GET /api/curricula/{program_code}/{admission_year}` のテスト。design.md §6.1。

最小構成の YAML を `tmp_path` に組んで `Settings` を差し替える経路(レスポンスの
形・`own`・`syllabusCodes`・404・ETag)と、リポジトリの実データで 02 / 2024 を
引く経路(完了条件)の2本立てとする。
"""

from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

import app.api.curricula as curricula_api
from app.curricula.loader import get_curricula
from app.main import app
from app.settings import get_settings

client = TestClient(app)

REPO_ROOT = Path(__file__).resolve().parents[2]
OFFERING_YEAR = 2026


@pytest.fixture(autouse=True)
def clear_caches():
    """履修要項もレスポンスもプロセス内にキャッシュするためテストごとに捨てる。"""
    def _clear():
        get_curricula.cache_clear()
        get_settings.cache_clear()
        curricula_api.clear_payload_cache()

    _clear()
    yield
    _clear()


# --- 最小構成の YAML(test_curricula_loader.py と同じ構成) ---


def _liberal_arts(admission_year: int = 2024) -> dict:
    return {
        "admission_year": admission_year,
        "liberal_arts_version": "until-2025",
        "requirement_slots": [
            {
                "key": "liberal.elective", "name": "liberal.elective",
                "credits": 4,
                "accepts": {"category": "教養教育科目"},
                "overflow_to": "free.all",
            }
        ],
        "courses": [
            {
                "title": "教養科目A",
                "category": "教養教育科目",
                "subcategory": "人文科学系科目",
                "type": "選択",
                "credits": 2,
                "grade": 1,
                "term": "前期",
                "quarters": ["1Q", "2Q"],
            },
            {
                "title": "教養科目B",
                "category": "教養教育科目",
                "subcategory": "人文科学系科目",
                "type": "選択",
                "credits": 2,
                "grade": 2,
                "term": "通年",
                "not_available_to_programs": ["02"],
            },
        ],
    }


def _program(code: str = "01", admission_year: int = 2024) -> dict:
    return {
        "program": {"code": code, "name": f"テスト課程{code}"},
        "admission_year": admission_year,
        "graduation": {"total_credits": 10, "excluded_types": ["随意"]},
        "requirement_slots": [
            {"key": "basic.required", "name": "basic.required", "credits": 6, "accepts": {"type": "必修"}},
            {"key": "free.all", "name": "free.all", "credits": 0, "accepts": {"category": "any"}},
        ],
        "registration_limits": {},
        "courses": [
            {
                "title": f"専門科目{code}",
                "category": "専門基礎科目",
                "type": "必修",
                "credits": 2,
                "grade": 1,
                "term": "通年",
            }
        ],
    }


def _offering(code: str, admission_year: int = 2024, **overrides) -> dict:
    return {
        "offering_year": OFFERING_YEAR,
        "admission_year": admission_year,
        "program_code": code,
        "resolved": {},
        **overrides,
    }


def _write(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, allow_unicode=True), encoding="utf-8")


def _use(monkeypatch, curricula_dir: Path, offerings_dir: Path) -> None:
    """`Settings` の参照先を環境変数で差し替える(docker-compose.yml と同じ経路)。"""
    monkeypatch.setenv("CURRICULA_DIR", str(curricula_dir))
    monkeypatch.setenv("OFFERINGS_DIR", str(offerings_dir))
    monkeypatch.setenv("OFFERING_YEAR", str(OFFERING_YEAR))
    get_settings.cache_clear()


@pytest.fixture
def fixture_data(tmp_path, monkeypatch):
    """最小構成の `curricula/` と `offerings/` を組み、それを指すよう設定を差し替える。"""
    cohort = "admission-2024"
    curricula = tmp_path / "curricula" / cohort
    _write(curricula / "00-liberal-arts.yaml", _liberal_arts())
    for code in ("01", "02"):
        _write(curricula / f"{code}-test.yaml", _program(code))

    offerings = tmp_path / "offerings" / str(OFFERING_YEAR) / cohort
    _write(
        offerings / "00-liberal-arts.yaml",
        # 教養科目B は名寄せ結果に無い(不開講 / 未解決の科目に相当)
        _offering("00", resolved={"教養科目A": ["G000000001", "G000000002"]}),
    )
    _write(offerings / "01-test.yaml", _offering("01", resolved={"専門科目01": ["Y000000001"]}))
    _write(offerings / "02-test.yaml", _offering("02", resolved={"専門科目02": ["Y000000002"]}))

    _use(monkeypatch, tmp_path / "curricula", tmp_path / "offerings")


def _courses_by_title(body: dict) -> dict[str, dict]:
    return {c["title"]: c for c in body["courses"]}


# --- 正常系 ---


def test_returns_course_layer(fixture_data):
    """トップレベルは科目レイヤのみ。規則レイヤは返さない(§4.4.3 / §6.1)。"""
    resp = client.get("/api/curricula/01/2024")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body) == {
        "programCode",
        "admissionYear",
        "offeringYear",
        "graduation",
        "courses",
    }
    assert body["programCode"] == "01"
    assert body["admissionYear"] == 2024
    assert body["offeringYear"] == OFFERING_YEAR


def test_returns_graduation(fixture_data):
    """卒業残り単位の表示に要る `graduation` を返すこと(§4.4.5)。"""
    body = client.get("/api/curricula/01/2024").json()
    assert body["graduation"] == {"totalCredits": 10, "excludedTypes": ["随意"]}
    # 設置科目の単位数の総和は卒業必要単位数ではない(§6.1)
    own_total = sum(c["credits"] for c in body["courses"] if c["own"])
    assert own_total != body["graduation"]["totalCredits"]


def test_courses_are_merged(fixture_data):
    """マージ後の全科目を返すこと(教養の取り込み・他課程からの導出。§4.4.3)。"""
    body = client.get("/api/curricula/01/2024").json()
    assert [c["title"] for c in body["courses"]] == [
        "専門科目01",
        "教養科目A",
        "教養科目B",
        "専門科目02",
    ]


def test_course_fields_are_camel_case(fixture_data):
    """科目の属性は §6.1 の規定どおりで、規則レイヤ寄りの項目を含まないこと。"""
    course = _courses_by_title(client.get("/api/curricula/01/2024").json())["教養科目A"]
    assert course == {
        "title": "教養科目A",
        "category": "教養教育科目",
        "subcategory": "人文科学系科目",
        "type": "選択",
        "credits": 2,
        "grade": 1,
        "term": "前期",
        "quarters": ["1Q", "2Q"],
        "kikan": False,
        "own": True,
        "syllabusCodes": ["G000000001", "G000000002"],
    }


def test_own_distinguishes_derived_courses(fixture_data):
    """他課程から導出した専門関連科目は `own: false`(§6.1)。"""
    courses = _courses_by_title(client.get("/api/curricula/01/2024").json())
    assert courses["専門科目01"]["own"] is True
    assert courses["教養科目A"]["own"] is True
    derived = courses["専門科目02"]
    assert derived["own"] is False
    # 他課程の `type: 必修` はそのまま必修と表示すると誤りになるため区分を付け替える
    assert derived["type"] == "必修"
    assert derived["category"] == "専門関連科目"


def test_syllabus_codes_of_derived_courses(fixture_data):
    """導出科目のコードも導出元のファイルから解決すること(§5.1.4)。"""
    courses = _courses_by_title(client.get("/api/curricula/01/2024").json())
    assert courses["専門科目02"]["syllabusCodes"] == ["Y000000002"]


def test_syllabus_codes_are_empty_when_unresolved(fixture_data):
    """名寄せ結果に無い科目は空配列(タグ付けの対象外。§5.1.4)。"""
    courses = _courses_by_title(client.get("/api/curricula/01/2024").json())
    assert courses["教養科目B"]["syllabusCodes"] == []


def test_program_specific_exclusion(fixture_data):
    """`not_available_to_programs` の科目は当該課程には現れないこと(§4.4.3)。"""
    body = client.get("/api/curricula/02/2024").json()
    assert "教養科目B" not in _courses_by_title(body)


# --- 404 ---


def test_unknown_program_code_is_404(fixture_data):
    assert client.get("/api/curricula/99/2024").status_code == 404


def test_unknown_admission_year_is_404(fixture_data):
    assert client.get("/api/curricula/01/1999").status_code == 404


# --- キャッシュ(§4.4.3) ---


def test_sets_etag_and_cache_control(fixture_data):
    resp = client.get("/api/curricula/01/2024")
    assert resp.headers["ETag"].startswith('"')
    assert resp.headers["Cache-Control"] == curricula_api.CACHE_CONTROL


def test_etag_depends_on_content(fixture_data):
    """課程が違えば ETag も違うこと。同じ課程を引き直せば変わらないこと。"""
    first = client.get("/api/curricula/01/2024").headers["ETag"]
    assert client.get("/api/curricula/01/2024").headers["ETag"] == first
    assert client.get("/api/curricula/02/2024").headers["ETag"] != first


@pytest.mark.parametrize("template", ['{etag}', 'W/{etag}', '"other", {etag}', "*"])
def test_if_none_match_returns_304(fixture_data, template):
    """再検証で 304 を返し、本文を送らないこと。弱い検証子と複数指定も受ける。"""
    etag = client.get("/api/curricula/01/2024").headers["ETag"]
    resp = client.get(
        "/api/curricula/01/2024",
        headers={"If-None-Match": template.format(etag=etag)},
    )
    assert resp.status_code == 304
    assert resp.content == b""
    assert resp.headers["ETag"] == etag


def test_stale_if_none_match_returns_200(fixture_data):
    resp = client.get("/api/curricula/01/2024", headers={"If-None-Match": '"stale"'})
    assert resp.status_code == 200
    assert resp.json()["programCode"] == "01"


# --- 実データ(完了条件) ---


@pytest.fixture
def real_data(monkeypatch):
    """リポジトリ直下の `curricula/` / `offerings/` を指す設定に差し替える。"""
    _use(monkeypatch, REPO_ROOT / "curricula", REPO_ROOT / "offerings")


def test_real_data_program_02_admission_2024(real_data):
    """実データで 02 / 2024 が返ること。専門関連科目に `own: false` が付くこと。"""
    resp = client.get("/api/curricula/02/2024")
    assert resp.status_code == 200
    body = resp.json()
    assert body["programCode"] == "02"
    assert body["admissionYear"] == 2024
    assert body["graduation"]["totalCredits"] > 0
    assert len(body["courses"]) > 100

    derived = [c for c in body["courses"] if not c["own"]]
    assert derived, "他課程から導出した専門関連科目が無い"
    assert all(c["category"] == "専門関連科目" for c in derived)
    assert any(c["own"] for c in body["courses"])


def test_real_data_syllabus_codes_match_offerings(real_data):
    """`syllabusCodes` が `offerings/2026/admission-2024/` と一致すること(完了条件)。"""
    body = client.get("/api/curricula/02/2024").json()
    cohort = REPO_ROOT / "offerings" / str(OFFERING_YEAR) / "admission-2024"
    resolved: dict[str, dict[str, list[str]]] = {}
    for path in sorted(cohort.glob("*.yaml")):
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
        resolved[raw["program_code"]] = raw.get("resolved") or {}

    # レスポンスの courses はマージ結果と同順の1対1。他課程どうしで同名の科目は
    # 全レコードを保持する(§4.4.3)ため、科目名では出典を一意に引けない
    merged = get_curricula()[("02", 2024)].curriculum.courses
    assert len(body["courses"]) == len(merged)

    checked = 0
    for course, source in zip(body["courses"], merged, strict=True):
        assert course["title"] == source.title
        expected = resolved[source.source_program_code].get(source.title, [])
        assert course["syllabusCodes"] == expected, source.title
        checked += bool(expected)
    assert checked > 0, "シラバスコードが1件も解決されていない"


def test_real_data_unknown_keys_are_404(real_data):
    assert client.get("/api/curricula/99/2024").status_code == 404
    assert client.get("/api/curricula/02/1999").status_code == 404
