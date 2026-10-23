"""`curricula/` と `offerings/` の読み込み。design.md §4.4.2 / §4.4.3。

backend 起動時に1度だけ実行し、課程ごとのマージ済み履修要項(`merge.py`)と
当該コホートの開講年度ファイルをメモリ上に保持する。キーは
**(課程コード, 入学年度)**。課程は改称され得る(環境生態工学課程 → 環境科学課程)
ため、課程名ではなく課程コードを一次識別子とする(§4.4.2)。

**起動失敗にする条件**: YAML のパース失敗 / スキーマの `ValidationError` /
本モジュールの構造検査違反 / `CurriculumMergeError` / 課程ファイル0件。
データの誤りを早期に検出するためであり、いずれも人手で直せる誤りである(§4.4.3)。

**起動失敗にしない条件**: `offerings` の `unresolved` が非空であること。
`offerings` は api-clean のシラバスと突き合わせて作る値であり、上流の科目名変更
ひとつで稼働中のサービスが起動不能になる事態は避ける。警告ログにとどめる(§4.4.3)。
"""

import logging
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import TypeVar

import yaml
from pydantic import BaseModel

from app.curricula.merge import (
    LIBERAL_ARTS_PROGRAM_CODE,
    MergedCourse,
    MergedCurriculum,
    merge,
)
from app.schemas.curriculum import Curriculum, LiberalArtsCurriculum
from app.schemas.offering import Offering
from app.settings import Settings, get_settings

logger = logging.getLogger(__name__)

LIBERAL_ARTS_FILENAME = "00-liberal-arts.yaml"
# `curricula/admission-<入学年度>/` と `offerings/<開講年度>/admission-<入学年度>/`(§4.4.2)
_COHORT_DIR = re.compile(r"^admission-(\d{4})$")

_M = TypeVar("_M", bound=BaseModel)


class CurriculumLoadError(Exception):
    """履修要項データのロードに失敗した。起動を中止する(§4.4.3)。"""


@dataclass(frozen=True)
class LoadedCurriculum:
    """1課程・1入学年度分のロード結果。

    `offerings` は当該コホートの開講年度ファイルを `program_code` で引く辞書であり、
    **コホートの全ファイル**(教養教育科目対応版 `"00"` と全課程)を持つ。マージ後の
    `courses` は教養教育科目・当該課程の専攻科目・他課程から導出した専門関連科目を
    含み、§6.1 は導出科目にもシラバスコードを求める(検索結果には他課程が開講する
    科目も現れる)ため、当該課程のファイルだけでは解決できない。どのファイルを引くかは
    `MergedCourse.source_program_code` で判別する(§5.1.4)。
    """

    curriculum: MergedCurriculum
    offerings: dict[str, Offering]

    def syllabus_codes(self, course: MergedCourse) -> list[str]:
        """科目のシラバスコードを引く(§5.1.4)。

        当年度不開講・名寄せ未解決・当該コホートの `offerings` 未生成のいずれの
        場合も空リストを返す。呼び出し側はコードを要する処理(検索画面のタグ付け
        §6.1、開講情報の取得 §7.2)の対象外として扱う(§4.4.3)。
        """
        offering = self.offerings.get(course.source_program_code)
        if offering is None:
            return []
        return list(offering.resolved.get(course.title, []))


@lru_cache
def get_curricula() -> dict[tuple[str, int], LoadedCurriculum]:
    """全コホート・全課程をロードする。キーは (課程コード, 入学年度)。

    `lru_cache` により初回呼び出しのみ実際のロードを行う。設定を差し替えて
    読み直す場合は `get_curricula.cache_clear()` する。
    """
    return load_curricula(get_settings())


def load_curricula(settings: Settings) -> dict[tuple[str, int], LoadedCurriculum]:
    """`settings` の指すディレクトリから履修要項データを組み立てる。"""
    curricula_dir = Path(settings.curricula_dir)
    if not curricula_dir.is_dir():
        raise CurriculumLoadError(f"curricula_dir が存在しません: {curricula_dir}")

    cohorts = _cohort_dirs(curricula_dir)
    if not cohorts:
        raise CurriculumLoadError(
            f"curricula_dir に admission-<年度>/ がありません: {curricula_dir}"
        )

    loaded: dict[tuple[str, int], LoadedCurriculum] = {}
    for admission_year, cohort_dir in cohorts:
        liberal, programs = _load_cohort(cohort_dir, admission_year)
        offerings = _load_offerings(settings, admission_year)
        others = list(programs.values())
        for code, program in programs.items():
            loaded[(code, admission_year)] = LoadedCurriculum(
                curriculum=merge(program, liberal, others),
                offerings=offerings,
            )
        logger.info(
            "履修要項をロードしました: %s(%d課程 / offerings %d件)",
            cohort_dir.name,
            len(programs),
            len(offerings),
        )

    logger.info("履修要項のロードを完了しました: %d件", len(loaded))
    return loaded


