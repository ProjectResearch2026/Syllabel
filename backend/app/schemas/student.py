"""学生プロファイルの共有スキーマ。design.md §5.2.1 / §4.2.1。"""

from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class Course(BaseModel):
    """履修済み科目。design.md §5.2.1。

    成績の評価(点数・評価記号)は持たない。評価は取り込み時に合否(`status`)を決める
    ためだけに frontend のパーサーの中で使い、送られてこない(要件§4.2)。科目は科目名で
    識別する(シラバスコードは開講年度ごとの値で、過去の修得科目の照合に使えない)。
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    title: str
    year: int
    term: Literal["前期", "後期", "通年", "1Q", "2Q", "3Q", "4Q", "サ集"]
    credits: int
    # `registered` は成績表の `***`(登録科目)/ `*`(継続履修中)。登録済みで成績が
    # 未確定の科目であり、修得でも未修得でもない。単位計算には数えず(`passed` のみ)、
    # 履修提案では候補から外す(§5.2.1 / §7.2)
    status: Literal["passed", "failed", "withdrawn", "registered"]


class StudentProfile(BaseModel):
    """学生プロファイル。design.md §5.2.1。"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    grade: Literal[1, 2, 3, 4] | None = None
    program: str | None = None
    completed_courses: list[Course] = []
