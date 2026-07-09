"""実 api-clean への疎通スモーク。使い方: python -m scripts.smoke_api_clean
   API_CLEAN_BASE_URL で接続先上書き可(既定は http://api-clean:5000)。"""
import asyncio
import json

from app.agents.tools import get_masters, get_syllabus, search_syllabi


async def main() -> None:
    print("=== GET /masters ===")
    masters = await get_masters()
    print(json.dumps(masters, ensure_ascii=False)[:400])

    print("\n=== GET /syllabi?limit=3 ===")
    syllabi = await search_syllabi(limit=3)
    print(json.dumps(syllabi, ensure_ascii=False)[:400])

    # レスポンスが list か {items: [...]} 形式か未確定なので防御的に処理する
    items: list = []
    if isinstance(syllabi, list):
        items = syllabi
    elif isinstance(syllabi, dict):
        for key in ("items", "results", "data", "syllabi"):
            if isinstance(syllabi.get(key), list):
                items = syllabi[key]
                break

    if not items:
        print("(検索結果が空、または未知の形式のため get_syllabus をスキップ)")
        return

    first = items[0]
    # コードのキー名が未確定なので候補を順に試す
    code: str | None = None
    for key in ("code", "syllabus_code", "id", "course_code"):
        if key in first:
            code = str(first[key])
            break

    if code is None:
        print(f"コードキーが不明。先頭要素のキー一覧: {list(first.keys())}")
        return

    print(f"\n=== GET /syllabi/{code} ===")
    detail = await get_syllabus(code)
    print(json.dumps(detail, ensure_ascii=False)[:400])


if __name__ == "__main__":
    asyncio.run(main())
