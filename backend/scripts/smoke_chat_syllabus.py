"""実 vLLM + api-clean 相手のシラバスチャット疎通スモーク。
   使い方: python -m scripts.smoke_chat_syllabus [講義コード]
   VLLM_BASE_URL / API_CLEAN_BASE_URL を env で上書き可(既定は compose 前提)。
   uvicorn 起動中なら curl -N でも同じ確認ができる。"""
import asyncio
import json
import sys

import httpx

from app.main import app

RULE = "-" * 60


def _payload(line: str) -> dict | None:
    """SSE の1行から data のペイロードを取り出す。イベント区切りの空行等は None。"""
    if not line.startswith("data: "):
        return None
    return json.loads(line.removeprefix("data: "))


async def stream(client: httpx.AsyncClient, path: str, message: str) -> None:
    """SSE を受け、本文を組み立てながら表示する。

    delta は1〜数文字ずつ届くため、イベントを1行ずつ出すと本文が読めない。
    回答の妥当性(design.md §7.4.1)を目視で確かめるのがこのスモークの用途なので、
    繋いだ本文を出す。受信の進みが見えるよう逐次書き出す。
    フレーミング自体が壊れていないことは、末尾の delta 件数と done で確認する。
    """
    print(f"\n=== POST {path} ===")
    print(f"質問: {message}")
    async with client.stream("POST", path, json={"message": message, "history": []}) as resp:
        print("status:", resp.status_code, resp.headers.get("content-type"))
        if resp.status_code != 200:
            # SSE ではなくエラー応答。本文を読まないと原因が分からない
            await resp.aread()
            print("body:", resp.text)
            return

        print(RULE)
        deltas = 0
        done = False
        async for line in resp.aiter_lines():
            payload = _payload(line)
            if payload is None:
                continue
            if "delta" in payload:
                deltas += 1
                print(payload["delta"], end="", flush=True)
            elif "error" in payload:
                print(f"\n[error] {payload['error']}")
            elif payload.get("done"):
                done = True
        print(f"\n{RULE}")
        print(f"delta {deltas}件 / done {'あり' if done else 'なし'}")


async def main() -> None:
    code = sys.argv[1] if len(sys.argv) > 1 else None
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://smoke",
        timeout=120.0,
    ) as client:
        await stream(client, "/api/chat/syllabus", "情報基礎という科目について教えて")
        if code:
            await stream(client, f"/api/chat/syllabus/{code}", "この講義の到達目標を1文で教えて")
        else:
            print("\n(講義コード未指定のため /chat/syllabus/{code} はスキップ)")


if __name__ == "__main__":
    asyncio.run(main())
