from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
import httpx

from app.core.database import get_db
from app.llm.fallback_chain import get_chain_for_profile, AllProvidersFailedError
from app.llm.providers.ollama import OllamaProvider
from app.llm.providers.lmstudio import LMStudioProvider

router = APIRouter(prefix="/llm", tags=["llm"])


class ChatRequest(BaseModel):
    profile_id: str
    message: str
    language: str = "sql"
    include_weakness_context: bool = True


class HintRequest(BaseModel):
    profile_id: str
    hint_index: int = 0  # 0-based


@router.get("/providers")
async def list_providers(profile_id: str = Query(...), db: Session = Depends(get_db)):
    chain = await get_chain_for_profile(profile_id, db)
    return await chain.get_available_providers()


@router.get("/models/ollama")
async def list_ollama_models(base_url: str = Query("http://localhost:11434")):
    provider = OllamaProvider(base_url=base_url)
    available = await provider.is_available()
    if not available:
        return {"available": False, "models": []}
    models = await provider.list_models()
    return {"available": True, "models": models}


@router.get("/models/lmstudio")
async def list_lmstudio_models(
    base_url: str = Query("http://localhost:1234"),
    api_token: str = Query(""),
):
    provider = LMStudioProvider(base_url=base_url, api_token=api_token)
    available = await provider.is_available()
    if not available:
        # Surface a useful reason (e.g., auth required) when available.
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(
                    f"{base_url.rstrip('/')}/v1/models",
                    headers={"Authorization": f"Bearer {api_token}"} if api_token else {},
                )
                if r.status_code != 200:
                    detail = r.json().get("error", {}).get("message") if r.headers.get("content-type", "").startswith("application/json") else r.text
                    return {"available": False, "models": [], "error": detail or f"HTTP {r.status_code}"}
        except Exception:
            pass
        return {"available": False, "models": []}
    models = await provider.list_models()
    return {"available": True, "models": models}


@router.post("/chat")
async def chat(body: ChatRequest, db: Session = Depends(get_db)):
    from app.services.problem_generator import generate_chat_response
    from app.services.analytics_service import analyze_weaknesses

    weakness_context = ""
    if body.include_weakness_context:
        try:
            weakness_context = analyze_weaknesses(body.profile_id, db, language=body.language)
        except Exception:
            pass

    try:
        response = await generate_chat_response(
            profile_id=body.profile_id,
            db=db,
            user_message=body.message,
            weakness_context=weakness_context,
            language=body.language,
        )
        return {"response": response, "weakness_context": weakness_context}
    except AllProvidersFailedError as e:
        raise HTTPException(
            status_code=503,
            detail=(
                f"No local LLM provider is available for AI Assistant. "
                f"Please start/configure LM Studio or Ollama in Settings. ({e})"
            ),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/hints/{problem_id}")
async def get_hint(problem_id: str, body: HintRequest, db: Session = Depends(get_db)):
    from app.db.models import Problem
    problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")

    hints = problem.hints or []
    if not hints:
        raise HTTPException(status_code=404, detail="No hints available for this problem")

    idx = min(body.hint_index, len(hints) - 1)
    return {
        "hint": hints[idx],
        "hint_index": idx,
        "total_hints": len(hints),
        "has_more": idx < len(hints) - 1,
    }
