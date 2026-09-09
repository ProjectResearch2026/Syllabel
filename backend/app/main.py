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

@app.get("/healthz")
def healthz():
    return {"status": "ok"}
