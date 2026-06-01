from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
import httpx

from app.core.database import get_db
from app.db.models import AppSettings, LLMSettings

router = APIRouter(prefix="/settings", tags=["settings"])


class AppSettingsUpdate(BaseModel):
    theme: Optional[str] = None
    dialect: Optional[str] = None
    notification_time: Optional[str] = None
    streak_reminder_enabled: Optional[bool] = None
    potd_enabled: Optional[bool] = None
    batch_generate_count: Optional[int] = None


class LLMSettingsUpdate(BaseModel):
    cerebras_api_key: Optional[str] = None
    groq_api_key: Optional[str] = None
    google_ai_api_key: Optional[str] = None
    openrouter_api_key: Optional[str] = None
    kaggle_username: Optional[str] = None
    kaggle_key: Optional[str] = None
    ollama_base_url: Optional[str] = None
    lmstudio_base_url: Optional[str] = None
    fallback_order: Optional[List[str]] = None
    active_local_model_ollama: Optional[str] = None
    active_local_model_lmstudio: Optional[str] = None
    preferred_provider: Optional[str] = None


class TestConnectionRequest(BaseModel):
    provider: str
    api_key: Optional[str] = None
    base_url: Optional[str] = None


def _mask_key(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "***"
    return key[:4] + "***" + key[-4:]


@router.get("")
def get_app_settings(profile_id: str = Query(...), db: Session = Depends(get_db)):
    settings = db.query(AppSettings).filter(AppSettings.profile_id == profile_id).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Settings not found")
    return settings


@router.put("")
def update_app_settings(
    profile_id: str = Query(...),
    body: AppSettingsUpdate = ...,
    db: Session = Depends(get_db),
):
    settings = db.query(AppSettings).filter(AppSettings.profile_id == profile_id).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Settings not found")

    changed = body.model_dump(exclude_none=True)
    for field, value in changed.items():
        setattr(settings, field, value)
    settings.updated_at = datetime.utcnow()
    db.commit()

    # Reschedule streak reminders if notification settings changed
    if "notification_time" in changed or "streak_reminder_enabled" in changed:
        import schedule
        from app.services.notification_service import schedule_daily_check
        schedule.clear()
        for s in db.query(AppSettings).filter(AppSettings.streak_reminder_enabled == True).all():
            schedule_daily_check(s.notification_time, s.profile_id)

    return settings


@router.get("/llm")
def get_llm_settings(profile_id: str = Query(...), db: Session = Depends(get_db)):
    settings = db.query(LLMSettings).filter(LLMSettings.profile_id == profile_id).first()
    if not settings:
        raise HTTPException(status_code=404, detail="LLM settings not found")

    # Mask API keys in response
    return {
        "id": settings.id,
        "profile_id": settings.profile_id,
        "cerebras_api_key": _mask_key(settings.cerebras_api_key),
        "groq_api_key": _mask_key(settings.groq_api_key),
        "google_ai_api_key": _mask_key(settings.google_ai_api_key),
        "openrouter_api_key": _mask_key(settings.openrouter_api_key),
        "kaggle_username": settings.kaggle_username,
        "kaggle_key": _mask_key(settings.kaggle_key),
        "ollama_base_url": settings.ollama_base_url,
        "lmstudio_base_url": settings.lmstudio_base_url,
        "fallback_order": settings.fallback_order,
        "active_local_model_ollama": settings.active_local_model_ollama,
        "active_local_model_lmstudio": settings.active_local_model_lmstudio,
        "preferred_provider": settings.preferred_provider,
    }


@router.put("/llm")
def update_llm_settings(
    profile_id: str = Query(...),
    body: LLMSettingsUpdate = ...,
    db: Session = Depends(get_db),
):
    settings = db.query(LLMSettings).filter(LLMSettings.profile_id == profile_id).first()
    if not settings:
        raise HTTPException(status_code=404, detail="LLM settings not found")

    for field, value in body.model_dump(exclude_none=True).items():
        if isinstance(value, str) and "***" in value:
            continue  # Safety guard: do not overwrite real key with masked string
        setattr(settings, field, value)
    settings.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "LLM settings updated"}


@router.post("/test-connection")
async def test_connection(body: TestConnectionRequest):
    """Test connectivity for a specific LLM provider."""
    provider_name = body.provider.lower()

    try:
        if provider_name == "cerebras":
            from app.llm.providers.cerebras import CerebrasProvider
            p = CerebrasProvider(api_key=body.api_key or "")
        elif provider_name == "groq":
            from app.llm.providers.groq import GroqProvider
            p = GroqProvider(api_key=body.api_key or "")
        elif provider_name == "google":
            from app.llm.providers.google import GoogleProvider
            p = GoogleProvider(api_key=body.api_key or "")
        elif provider_name == "openrouter":
            from app.llm.providers.openrouter import OpenRouterProvider
            p = OpenRouterProvider(api_key=body.api_key or "")
        elif provider_name == "ollama":
            from app.llm.providers.ollama import OllamaProvider
            p = OllamaProvider(base_url=body.base_url or "http://localhost:11434")
        elif provider_name == "lmstudio":
            from app.llm.providers.lmstudio import LMStudioProvider
            p = LMStudioProvider(base_url=body.base_url or "http://localhost:1234", api_token=body.api_key or "")
        else:
            raise HTTPException(status_code=400, detail=f"Unknown provider: {provider_name}")

        available = await p.is_available()
        models = await p.list_models() if available else []
        if not available and provider_name == "lmstudio":
            # Return a helpful LM Studio error (e.g. token required) when possible.
            try:
                async with httpx.AsyncClient(timeout=5) as client:
                    r = await client.get(
                        f"{(body.base_url or 'http://localhost:1234').rstrip('/')}/v1/models",
                        headers={"Authorization": f"Bearer {body.api_key}"} if body.api_key else {},
                    )
                    if r.status_code != 200:
                        if r.headers.get("content-type", "").startswith("application/json"):
                            msg = r.json().get("error", {}).get("message")
                        else:
                            msg = r.text
                        return {"available": False, "models": [], "error": msg or f"HTTP {r.status_code}"}
            except Exception:
                pass
        return {"available": available, "models": models[:10]}

    except HTTPException:
        raise
    except Exception as e:
        return {"available": False, "error": str(e)}
