"""エージェントの実行を SSE に流す(§6.1.1)。時間割のアシスタントとシラバスチャットで共用する。

待っている間に何が起きているかを見せるため、本文(`delta`)のほかに次を流す。

| イベント | 内容 |
|---|---|
| `{"thinking": "..."}` | モデルの思考の断片。vLLM の reasoning パーサが本文と分けて返したときだけ |
| `{"activity": {"tool", "label", "args"}}` | ツールを呼び始めた・引数を書いている。`label` は backend が決めた固定文言で、モデルには書かせない。`args` はモデルが書いた引数(書きかけの間も流す) |
| ツールが積んだイベント | ツールの実行が終わったときに、ツールが `outbox` に積んだもの(時間割の `step` / `timetable` / `conditions`)を流す |
| `{"error": "..."}` / `{"done": true}` | 失敗と終端。終端はエラー時も必ず流れる |

**ストリームは `run_stream_events()` で読む。** `run_stream()` は出力型に合致する最初の
出力で実行グラフを打ち切るため、ツール呼び出しの直前に空白だけの本文パートを出す
モデルではツールが一度も実行されない。本文が始まる前の空白だけの出力は捨てる。

**学生データをログに出さない(§4.2.3)。** 本モジュールは本文も引数もログに書かない。
"""

import asyncio
import logging
from collections.abc import AsyncIterator, Callable

from pydantic_ai import Agent
from pydantic_ai.messages import (
    FunctionToolCallEvent,
    FunctionToolResultEvent,
    ModelMessage,
    ModelRequest,
    ModelResponse,
    PartDeltaEvent,
    PartStartEvent,
    TextPart,
    TextPartDelta,
    ThinkingPart,
    ThinkingPartDelta,
    ToolCallPart,
    ToolCallPartDelta,
    UserPromptPart,
)
from pydantic_core import from_json

from app.api.sse import format_sse
from app.schemas.chat import ChatMessage

logger = logging.getLogger(__name__)

# ツールごとの、待っている間に見せる文言
TOOL_LABELS = {
    "build_timetable": "時間割を組んでいます",
    "search_courses": "シラバスを検索しています",
    "get_course": "シラバスを読んでいます",
}


def to_history(history: list[ChatMessage]) -> list[ModelMessage]:
    """対話履歴を PydanticAI が読める形式に変換する。"""
    messages: list[ModelMessage] = []
    for m in history:
        if m.role == "user":
            messages.append(ModelRequest(parts=[UserPromptPart(content=m.content)]))
        else:
            messages.append(ModelResponse(parts=[TextPart(content=m.content)]))
    return messages


def _partial_args(text: str) -> dict | None:
    """書きかけの引数(JSON の断片)を読む。読めなければ None。"""
    if not text:
        return {}
    try:
        value = from_json(text, allow_partial=True)
    except ValueError:
        return None
    return value if isinstance(value, dict) else None


def _activity(call_id: str, tool: str, args: dict | None) -> dict:
    """ツールの進み具合。`id` は呼び出しごとの値で、書きかけの引数を流し直すたびに同じ値になる。"""
    return {
        "activity": {
            "id": call_id,
            "tool": tool,
            "label": TOOL_LABELS.get(tool, "調べています"),
            "args": args or {},
        }
    }


async def stream_agent(
    agent: Agent,
    prompt: str,
    *,
    history: list[ModelMessage],
    instructions: str,
    deps=None,
    outbox: list[dict] | None = None,
    error_text: str = "応答の生成中にエラーが発生しました",
    on_finish: Callable[[], list[dict]] | None = None,
) -> AsyncIterator[str]:
    """エージェントを走らせ、イベントを SSE の行として返す。

    Args:
        outbox: ツールが流したいイベントを積むリスト。ツールの実行が終わるたびに流して空にする。
        on_finish: 最後に流すイベントを返す関数(本文の後・`done` の前)。
    """
    pending = outbox if outbox is not None else []
    started = False
    # パートの番号 → (呼び出しの id, ツール名, 書きかけの引数, 最後に流した引数)
    tools: dict[int, tuple[str, str, str, dict | None]] = {}

    def flush() -> list[str]:
        lines = [format_sse(event) for event in pending]
        pending.clear()
        return lines

    try:
        async with agent.run_stream_events(
            prompt, message_history=history, instructions=instructions, deps=deps
        ) as events:
            async for event in events:
                if isinstance(event, PartStartEvent):
                    part = event.part
                    if isinstance(part, ThinkingPart) and part.content:
                        yield format_sse({"thinking": part.content})
                    elif isinstance(part, ToolCallPart):
                        raw = part.args if isinstance(part.args, str) else ""
                        args = part.args if isinstance(part.args, dict) else _partial_args(raw)
                        tools[event.index] = (part.tool_call_id, part.tool_name, raw, args)
                        yield format_sse(_activity(part.tool_call_id, part.tool_name, args))
                    elif isinstance(part, TextPart):
                        text = part.content if started else part.content.lstrip()
                        if text:
                            started = True
                            yield format_sse({"delta": text})
                    continue
                if isinstance(event, PartDeltaEvent):
                    delta = event.delta
                    if isinstance(delta, ThinkingPartDelta) and delta.content_delta:
                        yield format_sse({"thinking": delta.content_delta})
                    elif isinstance(delta, TextPartDelta):
                        text = delta.content_delta if started else delta.content_delta.lstrip()
                        if text:
                            started = True
                            yield format_sse({"delta": text})
                    elif isinstance(delta, ToolCallPartDelta) and event.index in tools:
                        call_id, name, raw, last = tools[event.index]
                        if isinstance(delta.args_delta, str):
                            raw += delta.args_delta
                        name = name or (delta.tool_name_delta or "")
                        args = _partial_args(raw)
                        if args is not None and args != last:
                            tools[event.index] = (call_id, name, raw, args)
                            yield format_sse(_activity(call_id, name, args))
                        else:
                            tools[event.index] = (call_id, name, raw, last)
                    continue
                if isinstance(event, FunctionToolCallEvent):
                    part = event.part
                    yield format_sse(
                        _activity(part.tool_call_id, part.tool_name, part.args_as_dict())
                    )
                    continue
                if isinstance(event, FunctionToolResultEvent):
                    for line in flush():
                        yield line
        for line in flush():
            yield line
        if on_finish is not None:
            for extra in on_finish():
                yield format_sse(extra)
    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: BLE001 - SSE開始後は例外を投げられないため全て捕捉する
        logger.warning("エージェントの実行に失敗しました: %s", type(exc).__name__)
        for line in flush():
            yield line
        yield format_sse({"error": error_text})
    yield format_sse({"done": True})
