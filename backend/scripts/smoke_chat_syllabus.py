"""実 vLLM + api-clean 相手のシラバスチャット疎通スモーク。
   使い方: python -m scripts.smoke_chat_syllabus [講義コード]
   起動中の backend に HTTP で問い合わせる(既定 http://localhost:8000)。
   compose なら docker compose exec backend python -m scripts.smoke_chat_syllabus <講義コード>。
   向き先は SMOKE_BASE_URL、無通信の打ち切り秒数は SMOKE_READ_TIMEOUT で変えられる。

   httpx.ASGITransport は使わない。応答を最後まで溜めてから返すため本文が
   逐次見えず、かつ timeout が一切効かない(生成が詰まると止められない)。"""
import asyncio
import contextlib
import json
import os
import sys
import time

import httpx

BASE_URL = os.environ.get("SMOKE_BASE_URL", "http://localhost:8000")
# トークン間の無通信がこれを超えたら打ち切る。
# 全体チャットはツール呼び出しのループを回すため、モデル呼び出しが複数回入る。
# その間は思考もツール呼び出しもクライアントに流れず無通信になる。実測で
# 1回の呼び出しに100秒超かかることがあり、300秒では足りなかった。
READ_TIMEOUT = float(os.environ.get("SMOKE_READ_TIMEOUT", "900"))
# 本文が始まるまでの待ち時間を知らせる間隔
HEARTBEAT = 30.0
RULE = "-" * 60


def _payload(line: str) -> dict | None:
    """SSE の1行から data のペイロードを取り出す。イベント区切りの空行等は None。"""
    if not line.startswith("data: "):
        return None
    return json.loads(line.removeprefix("data: "))


async def _wait_notice(started: float, state: dict) -> None:
    """本文が始まるまで待機時間を知らせる。

    思考(ThinkingPart)はクライアントに流れないため、モデルが考えている間は
    何も届かない。無言で待たされると停止と区別がつかないので経過を出す。
    """
    while not state["started"]:
        await asyncio.sleep(HEARTBEAT)
        if state["started"]:
            return
        print(f"… 待機 {time.monotonic() - started:.0f}秒", flush=True)


async def stream(client: httpx.AsyncClient, path: str, message: str) -> None:
    """SSE を受け、本文を組み立てて表示する。

    delta は1〜数文字ずつ届くため、イベントを1行ずつ出すと本文が読めない。
    回答の妥当性(design.md §7.4.1)を目視で確かめるのがこのスモークの用途なので、
    繋いだ本文を出す。フレーミングが壊れていないことは末尾の件数と done で見る。
    """
    print(f"\n=== POST {BASE_URL}{path} ===")
    print(f"質問: {message}")
    started = time.monotonic()
    state = {"started": False}
    notice = asyncio.create_task(_wait_notice(started, state))
    deltas = 0
    done = False
    try:
        async with client.stream(
            "POST", path, json={"message": message, "history": []}
        ) as resp:
            print("status:", resp.status_code, resp.headers.get("content-type"))
            if resp.status_code != 200:
                # SSE ではなくエラー応答。本文を読まないと原因が分からない
                await resp.aread()
                print("body:", resp.text)
                return

            print(RULE)
            async for line in resp.aiter_lines():
                payload = _payload(line)
                if payload is None:
                    continue
                if "delta" in payload:
                    state["started"] = True
                    deltas += 1
                    print(payload["delta"], end="", flush=True)
                elif "error" in payload:
                    state["started"] = True
                    print(f"\n[error] {payload['error']}")
                elif payload.get("done"):
                    done = True
    except httpx.ConnectError:
        print(f"[接続失敗] {BASE_URL} に繋がらない。backend が起動しているか確認する")
        return
    except httpx.ReadTimeout:
        print(f"\n[打ち切り] {READ_TIMEOUT:.0f}秒 応答が届かなかった")
    finally:
        notice.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await notice

    print(f"\n{RULE}")
    print(
        f"delta {deltas}件 / done {'あり' if done else 'なし'}"
        f" / {time.monotonic() - started:.1f}秒"
    )


async def main() -> None:
    code = sys.argv[1] if len(sys.argv) > 1 else None
    timeout = httpx.Timeout(READ_TIMEOUT, connect=5.0)
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=timeout) as client:
        await stream(client, "/api/chat/syllabus", "情報基礎という科目について教えて")
        if code:
            await stream(client, f"/api/chat/syllabus/{code}", "この講義の到達目標を1文で教えて")
        else:
            print("\n(講義コード未指定のため /chat/syllabus/{code} はスキップ)")


if __name__ == "__main__":
    asyncio.run(main())
