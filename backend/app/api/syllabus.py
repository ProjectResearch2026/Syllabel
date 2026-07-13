from fastapi import APIRouter, HTTPException, Query
import httpx

from app.agents.tools import get_masters, get_syllabus, search_syllabi

router = APIRouter(prefix="/api", tags=["syllabus"])


@router.get("/syllabi")
async def api_search_syllabi(
    q: str | None = Query(default=None),
    faculty: str | None = Query(default=None),
    program: str | None = Query(default=None),
    campus: str | None = Query(default=None),
    term: str | None = Query(default=None),
    day: str | None = Query(default=None),
    period: str | None = Query(default=None),
    year: int | None = Query(default=None),
    instructor: str | None = Query(default=None),
    grade: int | None = Query(default=None),
    limit: int | None = Query(default=None),
    offset: int | None = Query(default=None),
):
    try:
        return await search_syllabi(
            q=q, faculty=faculty, program=program, campus=campus,
            term=term, day=day, period=period, year=year,
            instructor=instructor, grade=grade, limit=limit, offset=offset,
        )
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404)
        raise HTTPException(status_code=502, detail="upstream error")


@router.get("/syllabi/{code}")
async def api_get_syllabus(code: str):
    try:
        return await get_syllabus(code)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404)
        raise HTTPException(status_code=502, detail="upstream error")


@router.get("/masters")
async def api_get_masters():
    try:
        return await get_masters()
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404)
        raise HTTPException(status_code=502, detail="upstream error")
