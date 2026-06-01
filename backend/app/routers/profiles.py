from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.db.models import Profile, LLMSettings, AppSettings, Streak, Submission, UserProblemState

router = APIRouter(prefix="/profiles", tags=["profiles"])


class ProfileCreate(BaseModel):
    username: str
    avatar_color: str = "#FFA116"


class ProfileResponse(BaseModel):
    id: str
    username: str
    avatar_color: str
    created_at: datetime
    last_active: datetime
    is_active: bool

    class Config:
        from_attributes = True


def _init_profile_defaults(profile: Profile, db: Session):
    """Create default LLM settings, app settings, and streak for a new profile."""
    llm_s = LLMSettings(profile_id=profile.id)
    app_s = AppSettings(profile_id=profile.id)
    streak = Streak(profile_id=profile.id)
    db.add(llm_s)
    db.add(app_s)
    db.add(streak)
    db.commit()


@router.get("", response_model=List[ProfileResponse])
def list_profiles(db: Session = Depends(get_db)):
    return db.query(Profile).order_by(Profile.created_at).all()


@router.post("", response_model=ProfileResponse, status_code=201)
def create_profile(body: ProfileCreate, db: Session = Depends(get_db)):
    existing = db.query(Profile).filter(Profile.username == body.username).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Username '{body.username}' already taken")

    is_first = db.query(Profile).count() == 0
    profile = Profile(
        username=body.username,
        avatar_color=body.avatar_color,
        is_active=is_first,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    _init_profile_defaults(profile, db)
    return profile


@router.get("/{profile_id}", response_model=ProfileResponse)
def get_profile(profile_id: str, db: Session = Depends(get_db)):
    profile = db.query(Profile).filter(Profile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.put("/{profile_id}/activate", response_model=ProfileResponse)
def activate_profile(profile_id: str, db: Session = Depends(get_db)):
    profile = db.query(Profile).filter(Profile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    # Deactivate all others
    db.query(Profile).update({"is_active": False})
    profile.is_active = True
    profile.last_active = datetime.utcnow()
    db.commit()
    db.refresh(profile)
    return profile


@router.get("/active/current", response_model=Optional[ProfileResponse])
def get_active_profile(db: Session = Depends(get_db)):
    profile = db.query(Profile).filter(Profile.is_active == True).first()
    return profile


@router.post("/{profile_id}/reset-analytics", status_code=204)
def reset_analytics(profile_id: str, db: Session = Depends(get_db)):
    profile = db.query(Profile).filter(Profile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    db.query(Submission).filter(Submission.profile_id == profile_id).delete()
    db.query(UserProblemState).filter(UserProblemState.profile_id == profile_id).update({
        "status": "unsolved",
        "attempt_count": 0,
        "time_spent_seconds": 0,
        "solved_at": None,
        "last_attempted_at": None,
    })
    db.query(Streak).filter(Streak.profile_id == profile_id).update({
        "current_streak": 0,
        "longest_streak": 0,
        "last_activity_date": None,
        "total_days_active": 0,
    })
    db.commit()


@router.delete("/{profile_id}", status_code=204)
def delete_profile(profile_id: str, db: Session = Depends(get_db)):
    profile = db.query(Profile).filter(Profile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    db.delete(profile)
    db.commit()
    remaining = db.query(Profile).first()
    if remaining and not remaining.is_active:
        remaining.is_active = True
        db.commit()
