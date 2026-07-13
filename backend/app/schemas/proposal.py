"""履修提案の構造化出力スキーマ。design.md §7.2。"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel


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
    day: Literal["月", "火", "水", "木", "金"] | None = Field(
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
    credits: float | None = Field(
        default=None,
        description="単位数。履修要項に記載がない場合はnullにすること。単位計算に使用するため正確に転記すること。",
    )
    category: str | None = Field(
        default=None,
        description="履修区分（例: 必修・選択必修・選択）。履修要項から取得すること。",
    )
    reason: str = Field(
        description="この科目を推薦する理由を1文で説明すること。学生のプロファイルや希望条件との関連を明記すること。",
    )


class TimetableProposal(BaseModel):
    """時間割提案全体。"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    courses: list[ProposedCourse] = Field(
        description="提案する科目のリスト。同一の曜日・時限・学期に複数の科目を割り当ててはならない。",
    )
    total_credits: float | None = Field(
        default=None,
        description="提案科目の合計単位数。creditsがnullの科目が含まれる場合はnullにすること。",
    )
    summary: str = Field(
        description="提案全体の説明・注意点を2〜4文で記述すること。卒業要件との関係や履修上の注意点を含めること。",
    )

    @model_validator(mode="after")
    def check_no_time_conflict(self) -> "TimetableProposal":
        seen: set[tuple] = set()
        for course in self.courses:
            if course.day is None or course.period is None:
                continue
            key = (course.day, course.period, course.term)
            if key in seen:
                raise ValueError(
                    f"コマが重複しています: {course.day}{course.period}限 ({course.term}) — "
                    f"同じ曜日・時限・学期に複数の科目を割り当てないこと。"
                )
            seen.add(key)
        return self