# --- curricula/ ---


def _cohort_dirs(root: Path) -> list[tuple[int, Path]]:
    """`admission-<年度>/` を入学年度の昇順で返す。"""
    found: list[tuple[int, Path]] = []
    for path in sorted(root.iterdir()):
        if not path.is_dir():
            continue
        matched = _COHORT_DIR.match(path.name)
        if matched:
            found.append((int(matched.group(1)), path))
    return sorted(found)


def _load_cohort(
    cohort_dir: Path, admission_year: int
) -> tuple[LiberalArtsCurriculum, dict[str, Curriculum]]:
    """1コホートの教養教育科目ファイルと課程ファイルを読む。

    各 `admission-<年度>/` に `00-liberal-arts.yaml` がちょうど1つ存在すること、
    課程ファイルが1件以上あること、各ファイルの `admission_year` がディレクトリ名の
    年度と一致すること、課程コードがコホート内で一意であることを検査する(§4.4.3)。
    """
    liberal_path = cohort_dir / LIBERAL_ARTS_FILENAME
    if not liberal_path.is_file():
        raise CurriculumLoadError(
            f"{cohort_dir} に {LIBERAL_ARTS_FILENAME} がありません"
        )
    liberal = _parse(liberal_path, LiberalArtsCurriculum)
    _check_admission_year(liberal_path, liberal.admission_year, admission_year)

    programs: dict[str, Curriculum] = {}
    for path in sorted(cohort_dir.glob("*.yaml")):
        if path.name == LIBERAL_ARTS_FILENAME:
            continue
        program = _parse(path, Curriculum)
        _check_admission_year(path, program.admission_year, admission_year)
        code = program.program.code
        if code == LIBERAL_ARTS_PROGRAM_CODE:
            raise CurriculumLoadError(
                f"{path}: 課程コード {LIBERAL_ARTS_PROGRAM_CODE} は"
                f"教養教育科目ファイルの予約値です"
            )
        if code in programs:
            raise CurriculumLoadError(
                f"{path}: 課程コード {code} が {cohort_dir.name} 内で重複しています"
            )
        programs[code] = program

    if not programs:
        raise CurriculumLoadError(f"{cohort_dir} に課程ファイルがありません")
    return liberal, programs


def _check_admission_year(path: Path, actual: int, expected: int) -> None:
    """`admission_year` がディレクトリ名の年度と一致すること(§4.4.3)。"""
    if actual != expected:
        raise CurriculumLoadError(
            f"{path}: admission_year がディレクトリ名の年度と一致しません"
            f"(admission_year: {actual} / ディレクトリ: {expected})"
        )


# --- offerings/ ---


def _load_offerings(settings: Settings, admission_year: int) -> dict[str, Offering]:
    """`offerings/<開講年度>/admission-<入学年度>/` を読む。

    参照するのは `offering_year` の1ディレクトリのみで、過去年度は読まない
    (§4.4.3 / §4.4.4)。当該コホートのディレクトリが無い場合は警告を出して
    空辞書を返す。`offerings` はシラバス公開後に生成する派生物であり
    (§4.4.4)、新しい入学年度の `curricula/` が先に入ることがあるため、
    起動を止める理由にはしない。
    """
    cohort_dir = (
        Path(settings.offerings_dir)
        / str(settings.offering_year)
        / f"admission-{admission_year}"
    )
    if not cohort_dir.is_dir():
        logger.warning(
            "開講年度ファイルがありません: %s(当該コホートのシラバスコードは解決できません)",
            cohort_dir,
        )
        return {}

    offerings: dict[str, Offering] = {}
    for path in sorted(cohort_dir.glob("*.yaml")):
        offering = _parse(path, Offering)
        if offering.program_code in offerings:
            raise CurriculumLoadError(
                f"{path}: program_code {offering.program_code} が"
                f"{cohort_dir.name} 内で重複しています"
            )
        offerings[offering.program_code] = offering
        if offering.unresolved:
            # 起動は継続し、警告ログにとどめる(§4.4.3)
            logger.warning(
                "シラバスコード未解決の科目があります: %s(%d件: %s)",
                path,
                len(offering.unresolved),
                ", ".join(c.title for c in offering.unresolved),
            )
    return offerings


# --- YAML ---


def _parse(path: Path, model: type[_M]) -> _M:
    """YAML を1ファイル読んでモデルに通す。パース失敗・検証失敗は起動失敗とする。"""
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        raise CurriculumLoadError(f"{path}: YAML を読めません: {exc}") from exc
    if not isinstance(raw, dict):
        raise CurriculumLoadError(f"{path}: YAML のトップレベルがマッピングではありません")
    return model.model_validate(raw)
