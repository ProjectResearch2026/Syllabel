"""エージェントの実行を SSE に流す(§6.1.1)。時間割のアシスタントとシラバスチャットで共用する。

待っている間に何が起きているかを見せるため、本文(`delta`)のほかに次を流す。

| イベント | 内容 |
|---|---|
| `{"thinking": "..."}` | モデルの思考の断片。vLLM の reasoning パーサが本文と分けて返したときだけ |
| `{"activity": {"tool", "label", "args"}}` | ツールを呼び始めた・引数を書いている。`label` は backend が決めた固定文言で、モデルには書かせない。`args` はモデルが書いた引数(書きかけの間も流す) |
| `{"activity": {..., "found", "codes"}}` | シラバス検索が終わったときに、同じ `id` で当たった科目数(`found`)と返した科目のシラバスコード(`codes`)を添えて流し直す |
| `{"activity": {..., "failed", "displaced", "mode", "removed", "added", "moved"}}` | 時間割の組み立てが終わったときに、頼まれた入れる・外すのうちできなかったもの(引数の値 → 理由)、入れたい科目のために外した科目(科目名 → 理由)、実際に使った組み方、組み立ての前後で外した・入れた・コマを移した科目を添えて流し直す |
| `{"activity": {..., "titles"}}` | 引数が書き終わったとき(と結果を添えて流し直すとき)に、引数のシラバスコード → 科目名を添える。時間割に無い科目もコードのまま見せないため |
| ツールが積んだイベント | ツールの実行が終わったときに、ツールが `outbox` に積んだもの(時間割の `step` / `timetable` / `conditions`)を流す |
| `{"error": "..."}` / `{"done": true}` | 失敗と終端。終端はエラー時も必ず流れる |

**ストリームは `run_stream_events()` で読む。** `run_stream()` は出力型に合致する最初の
出力で実行グラフを打ち切るため、ツール呼び出しの直前に空白だけの本文パートを出す
モデルではツールが一度も実行されない。本文が始まる前の空白だけの出力は捨てる。

**実行1回ぶん、トークンを1つ借りる**(`app/agents/__init__.py` の `model_pool()`)。ゲートウェイは
同一トークンで生成を1本しか通さない(§3.4.3)ため、すべて生成中なら空くまで待つ。ツールを挟んで
モデルを2回以上呼ぶあいだも返さない(途中の呼び出しが `503 busy` で落ちないように)。

**学生データをログに出さない(§4.2.3)。** 本モジュールは本文も引数もログに書かない。
"""

import asyncio
import logging
from collections.abc import AsyncIterator, Callable

from pydantic_ai import Agent
from pydantic_ai.agent import AgentInstructions
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
    ToolReturnPart,
    UserPromptPart,
)
from pydantic_core import from_json

from app.agents import ModelBusyError, model_pool
from app.api.sse import format_sse
from app.schemas.chat import ChatMessage
from app.settings import get_settings

logger = logging.getLogger(__name__)

# 引数のうちシラバスコード(か科目名)を持つもの。画面では科目名に直して見せる
CODE_ARGS = {
    "build_timetable": ("include", "exclude"),
    "get_course": ("code",),
}

# トークンがすべて生成中のまま待つ上限を過ぎたときの文言(§3.4.3)
BUSY_TEXT = "混み合っています。少し待ってからもう一度送ってください"

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


def _activity(call_id: str, tool: str, args: dict | None, **result) -> dict:
    """ツールの進み具合。`id` は呼び出しごとの値で、書きかけの引数を流し直すたびに同じ値になる。

    `result` はツールが終わったときに添える結果の要約(シラバス検索の `found`)。
    """
    return {
        "activity": {
            "id": call_id,
            "tool": tool,
            "label": TOOL_LABELS.get(tool, "調べています"),
            "args": args or {},
            **result,
        }
    }


def _titles(tool: str, args: dict, title_of: Callable[[str], str] | None) -> dict:
    """引数のシラバスコード → 科目名。引けたものだけを `{"titles": {...}}` にして返す。"""
    if title_of is None:
        return {}
    titles: dict[str, str] = {}
    for key in CODE_ARGS.get(tool, ()):
        value = args.get(key)
        for code in value if isinstance(value, list) else [value]:
            if not isinstance(code, str) or not code:
                continue
            title = title_of(code)
            if title and title != code:
                titles[code] = title
    return {"titles": titles} if titles else {}


