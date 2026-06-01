from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.analytics_service import get_dashboard, analyze_weaknesses, get_leaderboard

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/dashboard")
def dashboard(
    profile_id: str = Query(...),
    period: str = Query("all"),
    language: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return get_dashboard(profile_id=profile_id, db=db, period=period, language=language)


@router.get("/leaderboard")
def leaderboard(language: Optional[str] = Query(None), db: Session = Depends(get_db)):
    return get_leaderboard(db=db, language=language)


@router.get("/weaknesses")
def weaknesses(
    profile_id: str = Query(...),
    language: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    narrative = analyze_weaknesses(profile_id=profile_id, db=db, language=language)
    return {"analysis": narrative}
