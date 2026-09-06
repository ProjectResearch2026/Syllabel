"""実 vLLM + api-clean 相手のシラバスチャット疎通スモーク。
   使い方: python -m scripts.smoke_chat_syllabus [講義コード]
   VLLM_BASE_URL / API_CLEAN_BASE_URL を env で上書き可(既定は compose 前提)。
   uvicorn 起動中なら curl -N でも同じ確認ができる。"""
import asyncio
import sys

import httpx

from app.main import app


async def stream(client: httpx.AsyncClient, path: str, message: str) -> None:
    print(f"\n=== POST {path} ===")
    async with client.stream("POST", path, json={"message": message, "history": []}) as resp:
        print("status:", resp.status_code, resp.headers.get("content-type"))
        async for line in resp.aiter_lines():
            if line:
                print(line)


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