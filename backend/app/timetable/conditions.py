"""時間割の形についての希望(条件)。design.md §7.2。

「全休が欲しい」「1限は避けたい」「必修だけ」のような希望を、組み立て
(`app/timetable/builder.py`)が守れる値で表す。アシスタントがツールの引数として書き、
frontend が保持して次のリクエストに載せる(サーバは状態を持たない。要件§5.2)。

興味・関心のような柔らかい希望は条件に入れない。アシスタントが検索のツールで科目を
探し、`include`(入れたい科目)として渡す。
"""

import re
import unicodedata
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.schemas.proposal import Day

Weekday = Literal["月", "火", "水", "木", "金"]
Scope = Literal["必修のみ", "不足を埋める", "広く"]

# 選択科目を足して1日に入れるコマ数の上限の既定。全休を1日作っても、単位の上限
# (2単位・1コマの科目でおよそ12コマ)が4日に収まるよう 3 ではなく 4 とする
DEFAULT_MAX_PERIODS_PER_DAY = 4


class _CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class PeriodRule(_CamelModel):
    """避ける時限。`day` が無ければ全曜日のその時限。"""

    day: Day | None = None
    period: int = Field(ge=1, le=7)

    def label(self) -> str:
        return f"{self.day}{self.period}" if self.day else f"{self.period}限(全曜日)"

    def matches(self, day: str, period: int) -> bool:
        return self.period == period and (self.day is None or self.day == day)


_PERIOD_RULE = re.compile(r"^(?P<day>[月火水木金土])?曜?(?:日)?(?P<period>[1-7])(?:限|時限)?(?:目)?$")


def parse_period_rule(text: str) -> PeriodRule:
    """「金5」「金曜5限」「1限」「1」を `PeriodRule` にする。

    モデルが書く引数の揺れを吸収する。全角数字は NFKC で寄せる。読めなければ
    ValueError(ツールの引数の検証で作り直しを頼む)。
    """
    key = unicodedata.normalize("NFKC", text).replace(" ", "").replace("　", "")
    key = key.replace("全曜日", "").replace("毎日", "").replace("(", "").replace(")", "")
    match = _PERIOD_RULE.match(key)
    if match is None:
        raise ValueError(f"時限を読めません: {text}(例: 「金5」「1限」)")
    return PeriodRule(day=match.group("day"), period=int(match.group("period")))


class Conditions(_CamelModel):
    """時間割の形についての条件(§7.2)。

    - `scope` — 提案の粒度(要件§4.3.3)。`必修のみ` は必修だけを置く。`不足を埋める`
      (既定)は卒業要件の不足を埋める科目を入れる。`広く` は不足を埋めた後も
      登録できる単位の範囲で科目を足す
    - `free_days` / `free_day_count` — 全休の曜日と、全休にしたい平日の数(指定した
      曜日を含む)。曜日を言われずに数だけ言われたときは組み立てが曜日を決め、
      決めた曜日を `free_days` に書き足して返す
    - `avoid_periods` — 避ける時限
    - `max_days` — 授業のある平日の数の上限
    - `max_periods_per_day` — 選択科目を足して1日に入れるコマ数の上限。必修で
      超えるのは仕方ないものとする
    - `target_credits` — 単位数の目安(上限)。登録できる単位の上限は超えない
    - `include` / `exclude` — 入れたい科目(シラバスコード)と、入れない科目(科目名
      またはシラバスコード)
    """

    scope: Scope = "不足を埋める"
    free_days: list[Weekday] = []
    free_day_count: int = Field(0, ge=0, le=5)
    avoid_periods: list[PeriodRule] = []
    max_days: int | None = Field(None, ge=1, le=5)
    max_periods_per_day: int = Field(DEFAULT_MAX_PERIODS_PER_DAY, ge=1, le=7)
    target_credits: int | None = Field(None, ge=1)
    include: list[str] = []
    exclude: list[str] = []

    def wanted_free_days(self) -> int:
        """全休にしたい平日の数。指定した曜日の数より少なくはならない。"""
        return max(self.free_day_count, len(set(self.free_days)))

    def describe(self) -> list[str]:
        """学生・モデルに見せる条件の一覧。既定のままの条件は書かない。"""
        lines: list[str] = []
        if self.scope == "必修のみ":
            lines.append("必修だけを入れる")
        elif self.scope == "広く":
            lines.append("不足を埋めた後も、登録できる単位まで科目を入れる")
        if self.free_days:
            lines.append(f"全休にする曜日: {'・'.join(self.free_days)}")
        if self.free_day_count > len(set(self.free_days)):
            lines.append(f"全休の日を{self.free_day_count}日作る")
        if self.avoid_periods:
            lines.append(f"避ける時限: {'、'.join(r.label() for r in self.avoid_periods)}")
        if self.max_days is not None:
            lines.append(f"授業のある平日は{self.max_days}日まで")
        if self.max_periods_per_day != DEFAULT_MAX_PERIODS_PER_DAY:
            lines.append(f"選択科目を足して1日{self.max_periods_per_day}コマまで")
        if self.target_credits is not None:
            lines.append(f"単位数は{self.target_credits}単位まで")
        if self.include:
            lines.append(f"入れたい科目: {'、'.join(self.include)}")
        if self.exclude:
            lines.append(f"入れない科目: {'、'.join(self.exclude)}")
        return lines
