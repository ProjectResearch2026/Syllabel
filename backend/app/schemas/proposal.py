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


class TimetableProposal(BaseModel):
    """時間割提案全体。"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    courses: list[ProposedCourse] = Field(
        description="提案する科目のリスト。同一の曜日・時限・学期に複数の科目を割り当ててはならない。",
    )
    total_credits: int | None = Field(
        default=None,
        description="提案科目の合計単位数。creditsがnullの科目が含まれる場合はnullにすること。",
    )
    summary: str = Field(
        description="提案全体の説明・注意点を2〜4文で記述すること。卒業要件との関係や履修上の注意点を含めること。",
    )

    @model_validator(mode="after")
    def check_no_time_conflict(self) -> "TimetableProposal":
        """同じ曜日・時限で、開講期間が重なる科目が無いか。

        各科目の**すべてのコマ**(`occupied_slots()`)どうしを比べる。「金4・金5」の
        科目と金5の科目は重なる。学期の文字列の一致ではなく占めるクォーターの重なりで
        判定する(`slots_clash()`)。
        """
        seen: list[CourseSlot] = []
        for course in self.courses:
            mine = course.occupied_slots()
            for slot in mine:
                for other in seen:
                    if slots_clash(slot, other):
                        raise ValueError(
                            f"コマが重複しています: {slot.day}{slot.period}限 "
                            f"({other.term} と {slot.term}) — 同じ曜日・時限で開講期間が重なる"
                            f"科目を複数割り当てないこと。"
                        )
            seen.extend(mine)
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
