"""履修提案チャットのSSEエンドポイント。design.md §6.1 / §7.3。"""

from fastapi import APIRouter

from app.agents.chat_agent import _SYSTEM_PROMPT
from app.api.chat_syllabus import _build_prompt, _stream_response, _to_history
from app.schemas.chat import ProposalChatRequest

router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat/proposal")
async def chat_proposal(req: ProposalChatRequest):
    """履修提案に関するチャット。design.md §7.3。"""
    instructions = (
        f"{_SYSTEM_PROMPT}\n\n"
        f"【現在の履修提案】\n{req.proposal.model_dump_json(indent=2)}"
    )
    return _stream_response(
        _build_prompt(req.message, req.profile),
        _to_history(req.history),
        instructions,
    )