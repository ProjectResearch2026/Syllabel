"""時間割の科目・開講コマ・対象学期のスキーマ。design.md §5.3 / §7.2。"""

import unicodedata
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


HalfTerm = Literal["前期", "後期"]


class TargetTerm(BaseModel):
    """提案する学期(次に履修登録する学期)。design.md §6.1 / §7.2。

    frontend が成績表の作成日と在籍年数から推定し、学生が画面で確認・変更した値
    (`frontend/lib/targetTerm.ts`)。`grade` は**その学期の**学年であり、成績表の
    作成時点の学年(`StudentProfile.grade`)とは年度をまたぐと1つずれる。
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    year: int = Field(description="年度(4月始まり)")
    term: HalfTerm
    grade: Literal[1, 2, 3, 4]

    @property
    def semester(self) -> int:
        """1年前期を1とするセメスター番号(§5.1.2 `registration_limits`)。"""
        return (self.grade - 1) * 2 + (1 if self.term == "前期" else 2)


# 開講学期 → その学期が占めるクォーター。コマ重複は「同じ曜日・時限で、占める
# クォーターが重なる」ときに起きる。前期と 1Q、通年と後期は文字列が違っても重なる。
#
# 開講学期の表記は api-clean の `term` マスタの8種(前期 / 後期 / 通年 / 1Q〜4Q /
# サ集)である(2025・2026年度のデータを投入した api-clean で確認)。**サ集(夏期集中)は
# クォーターに属さない**ため載せない。集中講義は曜日・時限が null で、重複の検査対象外。
#
# api-clean の `term` / `day_of_week` / `period` は**1コマ目だけ**であり、「後期　金4・金5」は
# 金4、「3Q　金2、4Q　金2」は 3Q になる。重複は開講コマの一覧(`slots`。api-clean 0.3.0 以降。
# §6.2)の**コマどうし**で判定する(`CourseSlot` / `slots_clash()`)
_QUARTERS: dict[str, frozenset[int]] = {
    "前期": frozenset({1, 2}),
    "後期": frozenset({3, 4}),
    "通年": frozenset({1, 2, 3, 4}),
    "1Q": frozenset({1}),
    "2Q": frozenset({2}),
    "3Q": frozenset({3}),
    "4Q": frozenset({4}),
}


def quarters_of(term: str | None) -> frozenset[int] | None:
    """開講学期が占めるクォーター。表記を NFKC で寄せて引き、分からなければ None。"""
    if term is None:
        return None
    key = unicodedata.normalize("NFKC", term).replace(" ", "")
    return _QUARTERS.get(key)


# 土曜は教職・学芸員課程や教養の特別講義で開講される(2026年度で16クラス)。
# 月〜金に限ると、土曜のクラスを選んだときに曜日を null にするしかなくなる
Day = Literal["月", "火", "水", "木", "金", "土"]


class CourseSlot(BaseModel):
    """開講コマ1つ(学期・曜日・時限)。api-clean の `slots` の1要素(§6.2)。

    1つのクラスが複数のコマを持つ(「後期　金4・金5」「3Q　金3、4Q　金3」)。
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    term: str | None = Field(default=None, description="そのコマの開講学期(例: 後期・3Q)。")
    day: Day = Field(description="曜日。")
    period: int = Field(description="時限。")


def slots_clash(a: CourseSlot, b: CourseSlot) -> bool:
    """2つのコマが重なるか。同じ曜日・時限で、占めるクォーターが重なるとき。

    前期と1Q、通年と後期は文字列が違っても重なる。クォーターが分からない学期どうしは、
    文字列が同じときだけ重なるとみなす。
    """
    if (a.day, a.period) != (b.day, b.period):
        return False
    qa, qb = quarters_of(a.term), quarters_of(b.term)
    if qa is not None and qb is not None:
        return bool(qa & qb)
    return a.term == b.term


class ProposedCourse(BaseModel):
    """提案する1科目。"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    syllabus_code: str | None = Field(
        default=None,
        description="シラバスコード。api-cleanで特定できた場合のみ設定し、不明な場合はnullにすること。",
    )
    title: str = Field(
        description="科目名。シラバスに記載された正式名称を使うこと。",
    )
    # 同じ科目名で別の講義が開かれる科目(教養教育科目特別講義)は、サブタイトルで見分ける
    # (`app/timetable/candidates.py` の `course_key()`)
    subtitle: str | None = Field(default=None, description="シラバスのサブタイトル。")
    # day / period / term は**1コマ目**。複数コマの科目の全コマは slots に入る
    day: Day | None = Field(
        default=None,
        description="開講曜日。集中講義・曜日未定の場合はnullにすること。",
    )
    period: int | None = Field(
        default=None,
        description="時限（1〜5）。集中講義・時限未定の場合はnullにすること。",
    )
    term: str | None = Field(
        default=None,
        description="開講学期（例: 前期・後期・通年・1Q）。不明な場合はnullにすること。",
    )
    slots: list[CourseSlot] = Field(
        default_factory=list,
        description=(
            "開講コマのすべて(原文の順)。day / period / term は1コマ目と同じ。"
            "集中講義など曜日・時限の無い科目は空。"
        ),
    )
    credits: int | None = Field(
        default=None,
        description="単位数。履修要項に記載がない場合はnullにすること。単位計算に使用するため正確に転記すること。",
    )
    category: str | None = Field(
        default=None,
        description="履修区分（例: 必修・選択必修・選択）。履修要項から取得すること。",
    )
    # 履修区分(category)がどの区分・分野についての値かを画面に示すために持つ。
    # 値は履修要項の表記のまま(§5.1.5)。他課程から導出した科目は 専門関連科目
    course_category: str | None = Field(
        default=None,
        description="区分（例: 専門基礎科目・専門応用科目・専門関連科目・教養教育科目）。",
    )
    subcategory: str | None = Field(
        default=None,
        description="教養教育科目の分野（例: 人文科学系科目）。教養教育科目以外はnull。",
    )
    reason: str = Field(
        description="この科目を推薦する理由を1文で説明すること。学生のプロファイルや希望条件との関連を明記すること。",
    )
    # 誰が時間割に入れた科目か。組み立て(`app/timetable/builder.py`)は学生が自分で
    # 入れた科目(`student`)を外さない。理由の文言(`reason`)では見分けない
    source: Literal["assistant", "student"] = "assistant"

    def occupied_slots(self) -> list[CourseSlot]:
        """その科目が占めるコマ。

        `slots` が空で `day` / `period` があれば、その1コマとみなす(`slots` を持たない
        旧い提案・api-clean 0.2.0 以前から作った提案)。
        """
        if self.slots:
            return list(self.slots)
        if self.day is not None and self.period is not None:
            return [CourseSlot(term=self.term, day=self.day, period=self.period)]
        return []


def course_clash(a: ProposedCourse, b: ProposedCourse) -> CourseSlot | None:
    """2科目が重なるコマ(`a` 側)。重ならなければ None。"""
    others = b.occupied_slots()
    for slot in a.occupied_slots():
        if any(slots_clash(slot, other) for other in others):
            return slot
    return None
