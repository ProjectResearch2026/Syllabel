from fastapi import FastAPI

from app.api.chat_proposal import router as chat_proposal_router
from app.api.chat_syllabus import router as chat_syllabus_router
from app.api.syllabus import router as syllabus_router

app = FastAPI()

app.include_router(syllabus_router)
app.include_router(chat_syllabus_router)
app.include_router(chat_proposal_router)

@app.get("/healthz")
def healthz():
    return {"status": "ok"}