"""提案チャットのSSEエンドポイント。design.md §6.1 / §7.3。

生成済みの履修提案(`TimetableProposal`)についての対話を受け持つ。エージェントは
シラバスチャット(§7.4)と同じ `chat_agent` を共用し(専用エージェントは作らない)、
提案を JSON 化して `instructions` に載せることで役割の差を吸収する。ツール
(`search_syllabi` / `get_syllabus`)を持つため、提案に載った講義の詳細を
api-clean に問い合わせながら答えられる(§7.3 のシーケンス)。

SSE の書式(delta → done)・エラー時の扱い・履歴の変換は §7.4 と同一であり、
`app/api/chat_syllabus.py` の実装をそのまま使う。学生プロファイル・提案・対話は
永続化もログ記録もしない(§4.2.3)。
"""

from fastapi import APIRouter

from app.api.chat_syllabus import _build_prompt, _stream_response, _to_history
from app.schemas.chat import ProposalChatRequest

# シラバスチャット(§7.4.1)と同じく、観測できる誤りの型を名指しで禁じる方針を採る。
# 提案チャット固有の危うさは「提案そのものを言い直すうちに中身が変わる」ことにある。
# 単位数・曜日・時限は【現在の提案】に書いてあり、モデルが数え直す必要はない。
_PROPOSAL_PROMPT = (
    "あなたは龍谷大学の履修登録を支援するAIアシスタントです。\n"
    "学生に提示済みの履修提案(時間割)についての質問に日本語で答えてください。\n"
    "講義の内容を問われたときは、ツールでシラバスを検索・参照してください。\n"
    "\n"
    "回答は次の規則に従ってください。\n"
    "1. 提案の内容は【現在の提案】に書かれているものがすべてである。"
    "そこに無い科目を提案済みであるかのように書かない。\n"
    "2. 講義の内容・評価方法・教科書などシラバスの事項は、"
    "ツールが返した内容だけを根拠にする。ツールを使わずに答えない。\n"
    "3. シラバスの語をそのまま使う。より具体的な語や製品名への言い換えをしない"
    "(例:「文書作成ソフト」を「Word」と書き換えない)。\n"
    "4. 科目名・単位数・曜日・時限・学期は【現在の提案】の値をそのまま用いる。"
    "自分で計算・推定しない。合計単位数は totalCredits を答え、"
    "これが null のときは不明と答える。単位数は整数で書き、「2.0単位」のように小数で書かない。\n"
    "5. 卒業要件の充足状況は、【現在の提案】の summary と各科目の reason に"
    "書かれている範囲でのみ述べる。不足単位を自分で算出しない。\n"
    "6. 同じ科目名で複数のクラスが開講されている場合は、どのクラスの情報かを"
    "講義コード・担当教員・サブタイトルで明示し、他のクラスにも当てはまるかのように書かない。\n"
    "7. 提案の変更を求められたときは、変更案を文章で示すにとどめる。"
    "時間割を差し替えたかのようには書かず、実際の作り直しは提案の再生成で行うと案内する。\n"
    "8. 推測を述べる場合は、推測であることを明示する。\n"
    "9. 情報が無い事項は、無いと答える。"
)


router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat/proposal")
async def chat_proposal(req: ProposalChatRequest):
    """生成済みの履修提案についてのチャット。design.md §7.3。

    `messages` の末尾を質問、それより前を履歴として扱う。提案は
    リクエストと同じ camelCase の JSON のまま `instructions` に載せ、
    規則4・5が指す `totalCredits` / `summary` / `reason` をモデルが
    そのまま参照できるようにする。
    """
    proposal_json = req.proposal.model_dump_json(by_alias=True)
    instructions = f"{_PROPOSAL_PROMPT}\n\n【現在の提案】\n{proposal_json}"
    return _stream_response(
        _build_prompt(req.question, req.student_profile),
        _to_history(req.history),
        instructions,
    )
