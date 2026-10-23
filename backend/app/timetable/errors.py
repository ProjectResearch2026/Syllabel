"""時間割の前提が揃わないときの例外。"""


class ContextError(ValueError):
    """時間割を組む前提が揃わない(課程コード・学年が無い、候補が無い)。API では 400。"""


class CurriculumNotFound(ContextError):
    """(課程コード, 入学年度)の履修要項が無い。API では 404。"""
