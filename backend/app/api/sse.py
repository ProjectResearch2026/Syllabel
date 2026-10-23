import json
from collections.abc import AsyncIterator

from fastapi.responses import StreamingResponse


def format_sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def sse_response(gen: AsyncIterator[str]) -> StreamingResponse:
    """SSE の応答。design.md §6.1.2。

    `no-transform` は中継に応答を圧縮させないためである。圧縮されると、中継が圧縮の
    単位が溜まるまで送らず、本文・思考が応答の終わりにまとめて届く(Next の開発サーバの
    中継が gzip をかけ、思考も本文も最後まで画面に出なかった)。圧縮を掛ける中継
    (Next の `compression`、Caddy の `encode`)はいずれも `no-transform` の応答を圧縮しない。
    """
    return StreamingResponse(
        gen,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )
