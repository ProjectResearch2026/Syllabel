"""学生プロファイルの共有スキーマ。design.md §5.2.1 / §4.2.1。"""

from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class Course(BaseModel):
    """履修済み科目。design.md §5.2.1。"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    code: str | None = None
    title: str
    year: int
    term: Literal["前期", "後期", "通年", "1Q", "2Q", "3Q", "4Q", "サ集"]
    credits: float
    status: Literal["passed", "failed", "withdrawn"]
    raw_score: str | None = None


class StudentProfile(BaseModel):
    """学生プロファイル。design.md §5.2.1。"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    grade: Literal[1, 2, 3, 4] | None = None
    program: str | None = None
    completed_courses: list[Course] = []
