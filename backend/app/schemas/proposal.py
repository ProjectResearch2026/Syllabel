"""履修提案の構造化出力スキーマ。design.md §7.2。"""

import unicodedata
from collections.abc import Sequence
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, create_model, model_validator
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
# なお api-clean の `term` は1つしか持たず、「3Q　金2、4Q　金2」のように2つの
# クォーターにまたがる科目も `3Q` になる(2026年度で約40件)。一覧 API は開講の生値
# (`term_schedule_raw`)を返さないため、ここでは見分けられない
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
    # 土曜は教職・学芸員課程や教養の特別講義で開講される(2026年度で16クラス)。
    # 月〜金に限ると、土曜のクラスを選んだときに曜日を null にするしかなくなる
    day: Literal["月", "火", "水", "木", "金", "土"] | None = Field(
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
        """同じ曜日・時限で、開講期間が重なる科目が無いか。

        学期の文字列の一致ではなく**占めるクォーターの重なり**で判定する。前期と
        1Q、通年と後期は文字列が違っても同じコマを取り合う。クォーターが分からない
        学期どうしは、従来どおり文字列が同じときだけ重複とみなす。
        """
        seen: list[tuple[str, int, str | None, frozenset[int] | None]] = []
        for course in self.courses:
            if course.day is None or course.period is None:
                continue
            quarters = quarters_of(course.term)
            for day, period, term, other in seen:
                if (day, period) != (course.day, course.period):
                    continue
                overlaps = (
                    bool(quarters & other)
                    if quarters is not None and other is not None
                    else term == course.term
                )
                if overlaps:
                    raise ValueError(
                        f"コマが重複しています: {course.day}{course.period}限 "
                        f"({term} と {course.term}) — 同じ曜日・時限で開講期間が重なる"
                        f"科目を複数割り当てないこと。"
                    )
            seen.append((course.day, course.period, course.term, quarters))
        return self


# --- モデルに書かせる下書き(§7.2)---
#
# **モデルにはシラバスコードと理由だけを書かせ、科目名・曜日・時限・学期・単位は
# backend が候補一覧から補う**(`app/agents/proposal_agent.py` の `assemble_proposal()`)。
# 2026-09-23 の実機(Qwen3.8)では、全項目を書かせる形式で次が起きた:
#
# - 同じ科目の並びを繰り返し書き続け、`max_tokens` で打ち切られて失敗した(620秒)
# - シラバスコードを1件も書かなかった(null を許していたため)
#
# 下書きの形式はリクエストごとに作る。`syllabusCode` を**その回の候補のコードだけ**の
# 列挙にすることで、vLLM の構造化出力が候補に無いコードを書けなくする。`courses` の
# 件数の上限は**暴走止め**であり、履修登録の単位数の上限(CAP)そのものではない
# (単位の合計は JSON Schema で表せないため、書き終えた後に backend が確かめる)。


def proposal_draft_model(codes: Sequence[str], max_items: int) -> type[BaseModel]:
    """その回の候補コードだけを選べる下書きの形式を作る。

    Args:
        codes: 【候補科目】に載せたクラスのシラバスコード。1件以上。
        max_items: `courses` の件数の上限(暴走止め)。
    """
    config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    course = create_model(
        "DraftCourse",
        __config__=config,
        __doc__="提案する1クラス。",
        syllabus_code=(
            Literal[tuple(codes)],
            Field(description="【候補科目】の行の [ ] 内に書かれたシラバスコード。"),
        ),
        reason=(
            str,
            Field(description="この科目を勧める理由を40字以内の1文で書くこと。"),
        ),
    )
    return create_model(
        "ProposalDraft",
        __config__=config,
        __doc__="時間割提案の下書き。",
        courses=(
            list[course],
            Field(
                max_length=max_items,
                description=(
                    "提案するクラスのリスト。同じ科目を2回入れないこと。"
                    "同じ曜日・時限で開講期間が重なるクラスを入れないこと。"
                ),
            ),
        ),
        summary=(
            str,
            Field(description="提案全体の方針と履修上の注意点を2〜4文で書くこと。"),
        ),
    )
