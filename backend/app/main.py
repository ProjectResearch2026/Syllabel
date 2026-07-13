from fastapi import FastAPI

from app.api.syllabus import router as syllabus_router

app = FastAPI()

app.include_router(syllabus_router)


@app.get("/healthz")
def healthz():
    return {"status": "ok"}