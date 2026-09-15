import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.chat_syllabus import router as chat_syllabus_router
from app.api.curricula import router as curricula_router
from app.api.proposal import router as proposal_router
from app.api.syllabus import router as syllabus_router
from app.curricula.loader import get_curricula


# uvicorn は自分の logger にしかハンドラを付けないため、root に付けてアプリ側の
# ログ(履修要項のロード件数、シラバスコード未解決の警告。design.md §4.4.3)を出す
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s:     %(name)s - %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 履修要項データは起動時に1度だけ読み、以降はメモリ上のものを参照する(design.md §4.4.3)。
    # 転記ミスを早期に検出するため、不正なデータは例外を送出して起動を中止させる
    get_curricula()
    yield


app = FastAPI(lifespan=lifespan)

app.include_router(syllabus_router)
app.include_router(chat_syllabus_router)
app.include_router(curricula_router)
app.include_router(proposal_router)

# 公開経路から backend へ届くのは `/pr-2026/api/*` だけで、gateway が `/pr-2026`
# を剥がすため `/api/healthz` として到達する(§3.2.1、§3.5.1)。`/healthz` は
# コンテナ内やネットワーク内から直に叩く用に残す。
@app.get("/healthz")
@app.get("/api/healthz")
def healthz():
    return {"status": "ok"}
