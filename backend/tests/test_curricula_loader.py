"""ローダのテスト。design.md §4.4.2 / §4.4.3。

`tmp_path` に最小構成の YAML を組んで `Settings` を差し替え、起動失敗にする条件と
しない条件を確かめる。実データのロードは1本だけ置く(スキーマ単体の検査は
`test_schemas_curriculum.py` / `test_schemas_offering.py`、マージ後の検査は
`test_curricula_merge.py` の担当)。
"""

import logging
from pathlib import Path

import pytest
import yaml

from app.curricula.loader import (
    CurriculumLoadError,
    LoadedCurriculum,
    get_curricula,
    load_curricula,
)
from app.settings import Settings, get_settings

REPO_ROOT = Path(__file__).resolve().parents[2]
OFFERING_YEAR = 2026


@pytest.fixture(autouse=True)
def clear_caches():
    """`lru_cache` を挟むためテストごとにキャッシュを捨てる。"""
    get_curricula.cache_clear()
    get_settings.cache_clear()
    yield
    get_curricula.cache_clear()
    get_settings.cache_clear()


# --- 最小構成の YAML ---


def _liberal_arts(admission_year: int = 2024) -> dict:
    return {
        "admission_year": admission_year,
        "liberal_arts_version": "until-2025",
        "requirement_slots": [
            {
                "key": "liberal.elective",
                "credits": 4,
                "accepts": {"category": "教養教育科目"},
                "overflow_to": "free.all",
            }
        ],
        "prerequisites": [
            {
                "title": "教養科目B",
                "all_of": ["教養科目A"],
                "notes": "「教養科目A」の修得",
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
                "term": "通年",
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
        "graduation": {"total_credits": 10},
        "requirement_slots": [
            {"key": "basic.required", "credits": 6, "accepts": {"type": "必修"}},
            {"key": "free.all", "credits": 0, "accepts": {"category": "any"}},
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


def _build(tmp_path: Path, *, admission_year: int = 2024, codes=("01", "02")) -> Settings:
    """最小構成の `curricula/` と `offerings/` を組み、それを指す `Settings` を返す。"""
    cohort = f"admission-{admission_year}"
    curricula = tmp_path / "curricula" / cohort
    _write(curricula / "00-liberal-arts.yaml", _liberal_arts(admission_year))
    for code in codes:
        _write(curricula / f"{code}-test.yaml", _program(code, admission_year))

    offerings = tmp_path / "offerings" / str(OFFERING_YEAR) / cohort
    _write(
        offerings / "00-liberal-arts.yaml",
        _offering("00", admission_year, resolved={"教養科目A": ["G000000001"]}),
    )
    for code in codes:
        _write(
            offerings / f"{code}-test.yaml",
            _offering(code, admission_year, resolved={f"専門科目{code}": [f"Y00000000{code[-1]}"]}),
        )
    return _settings(tmp_path)


def _settings(tmp_path: Path) -> Settings:
    return Settings(
        curricula_dir=tmp_path / "curricula",
        offerings_dir=tmp_path / "offerings",
        offering_year=OFFERING_YEAR,
    )


# --- 正常系 ---


def test_loads_every_program(tmp_path):
    """課程コードと入学年度の組をキーに、課程ごとのオブジェクトが載ること。"""
    loaded = load_curricula(_build(tmp_path))
    assert set(loaded) == {("01", 2024), ("02", 2024)}
    assert all(isinstance(v, LoadedCurriculum) for v in loaded.values())


def test_merges_liberal_arts_and_other_programs(tmp_path):
    """マージ結果が載ること(教養の取り込み・課程別除外・他課程からの導出)。"""
    loaded = load_curricula(_build(tmp_path))
    merged = loaded[("01", 2024)].curriculum
    assert [c.title for c in merged.own_courses] == ["専門科目01", "教養科目A", "教養科目B"]
    derived = [c for c in merged.courses if not c.own]
    assert [(c.title, c.source_program_code, c.category) for c in derived] == [
        ("専門科目02", "02", "専門関連科目")
    ]
    # `not_available_to_programs: ["02"]` の科目は課程02では取り込まない
    assert "教養科目B" not in {c.title for c in loaded[("02", 2024)].curriculum.own_courses}


def test_merges_liberal_arts_prerequisites(tmp_path):
    """教養教育科目ファイルの `prerequisites` が取り込まれること(§4.4.3 手順1)。"""
    merged = load_curricula(_build(tmp_path))[("01", 2024)].curriculum
    assert [p.title for p in merged.prerequisites] == ["教養科目B"]


def test_offerings_hold_the_whole_cohort(tmp_path):
    """`offerings` はコホートの全ファイルを `program_code` で持つこと。"""
    loaded = load_curricula(_build(tmp_path))
    assert set(loaded[("01", 2024)].offerings) == {"00", "01", "02"}


def test_syllabus_codes_resolve_via_source_program_code(tmp_path):
    """導出科目を含め、出典のファイルからシラバスコードを引けること(§5.1.4 / §6.1)。"""
    loaded = load_curricula(_build(tmp_path))[("01", 2024)]
    by_title = {c.title: c for c in loaded.curriculum.courses}
    assert loaded.syllabus_codes(by_title["教養科目A"]) == ["G000000001"]
    assert loaded.syllabus_codes(by_title["専門科目01"]) == ["Y000000001"]
    # 他課程が開講する科目。当該課程のファイルだけでは解決できない
    assert loaded.syllabus_codes(by_title["専門科目02"]) == ["Y000000002"]
    # 名寄せ結果に無い科目はコード無しとして扱う
    assert loaded.syllabus_codes(by_title["教養科目B"]) == []


def test_multiple_cohorts_are_keyed_by_admission_year(tmp_path):
    """入学年度ごとに別のエントリになること(§4.4.2)。"""
    _build(tmp_path, admission_year=2024, codes=("01",))
    settings = _build(tmp_path, admission_year=2025, codes=("01",))
    loaded = load_curricula(settings)
    assert set(loaded) == {("01", 2024), ("01", 2025)}


def test_missing_offerings_cohort_is_a_warning(tmp_path, caplog):
    """当該コホートの `offerings` が無くても起動は継続すること。

    `offerings` はシラバス公開後に生成する派生物であり(§4.4.4)、新しい
    入学年度の `curricula/` が先に入ることがある。
    """
    settings = _build(tmp_path)
    for path in (tmp_path / "offerings" / str(OFFERING_YEAR) / "admission-2024").iterdir():
        path.unlink()
    (tmp_path / "offerings" / str(OFFERING_YEAR) / "admission-2024").rmdir()
    with caplog.at_level(logging.WARNING, logger="app.curricula.loader"):
        loaded = load_curricula(settings)
    assert loaded[("01", 2024)].offerings == {}
    assert "開講年度ファイルがありません" in caplog.text


def test_past_offering_years_are_not_read(tmp_path):
    """参照するのは `offering_year` の1ディレクトリのみであること(§4.4.3)。"""
    settings = _build(tmp_path)
    _write(
        tmp_path / "offerings" / str(OFFERING_YEAR - 1) / "admission-2024" / "01-test.yaml",
        _offering("01", resolved={"専門科目01": ["Y999999999"]}) | {"offering_year": OFFERING_YEAR - 1},
    )
    loaded = load_curricula(settings)[("01", 2024)]
    assert {o.offering_year for o in loaded.offerings.values()} == {OFFERING_YEAR}


# --- unresolved(起動失敗にしない) ---


def test_unresolved_courses_warn_but_do_not_stop_startup(tmp_path, caplog):
    """`unresolved` が非空でも起動は継続し、警告ログを出すこと(§4.4.3)。"""
    settings = _build(tmp_path)
    _write(
        tmp_path / "offerings" / str(OFFERING_YEAR) / "admission-2024" / "01-test.yaml",
        _offering(
            "01",
            resolved={"専門科目01": ["Y000000001"]},
            unresolved=[{"title": "幻の科目", "reason": "api-clean に該当なし。調査中"}],
        ),
    )
    with caplog.at_level(logging.WARNING, logger="app.curricula.loader"):
        loaded = load_curricula(settings)
    assert ("01", 2024) in loaded
    assert "シラバスコード未解決" in caplog.text
    assert "幻の科目" in caplog.text


# --- 起動失敗にする条件 ---


def test_broken_yaml_fails(tmp_path):
    """YAML としてパースできないファイルがあれば失敗すること。"""
    settings = _build(tmp_path)
    (tmp_path / "curricula" / "admission-2024" / "01-test.yaml").write_text(
        "program: [unclosed\n", encoding="utf-8"
    )
    with pytest.raises(CurriculumLoadError, match="YAML を読めません"):
        load_curricula(settings)


def test_non_mapping_yaml_fails(tmp_path):
    """トップレベルがマッピングでないファイルがあれば失敗すること。"""
    settings = _build(tmp_path)
    (tmp_path / "curricula" / "admission-2024" / "01-test.yaml").write_text(
        "- 1\n- 2\n", encoding="utf-8"
    )
    with pytest.raises(CurriculumLoadError, match="マッピングではありません"):
        load_curricula(settings)


def test_schema_violation_fails(tmp_path):
    """スキーマ検査に通らないファイルがあれば失敗すること(`ValidationError`)。"""
    from pydantic import ValidationError

    settings = _build(tmp_path)
    broken = _program("01")
    broken["courses"][0]["type"] = "とても必修"
    _write(tmp_path / "curricula" / "admission-2024" / "01-test.yaml", broken)
    with pytest.raises(ValidationError):
        load_curricula(settings)


def test_admission_year_mismatch_fails(tmp_path):
    """`admission_year` がディレクトリ名の年度と食い違えば失敗すること。"""
    settings = _build(tmp_path)
    mismatched = _program("01")
    mismatched["admission_year"] = 2025
    _write(tmp_path / "curricula" / "admission-2024" / "01-test.yaml", mismatched)
    with pytest.raises(CurriculumLoadError, match="admission_year がディレクトリ名の年度と一致しません"):
        load_curricula(settings)


def test_liberal_arts_admission_year_mismatch_fails(tmp_path):
    """教養教育科目ファイルの `admission_year` も同じく検査すること。"""
    settings = _build(tmp_path)
    mismatched = _liberal_arts()
    mismatched["admission_year"] = 2025
    _write(tmp_path / "curricula" / "admission-2024" / "00-liberal-arts.yaml", mismatched)
    with pytest.raises(CurriculumLoadError, match="admission_year がディレクトリ名の年度と一致しません"):
        load_curricula(settings)


def test_missing_liberal_arts_file_fails(tmp_path):
    """`00-liberal-arts.yaml` が無ければ失敗すること(§4.4.3)。"""
    settings = _build(tmp_path)
    (tmp_path / "curricula" / "admission-2024" / "00-liberal-arts.yaml").unlink()
    with pytest.raises(CurriculumLoadError, match="00-liberal-arts.yaml がありません"):
        load_curricula(settings)


def test_no_program_files_fails(tmp_path):
    """コホートに課程ファイルが1件も無ければ失敗すること。"""
    settings = _build(tmp_path, codes=())
    with pytest.raises(CurriculumLoadError, match="課程ファイルがありません"):
        load_curricula(settings)


def test_no_cohort_directory_fails(tmp_path):
    """`admission-<年度>/` が1つも無ければ失敗すること。"""
    (tmp_path / "curricula").mkdir()
    with pytest.raises(CurriculumLoadError, match="admission-<年度>/ がありません"):
        load_curricula(_settings(tmp_path))


def test_missing_curricula_dir_fails(tmp_path):
    """`curricula_dir` 自体が無ければ失敗すること。"""
    with pytest.raises(CurriculumLoadError, match="curricula_dir が存在しません"):
        load_curricula(_settings(tmp_path))


def test_duplicate_program_code_fails(tmp_path):
    """同一コホートに同じ課程コードのファイルが2つあれば失敗すること。"""
    settings = _build(tmp_path)
    _write(tmp_path / "curricula" / "admission-2024" / "01-duplicate.yaml", _program("01"))
    with pytest.raises(CurriculumLoadError, match="課程コード 01 が"):
        load_curricula(settings)


def test_program_code_00_is_reserved(tmp_path):
    """課程コード "00" は教養教育科目ファイルの予約値であること(§4.4.2)。"""
    settings = _build(tmp_path)
    _write(tmp_path / "curricula" / "admission-2024" / "00-other.yaml", _program("00"))
    with pytest.raises(CurriculumLoadError, match="予約値"):
        load_curricula(settings)


def test_merge_error_fails(tmp_path):
    """`CurriculumMergeError` は起動失敗にすること(§4.4.3)。"""
    from app.curricula.merge import CurriculumMergeError

    settings = _build(tmp_path)
    mismatched = _program("01")
    mismatched["graduation"]["total_credits"] = 11
    _write(tmp_path / "curricula" / "admission-2024" / "01-test.yaml", mismatched)
    with pytest.raises(CurriculumMergeError, match="total_credits"):
        load_curricula(settings)


# --- get_curricula(設定とキャッシュ) ---


def test_get_curricula_reads_settings_and_caches(tmp_path, monkeypatch):
    """`get_curricula()` が `Settings` を見て読み、2度目はキャッシュを返すこと。"""
    _build(tmp_path)
    monkeypatch.setenv("CURRICULA_DIR", str(tmp_path / "curricula"))
    monkeypatch.setenv("OFFERINGS_DIR", str(tmp_path / "offerings"))
    monkeypatch.setenv("OFFERING_YEAR", str(OFFERING_YEAR))
    loaded = get_curricula()
    assert set(loaded) == {("01", 2024), ("02", 2024)}
    assert get_curricula() is loaded


# --- 実データ ---


def test_real_data_loads():
    """リポジトリの `curricula/` と `offerings/` がロードできること。"""
    loaded = load_curricula(_settings(REPO_ROOT))
    cohorts = sorted(p.name for p in (REPO_ROOT / "curricula").glob("admission-*") if p.is_dir())
    assert {f"admission-{year}" for _, year in loaded} == set(cohorts)
    for (code, year), item in loaded.items():
        assert item.curriculum.program.code == code
        assert item.curriculum.admission_year == year
        assert item.curriculum.own_courses
