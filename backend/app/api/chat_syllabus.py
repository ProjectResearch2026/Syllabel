"""シラバスチャットのSSEエンドポイント。design.md §6.1 / §7.4 / §7.5。"""

import asyncio
import json

import httpx
from fastapi import APIRouter, HTTPException
from pydantic_ai import AgentRunResultEvent, AgentStreamEvent
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    PartDeltaEvent,
    PartStartEvent,
    TextPart,
    TextPartDelta,
    UserPromptPart,
)

from app.agents.chat_agent import build_chat_agent
from app.agents.tools import get_syllabus
from app.api.sse import format_sse, sse_response
from app.schemas.chat import ChatMessage, ChatRequest
from app.schemas.student import StudentProfile

_SYLLABUS_PROMPT = (
    "あなたは龍谷大学の履修登録を支援するAIアシスタントです。\n"
    "学生のシラバスに関する質問に日本語で答えてください。\n"
    "必要に応じてツールを使ってシラバス情報を検索・参照してください。"
)


def _to_history(history: list[ChatMessage]) -> list[ModelMessage]:
    """対話履歴を PydanticAI が読める形式に変換する。"""
    messages: list[ModelMessage] = []
    for m in history:
        if m.role == "user":
            messages.append(ModelRequest(parts=[UserPromptPart(content=m.content)]))
        else:
            messages.append(ModelResponse(parts=[TextPart(content=m.content)]))
    return messages


def _build_prompt(message: str, profile: StudentProfile | None) -> str:
    """学生情報があれば質問文の前につける。成績情報は含めない。"""
    if profile is None:
        return message

    facts: list[str] = []
    if profile.grade is not None:
        facts.append(f"学年: {profile.grade}回生")
    if profile.program:
        facts.append(f"課程: {profile.program}")

    if not facts:
        return message

    return "【学生情報】\n" + "\n".join(facts) + "\n\n【質問】\n" + message


def _event_text(event: AgentStreamEvent | AgentRunResultEvent) -> str:
    """ストリームイベントから本文テキストだけを取り出す。

    本文の先頭チャンクは PartStartEvent 側に乗り、続きが PartDeltaEvent で届くため両方拾う。
    思考(ThinkingPart)とツール呼び出し(ToolCallPart)はクライアントに流さない。
    """
    if isinstance(event, PartStartEvent) and isinstance(event.part, TextPart):
        return event.part.content
    if isinstance(event, PartDeltaEvent) and isinstance(event.delta, TextPartDelta):
        return event.delta.content_delta
    return ""


def _stream_response(
    prompt: str,
    history: list[ModelMessage],
    instructions: str | None = None,
):
    """エージェントの応答を SSE ストリームとして返す。2つのチャットルートで共有する。

    run_stream() は output_type に合致する最初の出力で実行グラフを打ち切るため、
    ツール呼び出しの直前に空白だけの TextPart を出すモデル(Qwen3.6 + reasoning パーサ)では
    ツールが一度も実行されなかった。run_stream_events() で最後までイベントを消費する。
    """
    agent = build_chat_agent()

    async def gen():
        try:
            started = False
            async with agent.run_stream_events(
                prompt,
                message_history=history,
                instructions=instructions,
            ) as events:
                async for event in events:
                    text = _event_text(event)
                    if not started:
                        # 本文が始まるまでの空白のみの出力は捨てる
                        text = text.lstrip()
                        if not text:
                            continue
                        started = True
                    elif not text:
                        continue
                    yield format_sse({"delta": text})
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - SSE開始後は例外を投げられないため全て捕捉する
            yield format_sse({"error": "応答の生成中にエラーが発生しました"})
        yield format_sse({"done": True})

    return sse_response(gen())


router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat/syllabus")
async def chat_syllabus(req: ChatRequest):
    """シラバス全体に対するチャット。design.md §7.4。"""
    return _stream_response(
        _build_prompt(req.message, req.profile),
        _to_history(req.history),
        _SYLLABUS_PROMPT,
    )


@router.post("/chat/syllabus/{code}")
async def chat_syllabus_by_code(code: str, req: ChatRequest):
    """特定講義に絞ったチャット。design.md §7.5。"""
    try:
        detail = await get_syllabus(code)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404)
        raise HTTPException(status_code=502, detail="upstream error")
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="upstream error")

    instructions = (
        f"{_SYLLABUS_PROMPT}\n\n【対象講義】\n{json.dumps(detail, ensure_ascii=False)}"
    )
    return _stream_response(
        _build_prompt(req.message, req.profile),
        _to_history(req.history),
        instructions,
    )