def _result_summary(tool: str, args: dict, content: object) -> dict:
    """ツールの結果のうち画面に出すもの。シラバス検索は当たった科目数と返した科目のコード
    (科目の中身は流さない)、シラバスを読んだときは読んだ科目の名前。

    検索のコード(`codes`)は frontend が会話ごとに集め、次の発話で `mentionedCodes` として
    送り返す(対話履歴は本文だけで、前の発話で出た科目のコードが残らないため。§7.3.1)。
    """
    if tool == "search_courses" and isinstance(content, dict):
        summary: dict = {}
        total = content.get("total")
        if isinstance(total, int):
            summary["found"] = total
        codes = [
            code
            for course in content.get("courses") or []
            if isinstance(course, dict)
            for code in [
                course.get("code"),
                *(c.get("code") for c in course.get("otherClasses") or [] if isinstance(c, dict)),
            ]
            if isinstance(code, str) and code
        ]
        if codes:
            summary["codes"] = codes
        return summary
    if tool == "get_course" and isinstance(content, dict):
        code, title = args.get("code"), content.get("title")
        if isinstance(code, str) and isinstance(title, str) and title and title != code:
            return {"titles": {code: title}}
    return {}


async def stream_agent(
    agent: Agent,
    prompt: str,
    *,
    history: list[ModelMessage],
    instructions: AgentInstructions,
    deps=None,
    outbox: list[dict] | None = None,
    error_text: str = "応答の生成中にエラーが発生しました",
    on_finish: Callable[[], list[dict]] | None = None,
    title_of: Callable[[str], str] | None = None,
    activity_results: dict[str, dict] | None = None,
) -> AsyncIterator[str]:
    """エージェントを走らせ、イベントを SSE の行として返す。

    Args:
        outbox: ツールが流したいイベントを積むリスト。ツールの実行が終わるたびに流して空にする。
        on_finish: 最後に流すイベントを返す関数(本文の後・`done` の前)。
        title_of: シラバスコードを科目名に直す関数。ツールの引数のコードに科目名を添える。
        instructions: 規則と事実。関数を含めると、モデルを呼ぶたびに評価し直される。
        activity_results: 呼び出しの id → ツールの行に添える結果。ツールが実行中に書き込み、
            結果が届いたときに同じ `id` の `activity` に添えて流し直す。
    """
    pending = outbox if outbox is not None else []
    started = False
    # パートの番号 → (呼び出しの id, ツール名, 書きかけの引数, 最後に流した引数)
    tools: dict[int, tuple[str, str, str, dict | None]] = {}
    # 呼び出しの id → (ツール名, 引数, 添えた科目名)。結果を添えて流し直すときに使う
    called: dict[str, tuple[str, dict, dict]] = {}

    def flush() -> list[str]:
        lines = [format_sse(event) for event in pending]
        pending.clear()
        return lines

    try:
        async with (
            model_pool().acquire(get_settings().llm_wait_seconds) as model,
            agent.run_stream_events(
                prompt, message_history=history, instructions=instructions, deps=deps, model=model
            ) as events,
        ):
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
                    args = part.args_as_dict()
                    titles = _titles(part.tool_name, args, title_of)
                    called[part.tool_call_id] = (part.tool_name, args, titles)
                    yield format_sse(_activity(part.tool_call_id, part.tool_name, args, **titles))
                    continue
                if isinstance(event, FunctionToolResultEvent):
                    result = event.part
                    if isinstance(result, ToolReturnPart) and result.tool_call_id in called:
                        name, args, titles = called[result.tool_call_id]
                        summary = _result_summary(name, args, result.content)
                        if activity_results is not None:
                            summary.update(activity_results.pop(result.tool_call_id, {}))
                        if summary:
                            # 引数から引いた科目名に、結果から分かった科目名を重ねる
                            merged = {**titles.get("titles", {}), **summary.get("titles", {})}
                            if merged:
                                summary["titles"] = merged
                            yield format_sse(_activity(result.tool_call_id, name, args, **summary))
                    for line in flush():
                        yield line
        for line in flush():
            yield line
        if on_finish is not None:
            for extra in on_finish():
                yield format_sse(extra)
    except asyncio.CancelledError:
        raise
    except ModelBusyError:
        logger.warning("トークンが空かないまま待つ上限を過ぎました")
        yield format_sse({"error": BUSY_TEXT})
    except Exception as exc:  # noqa: BLE001 - SSE開始後は例外を投げられないため全て捕捉する
        logger.warning("エージェントの実行に失敗しました: %s", type(exc).__name__)
        for line in flush():
            yield line
        yield format_sse({"error": error_text})
    yield format_sse({"done": True})
