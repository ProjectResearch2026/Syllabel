"""開講年度ファイル YAML スキーマのテスト。design.md §5.1.4。

実データ(`offerings/`)が `model_validate` を通ることと、`resolved` /
`not_offered` / `unresolved` の3分割の前提が型で守られることを確かめる。
`curricula/` の科目名集合との突合はファイル単体では成立しないため扱わない。
"""

from pathlib import Path

import pytest
import yaml
from pydantic import ValidationError

from app.schemas.offering import NotOfferedCourse, Offering, UnresolvedCourse

REPO_ROOT = Path(__file__).resolve().parents[2]
OFFERINGS_DIR = REPO_ROOT / "offerings"


def _load(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _all_files() -> list[Path]:
    return sorted(OFFERINGS_DIR.glob("*/admission-*/*.yaml"))


def _id(path: Path) -> str:
    return f"{path.parent.parent.name}/{path.parent.name}/{path.name}"


# --- 実データ(§5.1.4) ---


def test_offerings_2026_admission_2024_has_seven_files():
    """`curricula/admission-2024/` と同名の7ファイルが置かれる(§4.4.2)。"""
    files = sorted((OFFERINGS_DIR / "2026" / "admission-2024").glob("*.yaml"))
    assert [f.name for f in files] == [
        "00-liberal-arts.yaml",
        "01-suri-joho-kagaku.yaml",
        "02-chinou-joho-media.yaml",
        "03-denshi-joho-tsushin.yaml",
        "04-kikai-kogaku-robotics.yaml",
        "05-oyo-kagaku.yaml",
        "06-kankyo-seitai-kogaku.yaml",
    ]


@pytest.mark.parametrize("path", _all_files(), ids=_id)
def test_real_yaml_validates(path: Path):
    """`offerings/` の全ファイルが `model_validate` を通ること。"""
    Offering.model_validate(_load(path))


@pytest.mark.parametrize("path", _all_files(), ids=_id)
def test_file_location_matches_its_contents(path: Path):
    """開講年度・入学年度・課程コードがファイルの置き場所と一致すること(§4.4.2)。"""
    offering = Offering.model_validate(_load(path))
    assert offering.offering_year == int(path.parent.parent.name)
    assert offering.admission_year == int(path.parent.name.removeprefix("admission-"))
    assert offering.program_code == path.name[:2]


def test_liberal_arts_offering_content():
    """教養教育科目対応版(program_code: "00")の代表的な値(§5.1.4)。"""
    offering = Offering.model_validate(
        _load(OFFERINGS_DIR / "2026" / "admission-2024" / "00-liberal-arts.yaml")
    )
    assert (offering.offering_year, offering.admission_year) == (2026, 2024)
    assert offering.program_code == "00"
    # 1科目に複数コード(1:N)
    assert len(offering.resolved["仏教の思想A"]) > 1
    # 不開講は根拠つきで not_offered に置く
    kaigai = next(c for c in offering.not_offered if c.title == "海外英語研修")
    assert kaigai.reason
    assert offering.unresolved == []


def test_program_offering_content():
    offering = Offering.model_validate(
        _load(OFFERINGS_DIR / "2026" / "admission-2024" / "01-suri-joho-kagaku.yaml")
    )
    assert offering.program_code == "01"
    assert offering.resolved["微積分及び演習Ⅱ"] == ["Y001006010"]
    assert {c.title for c in offering.not_offered} >= {"機械学習Ⅰ"}


def test_titles_are_disjoint_across_the_three_buckets():
    """`resolved` / `not_offered` / `unresolved` は同じ科目名を二重に持たない(§5.1.4)。"""
    for path in _all_files():
        offering = Offering.model_validate(_load(path))
        resolved = set(offering.resolved)
        not_offered = {c.title for c in offering.not_offered}
        unresolved = {c.title for c in offering.unresolved}
        assert len(not_offered) == len(offering.not_offered), _id(path)
        assert len(unresolved) == len(offering.unresolved), _id(path)
        assert resolved.isdisjoint(not_offered), _id(path)
        assert resolved.isdisjoint(unresolved), _id(path)
        assert not_offered.isdisjoint(unresolved), _id(path)


# --- 最小構成の生成(異常系のベースライン) ---


def _minimal_offering(**overrides) -> dict:
    data = {
        "offering_year": 2026,
        "admission_year": 2024,
        "program_code": "01",
        "resolved": {"微積分及び演習Ⅱ": ["Y001006010"]},
        "not_offered": [{"title": "機械学習Ⅰ", "reason": "2026年度不開講(履修要項の開講年度表記)"}],
        "unresolved": [],
    }
    data.update(overrides)
    return data


def test_minimal_document_validates():
    offering = Offering.model_validate(_minimal_offering())
    assert offering.resolved == {"微積分及び演習Ⅱ": ["Y001006010"]}
    assert offering.not_offered[0].title == "機械学習Ⅰ"
    assert offering.unresolved == []


def test_empty_buckets_may_be_omitted():
    data = _minimal_offering()
    for key in ("resolved", "not_offered", "unresolved"):
        del data[key]
    offering = Offering.model_validate(data)
    assert offering.resolved == {}
    assert offering.not_offered == []
    assert offering.unresolved == []


# --- extra="forbid" ---


def test_unknown_top_level_key_is_rejected():
    """`syllabus_codes` のような旧キー・typo を黙って捨てない。"""
    with pytest.raises(ValidationError, match="extra_forbidden|Extra inputs"):
        Offering.model_validate(_minimal_offering(syllabus_codes={}))


def test_unknown_not_offered_key_is_rejected():
    data = _minimal_offering(
        not_offered=[{"title": "機械学習Ⅰ", "reason": "不開講", "note": "..."}]
    )
    with pytest.raises(ValidationError, match="extra_forbidden|Extra inputs"):
        Offering.model_validate(data)


# --- 値の妥当性(§5.1.4) ---


@pytest.mark.parametrize("code", ["1", "001", "AA", ""])
def test_program_code_must_be_two_digits(code):
    with pytest.raises(ValidationError):
        Offering.model_validate(_minimal_offering(program_code=code))


@pytest.mark.parametrize(
    "code", ["Y00100601", "Y0010060100", "y001006010", "Y00100601O", "", "Y001-006010"]
)
def test_invalid_syllabus_code_is_rejected(code):
    """シラバスコードは英字1桁 + 数字9桁(§5.1.4)。"""
    with pytest.raises(ValidationError):
        Offering.model_validate(_minimal_offering(resolved={"微積分及び演習Ⅱ": [code]}))


def test_resolved_requires_at_least_one_code():
    """コードが1件も無い科目は `not_offered` / `unresolved` に置く(§5.1.4)。"""
    with pytest.raises(ValidationError):
        Offering.model_validate(_minimal_offering(resolved={"微積分及び演習Ⅱ": []}))


def test_duplicated_syllabus_code_is_rejected():
    data = _minimal_offering(resolved={"仏教の思想A": ["G260110004", "G260110004"]})
    with pytest.raises(ValidationError, match="シラバスコードが重複"):
        Offering.model_validate(data)


def test_resolved_key_must_not_be_empty():
    with pytest.raises(ValidationError):
        Offering.model_validate(_minimal_offering(resolved={"": ["Y001006010"]}))


def test_reason_is_required():
    """根拠を書けないものを not_offered に入れてはならない(§5.1.4)。"""
    with pytest.raises(ValidationError, match="reason"):
        Offering.model_validate(_minimal_offering(not_offered=[{"title": "機械学習Ⅰ"}]))
    with pytest.raises(ValidationError):
        NotOfferedCourse.model_validate({"title": "機械学習Ⅰ", "reason": ""})
    with pytest.raises(ValidationError):
        UnresolvedCourse.model_validate({"title": "機械学習Ⅰ", "reason": ""})


def test_unresolved_is_a_separate_bucket_from_not_offered():
    """「不開講」と「名寄せ失敗」を区別する(§5.1.4)。"""
    offering = Offering.model_validate(
        _minimal_offering(
            unresolved=[{"title": "コラボレーション演習", "reason": "api-clean に一致候補なし"}]
        )
    )
    assert isinstance(offering.not_offered[0], NotOfferedCourse)
    assert isinstance(offering.unresolved[0], UnresolvedCourse)
    assert offering.unresolved[0].reason == "api-clean に一致候補なし"


def test_no_camel_case_alias():
    """YAML は snake_case のまま(§5.1.4)。"""
    data = _minimal_offering()
    data["offeringYear"] = data.pop("offering_year")
    with pytest.raises(ValidationError):
        Offering.model_validate(data)
