"""履修提案チャットのSSEエンドポイント。design.md §6.1 / §7.3。"""

from fastapi import APIRouter

from app.api.chat_syllabus import _build_prompt, _stream_response, _to_history
from app.schemas.chat import ProposalChatRequest

_PROPOSAL_PROMPT = (
    "あなたは龍谷大学の履修登録を支援するAIアシスタントです。\n"
    "以下の【現在の履修提案】について学生から質問を受けます。"
    "提案理由の説明、個別科目の内容や評価方法の説明、提案の組み替え相談に日本語で答えてください。\n"
    "科目の詳細が必要なときは syllabusCode を tool_get_syllabus に渡して取得してください。"
)
router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat/proposal")
async def chat_proposal(req: ProposalChatRequest):
    """履修提案に関するチャット。design.md §7.3。"""
    instructions = (
        f"{_PROPOSAL_PROMPT}\n\n"
        f"【現在の履修提案】\n{req.proposal.model_dump_json(indent=2)}"
    )
    return _stream_response(
        _build_prompt(req.message, req.profile),
        _to_history(req.history),
        instructions,
    )
