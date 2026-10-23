"""開講年度ファイル `offerings/<開講年度>/admission-<入学年度>/` の型定義。design.md §5.1.4。

科目名 → シラバスコードの対応表であり、`curricula/` 側とは**科目名**で結合する
(§4.4.1)。`resolved` のキーと `not_offered` / `unresolved` の `title` は、
対応する `curricula/` 側の `title` と1文字も違わない原表記を用いる。正規化は
名寄せの作業の中にとどめ、このファイルには持ち込まない(§5.1.5)。
"""

from collections import Counter
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

# 課程コード2桁(§4.4.2)。教養教育科目対応版は "00"
ProgramCode = Annotated[str, StringConstraints(pattern=r"^\d{2}$")]
# シラバスコード(§5.1.4)。英字1桁 + 数字9桁(例: Y001006010 / G260110004)
SyllabusCode = Annotated[str, StringConstraints(pattern=r"^[A-Z]\d{9}$")]
CourseTitle = Annotated[str, StringConstraints(min_length=1)]
Reason = Annotated[str, StringConstraints(min_length=1)]
# 1科目に対して1件以上。コードが1件も無い科目は not_offered / unresolved に置く
SyllabusCodes = Annotated[list[SyllabusCode], Field(min_length=1)]


class _YamlModel(BaseModel):
    """`offerings/` の YAML に対応するモデルの基底。未知のキーを拒否する。"""

    model_config = ConfigDict(extra="forbid")


class NotOfferedCourse(_YamlModel):
    """当年度不開講と**確認できた**科目(§5.1.4)。

    履修要項には載っているが今年度は開かれない科目であり、正常な状態。
    `reason` には不開講と判断した根拠を書く。根拠を書けないものをここに
    入れてはならない(名寄せの取りこぼしが「不開講」として恒久的に隠れるため)。
    """

    title: CourseTitle
    reason: Reason


class UnresolvedCourse(_YamlModel):
    """名寄せがどちらとも確定できなかった科目(§5.1.4)。

    `not_offered` の受け皿ではなく「まだ判断がついていないもの」であり、
    データ不整合として検出されなければならない。`reason` には調査状況を書く。
    非空でも backend の起動は妨げず、警告ログを出すにとどめる(§4.4.3)。
    """

    title: CourseTitle
    reason: Reason


class Offering(_YamlModel):
    """開講年度ファイル1つ(§5.1.4)。"""

    offering_year: int = Field(ge=2000)
    admission_year: int = Field(ge=2000)
    program_code: ProgramCode
    # 名寄せ成功かつ当年度開講。キーは科目名、値はシラバスコード(1:N)
    resolved: dict[CourseTitle, SyllabusCodes] = {}
    not_offered: list[NotOfferedCourse] = []
    unresolved: list[UnresolvedCourse] = []

    @model_validator(mode="after")
    def check_no_duplicate_codes(self) -> "Offering":
        """1科目に同じシラバスコードを重複して並べない。"""
        for title, codes in self.resolved.items():
            duplicated = sorted(c for c, n in Counter(codes).items() if n > 1)
            if duplicated:
                raise ValueError(
                    f"シラバスコードが重複しています: {title}"
                    f"({', '.join(duplicated)})"
                )
        return self
