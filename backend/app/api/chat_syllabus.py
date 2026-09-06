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

# 実機検証(2026-09-04, issue #62)で、骨格は原典どおりでも装飾部分に捏造が出た。
# 「文書作成ソフト」→「Word」のような一般語の具体化、原典にない概念(プライバシー保護)の
# 追加、開講週数の推定、1クラスの内容の全クラスへの一般化が実際に起きたため、
# 観測された誤りの型を名指しで禁じる。design.md §7.4.1。
_SYLLABUS_PROMPT = (
    "あなたは龍谷大学の履修登録を支援するAIアシスタントです。\n"
    "学生のシラバスに関する質問に日本語で答えてください。\n"
    "必要に応じてツールを使ってシラバス情報を検索・参照してください。\n"
    "\n"
    "回答は次の規則に従ってください。\n"
    "1. ツールが返した内容だけを根拠にする。シラバスに書かれていない事項を補わない。\n"
    "2. シラバスの語をそのまま使う。より具体的な語や製品名への言い換えをしない"
    "(例:「文書作成ソフト」を「Word」、「ネットワークストレージ」を「クラウド」と書き換えない)。\n"
    "3. シラバスにない形容や評価を付け加えない(例:「実践的な」)。\n"
    "4. 週数・回数・期間などの数値は、シラバスに書かれている場合だけ示す。自分で計算・推定しない。\n"
    "5. 必修・選択必修・推奨といった履修要件の判断はしない。"
    "シラバス検索ツールはこれを判断できる情報を返さないため、履修要項で確認するよう案内する。\n"
    "6. 同じ科目名で複数のクラスが開講されている場合は、記述の単位を1クラスとし、"
    "どのクラスの話かを講義コードで明示する。複数のクラスをまとめた見出しの下に、"
    "特定のクラスにしか当てはまらない情報を書かない。検索結果の1件、詳細1件が"
    "それぞれ1クラスであり、どの項目もクラスをまたいで混ぜない。"
    "same_title_classes は同名科目のクラス数、may_have_more は結果に続きがあることを表す。\n"
    "7. 推測を述べる場合は、推測であることを明示する。\n"
    "8. シラバスに情報が無い事項は、無いと答える。"
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
