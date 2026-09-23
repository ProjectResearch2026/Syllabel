"""科目名の突合規則。design.md §5.1.5。

要件充足判定(`requirements.py`)とマージ時の参照検査(`merge.py`)の両方が使う。
`requirements.py` は `merge.py` を読み込むため、循環しないよう独立させている。
**frontend の `lib/courseTitle.ts` の `normalizeTitle()` と同じ規則に保つこと。**
"""

import unicodedata


def normalize_title(title: str) -> str:
    """科目名を突合用に正規化する。

    `curricula/` の科目名は履修要項の表記のまま転記する規約であり(§5.1.5)、
    正規化は突合する側の責務とする。成績表由来の科目名には全角英数字や空白が
    混じるため、api-clean との名寄せ(§5.1.5)と同じく NFKC 正規化と空白除去を
    施したうえで突き合わせる。
    """
    return "".join(unicodedata.normalize("NFKC", title).split())
