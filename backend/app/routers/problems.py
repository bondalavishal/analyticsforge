import uuid
import asyncio
import logging
from decimal import Decimal
from datetime import datetime
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db, SessionLocal
from app.db.models import Problem, UserProblemState, Profile, Submission, GenerationJob

router = APIRouter(prefix="/problems", tags=["problems"])
logger = logging.getLogger(__name__)

# One in-flight generation pipeline per profile to avoid duplicate concurrent LLM runs.
_generation_locks: Dict[str, asyncio.Lock] = {}
_generation_locks_guard = asyncio.Lock()
_generation_tasks: Dict[str, asyncio.Task] = {}


async def _get_generation_lock(profile_id: str) -> asyncio.Lock:
    async with _generation_locks_guard:
        lock = _generation_locks.get(profile_id)
        if lock is None:
            lock = asyncio.Lock()
            _generation_locks[profile_id] = lock
        return lock


# ── Schemas ─────────────────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    profile_id: str
    language: str = "sql"  # sql / python
    topic: Optional[str] = None
    difficulty: Optional[str] = None
    dialect: str = "mysql"
    dataset_source: str = "llm"   # llm / bundled / kaggle / uploaded
    dataset_name: Optional[str] = None
    pinned_constraints: Optional[str] = None
    count: int = 1  # for batch


class AdaptiveGenerateRequest(BaseModel):
    profile_id: str
    language: str = "sql"
    topic: str = "auto"
    difficulty: str = "auto"
    dialect: str = "mysql"
    natural_language_request: Optional[str] = None
    local_only: bool = False


class GenerationJobResponse(BaseModel):
    id: str
    profile_id: str
    job_type: str
    status: str
    progress_percent: int
    progress_message: str
    requested_count: int
    completed_count: int
    failed_count: int
    generated_problem_ids: List[str]
    errors: List[str]
    error_message: str
    telemetry_events: int
    telemetry: List[Dict[str, Any]]
    created_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class FlagRequest(BaseModel):
    profile_id: str
    reason: str


class BookmarkRequest(BaseModel):
    profile_id: str


class RateRequest(BaseModel):
    profile_id: str
    difficulty: str  # easy / medium / hard

    def model_post_init(self, __context: object) -> None:
        if self.difficulty not in ("easy", "medium", "hard"):
            raise ValueError(f"difficulty must be easy, medium, or hard — got '{self.difficulty}'")


class NotesRequest(BaseModel):
    profile_id: str
    notes: str


class ProblemResponse(BaseModel):
    id: str
    problem_number: int
    title: str
    description: str
    language: str
    difficulty: str
    dialect: str
    function_name: str
    starter_code: str
    topic_tags: List[str]
    schema_sql: str
    sample_data_sql: str
    expected_output: Dict
    hints: List[str]
    editorial: List[Dict]
    dataset_source: str
    dataset_name: str
    is_flagged: bool
    created_at: datetime
    # User state (populated when profile_id provided)
    user_status: Optional[str] = None
    is_bookmarked: Optional[bool] = None
    user_difficulty_rating: Optional[str] = None

    class Config:
        from_attributes = True


def _get_active_profile(db: Session) -> Optional[Profile]:
    return db.query(Profile).filter(Profile.is_active == True).first()


def _enrich_with_user_state(problem: Problem, profile_id: str, db: Session) -> Dict:
    state = db.query(UserProblemState).filter(
        UserProblemState.profile_id == profile_id,
        UserProblemState.problem_id == problem.id,
    ).first()
    data = {
        "id": problem.id,
        "problem_number": problem.problem_number,
        "title": problem.title,
        "description": problem.description,
        "language": getattr(problem, "language", None) or "sql",
        "difficulty": problem.difficulty,
        "dialect": problem.dialect,
        "function_name": getattr(problem, "function_name", None) or "",
        "starter_code": getattr(problem, "starter_code", None) or "",
        "topic_tags": problem.topic_tags or [],
        "schema_sql": problem.schema_sql,
        "sample_data_sql": problem.sample_data_sql,
        "expected_output": problem.expected_output or {},
        "hints": problem.hints or [],
        "editorial": problem.editorial or [],
        "dataset_source": problem.dataset_source,
        "dataset_name": problem.dataset_name,
        "is_flagged": problem.is_flagged,
        "created_at": problem.created_at,
        "user_status": state.status if state else "unsolved",
        "is_bookmarked": state.is_bookmarked if state else False,
        "user_difficulty_rating": state.user_difficulty_rating if state else None,
        "personal_notes": state.personal_notes if state else "",
    }
    return data


def _get_next_problem_number(profile_id: str, db: Session, language: str = "sql") -> int:
    last = db.query(Problem).filter(
        Problem.created_by_profile_id == profile_id,
        Problem.language == language,
    ).order_by(Problem.problem_number.desc()).first()
    return (last.problem_number + 1) if last else 1


def _json_safe(value: Any) -> Any:
    if isinstance(value, Decimal):
        if value.is_nan() or value.is_infinite():
            return str(value)
        try:
            return int(value) if value == value.to_integral_value() else float(value)
        except Exception:
            return float(value)
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    if isinstance(value, tuple):
        return [_json_safe(v) for v in value]
    if isinstance(value, set):
        return [_json_safe(v) for v in value]
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _rollback_safely(db: Session) -> None:
    try:
        db.rollback()
    except Exception:
        logger.exception("Failed to rollback DB session")


def _save_problem_dict(problem_dict: Dict, profile_id: str, db: Session) -> Problem:
    language = (problem_dict.get("language") or "sql").lower()
    number = _get_next_problem_number(profile_id, db, language=language)
    safe_problem = _json_safe(problem_dict)
    problem = Problem(
        id=str(uuid.uuid4()),
        problem_number=number,
        title=safe_problem.get("title", "Untitled"),
        description=safe_problem.get("description", ""),
        language=language,
        difficulty=safe_problem.get("difficulty", "medium"),
        dialect=safe_problem.get("dialect", "mysql"),
        function_name=safe_problem.get("function_name", ""),
        starter_code=safe_problem.get("starter_code", ""),
        topic_tags=safe_problem.get("topic_tags", []),
        schema_sql=safe_problem.get("schema_sql", ""),
        sample_data_sql=safe_problem.get("sample_data_sql", ""),
        expected_output=safe_problem.get("expected_output", {}),
        hidden_test_cases=safe_problem.get("hidden_test_cases", []),
        hints=safe_problem.get("hints", []),
        editorial=safe_problem.get("editorial", []),
        dataset_source=safe_problem.get("dataset_source", "llm"),
        dataset_name=safe_problem.get("dataset_name", ""),
        created_by_profile_id=profile_id,
    )
    db.add(problem)
    db.commit()
    db.refresh(problem)
    return problem


def _serialize_job(job: GenerationJob) -> Dict[str, Any]:
    telemetry = job.telemetry or []
    return {
        "id": job.id,
        "profile_id": job.profile_id,
        "job_type": job.job_type,
        "status": job.status,
        "progress_percent": job.progress_percent or 0,
        "progress_message": job.progress_message or "",
        "requested_count": job.requested_count or 0,
        "completed_count": job.completed_count or 0,
        "failed_count": job.failed_count or 0,
        "generated_problem_ids": job.generated_problem_ids or [],
        "errors": job.errors or [],
        "error_message": job.error_message or "",
        "telemetry_events": len(telemetry),
        "telemetry": telemetry[-100:],
        "created_at": job.created_at,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
    }


def _create_generation_job(
    db: Session,
    profile_id: str,
    job_type: str,
    requested_count: int,
    payload: Dict[str, Any],
) -> GenerationJob:
    job = GenerationJob(
        id=str(uuid.uuid4()),
        profile_id=profile_id,
        job_type=job_type,
        status="queued",
        progress_percent=0,
        progress_message="Queued",
        requested_count=requested_count,
        completed_count=0,
        failed_count=0,
        params_json=payload,
        generated_problem_ids=[],
        errors=[],
        telemetry=[],
        error_message="",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def _update_job_state(
    db: Session,
    job: GenerationJob,
    *,
    status: Optional[str] = None,
    progress_percent: Optional[int] = None,
    progress_message: Optional[str] = None,
    completed_count: Optional[int] = None,
    failed_count: Optional[int] = None,
    generated_problem_ids: Optional[List[str]] = None,
    errors: Optional[List[str]] = None,
    telemetry: Optional[List[Dict[str, Any]]] = None,
    error_message: Optional[str] = None,
    started_at: Optional[datetime] = None,
    finished_at: Optional[datetime] = None,
) -> None:
    if status is not None:
        job.status = status
    if progress_percent is not None:
        job.progress_percent = max(0, min(100, int(progress_percent)))
    if progress_message is not None:
        job.progress_message = progress_message[:255]
    if completed_count is not None:
        job.completed_count = max(0, int(completed_count))
    if failed_count is not None:
        job.failed_count = max(0, int(failed_count))
    if generated_problem_ids is not None:
        job.generated_problem_ids = generated_problem_ids
    if errors is not None:
        job.errors = errors
    if telemetry is not None:
        job.telemetry = telemetry
    if error_message is not None:
        job.error_message = error_message
    if started_at is not None:
        job.started_at = started_at
    if finished_at is not None:
        job.finished_at = finished_at
    try:
        db.commit()
    except Exception:
        _rollback_safely(db)
        raise


def _finalize_job_failed(job_id: str, *, message: str, error_message: str, telemetry: Optional[List[Dict[str, Any]]] = None) -> None:
    fallback_db = SessionLocal()
    try:
        job = fallback_db.query(GenerationJob).filter(GenerationJob.id == job_id).first()
        if not job:
            return
        job.status = "failed"
        job.progress_percent = 100
        job.progress_message = message[:255]
        if telemetry is not None:
            job.telemetry = telemetry
        job.error_message = error_message
        job.finished_at = datetime.utcnow()
        fallback_db.commit()
    except Exception:
        _rollback_safely(fallback_db)
        logger.exception("Failed to finalize generation job %s as failed", job_id)
    finally:
        fallback_db.close()


async def _run_generation_job(job_id: str) -> None:
    from app.services import problem_generator, kaggle_service, analytics_service
    from app.llm.fallback_chain import AllProvidersFailedError

    telemetry: List[Dict[str, Any]] = []
    db = SessionLocal()
    try:
        job = db.query(GenerationJob).filter(GenerationJob.id == job_id).first()
        if not job:
            logger.warning("Generation job %s disappeared before execution", job_id)
            return

        params = job.params_json or {}
        profile_id = params.get("profile_id")
        if not profile_id:
            _update_job_state(
                db,
                job,
                status="failed",
                progress_percent=100,
                progress_message="Failed",
                error_message="Missing profile_id in generation job payload",
                finished_at=datetime.utcnow(),
            )
            return

        lock = await _get_generation_lock(profile_id)
        _update_job_state(db, job, status="queued", progress_message="Waiting for generation slot")

        async with lock:
            # Refresh in-case another process updated this row.
            job = db.query(GenerationJob).filter(GenerationJob.id == job_id).first()
            if not job:
                return

            _update_job_state(
                db,
                job,
                status="running",
                progress_percent=5,
                progress_message="Starting generation",
                started_at=datetime.utcnow(),
            )

            generated_ids: List[str] = []
            errors: List[str] = []
            requested_count = max(1, int(job.requested_count or 1))

            if job.job_type in ("single", "batch"):
                language = (params.get("language") or "sql").lower()
                dataset_context = "LLM-invented schema with realistic data"
                dataset_source = params.get("dataset_source", "llm")
                dataset_name = params.get("dataset_name")
                if language == "sql" and dataset_source == "bundled" and dataset_name:
                    ds = kaggle_service.load_bundled_dataset(dataset_name)
                    if ds:
                        dataset_context = f"Dataset: {ds['description']}\nSchema:\n{ds['schema_sql']}"

                for i in range(requested_count):
                    _update_job_state(
                        db,
                        job,
                        progress_percent=10 + int((i / requested_count) * 80),
                        progress_message=f"Generating {language.upper()} problem {i + 1}/{requested_count}",
                        telemetry=telemetry,
                    )
                    try:
                        if language == "python":
                            from app.services import python_problem_generator
                            problem_dict = await python_problem_generator.generate_python_problem(
                                profile_id=profile_id,
                                db=db,
                                topic=params.get("topic"),
                                difficulty=params.get("difficulty"),
                                pinned_constraints=params.get("pinned_constraints") or "None",
                                telemetry=telemetry,
                            )
                        else:
                            problem_dict = await problem_generator.generate_problem(
                                profile_id=profile_id,
                                db=db,
                                topic=params.get("topic"),
                                difficulty=params.get("difficulty"),
                                dialect=params.get("dialect", "mysql"),
                                dataset_context=dataset_context,
                                pinned_constraints=params.get("pinned_constraints") or "None",
                                telemetry=telemetry,
                            )
                            problem_dict["dataset_source"] = dataset_source
                            problem_dict["dataset_name"] = dataset_name or ""
                        problem = _save_problem_dict(problem_dict, profile_id, db)
                        generated_ids.append(problem.id)
                        _update_job_state(
                            db,
                            job,
                            completed_count=len(generated_ids),
                            failed_count=len(errors),
                            generated_problem_ids=generated_ids,
                            errors=errors,
                            telemetry=telemetry,
                        )
                    except Exception as e:
                        _rollback_safely(db)
                        errors.append(f"Problem {i + 1}: {str(e)}")
                        try:
                            job = db.query(GenerationJob).filter(GenerationJob.id == job_id).first() or job
                            if job:
                                _update_job_state(
                                    db,
                                    job,
                                    failed_count=len(errors),
                                    errors=errors,
                                    telemetry=telemetry,
                                )
                        except Exception:
                            _rollback_safely(db)
                            logger.exception("Failed to update progress after generation error for job %s", job_id)

            elif job.job_type == "adaptive":
                language = (params.get("language") or "sql").lower()
                _update_job_state(
                    db,
                    job,
                    progress_percent=20,
                    progress_message="Analyzing weak areas",
                    telemetry=telemetry,
                )
                weakness_analysis = analytics_service.analyze_weaknesses(profile_id, db, language=language)
                natural_request = params.get("natural_language_request")
                if natural_request:
                    weakness_analysis = f"User request: {natural_request}\n\n{weakness_analysis}"

                _update_job_state(
                    db,
                    job,
                    progress_percent=45,
                    progress_message=f"Generating adaptive {language.upper()} problem",
                    telemetry=telemetry,
                )
                if language == "python":
                    from app.services import python_problem_generator
                    problem_dict = await python_problem_generator.generate_adaptive_python_problem(
                        profile_id=profile_id,
                        db=db,
                        weakness_analysis=weakness_analysis,
                        topic=params.get("topic", "auto"),
                        difficulty=params.get("difficulty", "auto"),
                        local_only=bool(params.get("local_only", False)),
                        telemetry=telemetry,
                    )
                else:
                    problem_dict = await problem_generator.generate_adaptive_problem(
                        profile_id=profile_id,
                        db=db,
                        weakness_analysis=weakness_analysis,
                        topic=params.get("topic", "auto"),
                        difficulty=params.get("difficulty", "auto"),
                        dialect=params.get("dialect", "mysql"),
                        local_only=bool(params.get("local_only", False)),
                        telemetry=telemetry,
                    )
                problem = _save_problem_dict(problem_dict, profile_id, db)
                generated_ids.append(problem.id)
                _update_job_state(
                    db,
                    job,
                    completed_count=1,
                    generated_problem_ids=generated_ids,
                    telemetry=telemetry,
                )
            else:
                raise ValueError(f"Unsupported generation job type: {job.job_type}")

            succeeded = len(generated_ids) > 0
            final_status = "succeeded" if succeeded else "failed"
            final_message = (
                "Generation complete"
                if succeeded else "Generation failed"
            )
            _update_job_state(
                db,
                job,
                status=final_status,
                progress_percent=100,
                progress_message=final_message,
                completed_count=len(generated_ids),
                failed_count=len(errors),
                generated_problem_ids=generated_ids,
                errors=errors,
                telemetry=telemetry,
                error_message="" if succeeded else "; ".join(errors)[:5000],
                finished_at=datetime.utcnow(),
            )
            logger.info(
                "Generation job %s finished with status=%s completed=%s failed=%s telemetry_events=%s",
                job_id,
                final_status,
                len(generated_ids),
                len(errors),
                len(telemetry),
            )
    except AllProvidersFailedError as e:
        _rollback_safely(db)
        try:
            job = db.query(GenerationJob).filter(GenerationJob.id == job_id).first()
            if job:
                _update_job_state(
                    db,
                    job,
                    status="failed",
                    progress_percent=100,
                    progress_message="No LLM provider available",
                    telemetry=telemetry,
                    error_message=str(e),
                    finished_at=datetime.utcnow(),
                )
        except Exception:
            _rollback_safely(db)
            logger.exception("Failed to persist AllProvidersFailedError state for job %s", job_id)
            _finalize_job_failed(
                job_id,
                message="No LLM provider available",
                error_message=str(e),
                telemetry=telemetry,
            )
    except Exception as e:
        logger.exception("Generation job %s failed", job_id)
        _rollback_safely(db)
        try:
            job = db.query(GenerationJob).filter(GenerationJob.id == job_id).first()
            if job:
                _update_job_state(
                    db,
                    job,
                    status="failed",
                    progress_percent=100,
                    progress_message="Generation failed",
                    telemetry=telemetry,
                    error_message=str(e),
                    finished_at=datetime.utcnow(),
                )
        except Exception:
            _rollback_safely(db)
            logger.exception("Failed to persist generic failure state for job %s", job_id)
            _finalize_job_failed(
                job_id,
                message="Generation failed",
                error_message=str(e),
                telemetry=telemetry,
            )
    finally:
        db.close()


# ── Routes ──────────────────────────────────────────────────────────────────

@router.get("")
def list_problems(
    profile_id: Optional[str] = Query(None),
    language: Optional[str] = Query(None),
    difficulty: Optional[str] = Query(None),
    topic: Optional[str] = Query(None),
    dialect: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    bookmarked: Optional[bool] = Query(None),
    sort_by: str = Query("number"),
    db: Session = Depends(get_db),
):
    # Only show problems created by this profile (isolated problem banks)
    q = db.query(Problem)
    if profile_id:
        q = q.filter(Problem.created_by_profile_id == profile_id)

    if language:
        q = q.filter(Problem.language == language.lower())
    if difficulty:
        q = q.filter(Problem.difficulty == difficulty.lower())
    if dialect:
        q = q.filter(Problem.dialect == dialect.lower())
    if search:
        q = q.filter(
            Problem.title.ilike(f"%{search}%") |
            Problem.description.ilike(f"%{search}%")
        )

    order_col = {
        "title": Problem.title,
        "difficulty": Problem.difficulty,
        "created": Problem.created_at.desc(),
    }.get(sort_by, Problem.problem_number)
    problems = q.order_by(order_col).all()

    results = []
    for p in problems:
        enriched = _enrich_with_user_state(p, profile_id, db) if profile_id else {"id": p.id, "title": p.title}

        if topic and topic not in (enriched.get("topic_tags") or []):
            continue
        if status and enriched.get("user_status") != status:
            continue
        if bookmarked is not None and enriched.get("is_bookmarked") != bookmarked:
            continue

        results.append(enriched)

    return results


def _schedule_generation_job(job_id: str) -> None:
    task = asyncio.create_task(_run_generation_job(job_id))
    _generation_tasks[job_id] = task

    def _cleanup(_task: asyncio.Task) -> None:
        _generation_tasks.pop(job_id, None)

    task.add_done_callback(_cleanup)


@router.post("/generation-jobs/single", response_model=GenerationJobResponse)
async def create_single_generation_job(body: GenerateRequest, db: Session = Depends(get_db)):
    payload = body.model_dump()
    payload["count"] = 1
    job = _create_generation_job(
        db=db,
        profile_id=body.profile_id,
        job_type="single",
        requested_count=1,
        payload=payload,
    )
    _schedule_generation_job(job.id)
    return _serialize_job(job)


@router.post("/generation-jobs/batch", response_model=GenerationJobResponse)
async def create_batch_generation_job(body: GenerateRequest, db: Session = Depends(get_db)):
    count = max(1, min(body.count, 50))
    payload = body.model_dump()
    payload["count"] = count
    job = _create_generation_job(
        db=db,
        profile_id=body.profile_id,
        job_type="batch",
        requested_count=count,
        payload=payload,
    )
    _schedule_generation_job(job.id)
    return _serialize_job(job)


@router.post("/generation-jobs/adaptive", response_model=GenerationJobResponse)
async def create_adaptive_generation_job(body: AdaptiveGenerateRequest, db: Session = Depends(get_db)):
    payload = body.model_dump()
    job = _create_generation_job(
        db=db,
        profile_id=body.profile_id,
        job_type="adaptive",
        requested_count=1,
        payload=payload,
    )
    _schedule_generation_job(job.id)
    return _serialize_job(job)


@router.get("/generation-jobs/{job_id}", response_model=GenerationJobResponse)
def get_generation_job_status(job_id: str, profile_id: Optional[str] = Query(None), db: Session = Depends(get_db)):
    job = db.query(GenerationJob).filter(GenerationJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Generation job not found")
    if profile_id and job.profile_id != profile_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return _serialize_job(job)


@router.get("/{problem_id}")
def get_problem(problem_id: str, profile_id: Optional[str] = Query(None), db: Session = Depends(get_db)):
    problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")
    if profile_id:
        return _enrich_with_user_state(problem, profile_id, db)
    return problem


@router.post("/generate")
async def generate_problem_route(body: GenerateRequest, db: Session = Depends(get_db)):
    from app.services import problem_generator, kaggle_service
    from app.llm.fallback_chain import AllProvidersFailedError

    lock = await _get_generation_lock(body.profile_id)
    if lock.locked():
        logger.info("Rejected duplicate single generation for profile %s", body.profile_id)
        raise HTTPException(
            status_code=409,
            detail="Problem generation is already in progress for this profile. Please wait for it to finish.",
        )

    async with lock:
        language = (body.language or "sql").lower()
        if language == "python":
            try:
                from app.services import python_problem_generator
                problem_dict = await python_problem_generator.generate_python_problem(
                    profile_id=body.profile_id,
                    db=db,
                    topic=body.topic,
                    difficulty=body.difficulty,
                    pinned_constraints=body.pinned_constraints or "None",
                )
                problem = _save_problem_dict(problem_dict, body.profile_id, db)
                return _enrich_with_user_state(problem, body.profile_id, db)
            except AllProvidersFailedError as e:
                raise HTTPException(status_code=503, detail=f"No LLM provider is available. Please configure an API key in Settings. ({e})")
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e))

        dataset_context = "LLM-invented schema with realistic data"
        if body.dataset_source == "bundled" and body.dataset_name:
            ds = kaggle_service.load_bundled_dataset(body.dataset_name)
            if ds:
                dataset_context = f"Dataset: {ds['description']}\nSchema:\n{ds['schema_sql']}"

        try:
            problem_dict = await problem_generator.generate_problem(
                profile_id=body.profile_id,
                db=db,
                topic=body.topic,
                difficulty=body.difficulty,
                dialect=body.dialect,
                dataset_context=dataset_context,
                pinned_constraints=body.pinned_constraints or "None",
            )
            problem_dict["dataset_source"] = body.dataset_source
            problem_dict["dataset_name"] = body.dataset_name or ""
            problem = _save_problem_dict(problem_dict, body.profile_id, db)
            return _enrich_with_user_state(problem, body.profile_id, db)
        except AllProvidersFailedError as e:
            raise HTTPException(status_code=503, detail=f"No LLM provider is available. Please configure an API key in Settings. ({e})")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate/batch")
async def generate_batch(body: GenerateRequest, db: Session = Depends(get_db)):
    from app.services import problem_generator, kaggle_service

    lock = await _get_generation_lock(body.profile_id)
    if lock.locked():
        logger.info("Rejected duplicate batch generation for profile %s", body.profile_id)
        raise HTTPException(
            status_code=409,
            detail="Problem generation is already in progress for this profile. Please wait for it to finish.",
        )

    async with lock:
        count = max(1, min(body.count, 50))
        saved = []
        errors = []
        language = (body.language or "sql").lower()

        dataset_context = "LLM-invented schema with realistic data"
        if body.dataset_source == "bundled" and body.dataset_name:
            ds = kaggle_service.load_bundled_dataset(body.dataset_name)
            if ds:
                dataset_context = f"Dataset: {ds['description']}\nSchema:\n{ds['schema_sql']}"

        for i in range(count):
            try:
                if language == "python":
                    from app.services import python_problem_generator
                    problem_dict = await python_problem_generator.generate_python_problem(
                        profile_id=body.profile_id,
                        db=db,
                        topic=body.topic,
                        difficulty=body.difficulty,
                        pinned_constraints=body.pinned_constraints or "None",
                    )
                else:
                    problem_dict = await problem_generator.generate_problem(
                        profile_id=body.profile_id,
                        db=db,
                        topic=body.topic,
                        difficulty=body.difficulty,
                        dialect=body.dialect,
                        dataset_context=dataset_context,
                        pinned_constraints=body.pinned_constraints or "None",
                    )
                    problem_dict["dataset_source"] = body.dataset_source
                    problem_dict["dataset_name"] = body.dataset_name or ""
                problem = _save_problem_dict(problem_dict, body.profile_id, db)
                saved.append({"id": problem.id, "title": problem.title})
            except Exception as e:
                errors.append(f"Problem {i+1}: {str(e)}")

        return {"generated": len(saved), "problems": saved, "errors": errors}


@router.post("/generate/adaptive")
async def generate_adaptive(body: AdaptiveGenerateRequest, db: Session = Depends(get_db)):
    from app.services import problem_generator, analytics_service
    from app.llm.fallback_chain import AllProvidersFailedError

    lock = await _get_generation_lock(body.profile_id)
    if lock.locked():
        logger.info("Rejected duplicate adaptive generation for profile %s", body.profile_id)
        raise HTTPException(
            status_code=409,
            detail="Problem generation is already in progress for this profile. Please wait for it to finish.",
        )

    async with lock:
        language = (body.language or "sql").lower()
        weakness_analysis = analytics_service.analyze_weaknesses(body.profile_id, db, language=language)
        if body.natural_language_request:
            weakness_analysis = f"User request: {body.natural_language_request}\n\n{weakness_analysis}"

        try:
            if language == "python":
                from app.services import python_problem_generator
                problem_dict = await python_problem_generator.generate_adaptive_python_problem(
                    profile_id=body.profile_id,
                    db=db,
                    weakness_analysis=weakness_analysis,
                    topic=body.topic,
                    difficulty=body.difficulty,
                    local_only=body.local_only,
                )
            else:
                problem_dict = await problem_generator.generate_adaptive_problem(
                    profile_id=body.profile_id,
                    db=db,
                    weakness_analysis=weakness_analysis,
                    topic=body.topic,
                    difficulty=body.difficulty,
                    dialect=body.dialect,
                    local_only=body.local_only,
                )
            problem = _save_problem_dict(problem_dict, body.profile_id, db)
            return _enrich_with_user_state(problem, body.profile_id, db)
        except AllProvidersFailedError as e:
            raise HTTPException(status_code=503, detail=f"No LLM provider is available. Please configure an API key in Settings. ({e})")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


@router.post("/{problem_id}/qc")
def qc_problem(problem_id: str, db: Session = Depends(get_db)):
    """Run all editorial solutions against all test cases and return a full audit report."""
    from app.services.sql_service import run_test_cases
    from app.services.python_service import build_python_test_cases, run_python_test_cases

    problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")

    editorial = problem.editorial or []
    language = getattr(problem, "language", None) or "sql"

    if language == "python":
        problem_dict = {
            "expected_output": problem.expected_output,
            "hidden_test_cases": problem.hidden_test_cases or [],
        }
        all_tcs = build_python_test_cases(problem_dict)
        approach_results = []
        for approach in editorial:
            code = approach.get("solution_python", "") or approach.get("solution_sql", "")
            if not code.strip():
                continue
            tc_result = run_python_test_cases(code, problem.function_name or "solve", all_tcs)
            approach_results.append({
                "approach_name": approach.get("approach_name", "Unknown"),
                "passed": tc_result["passed"],
                "total": tc_result["total"],
                "all_passed": tc_result["all_passed"],
                "details": [
                    {
                        "description": all_tcs[i].get("description", f"Test case {i + 1}"),
                        **d,
                    }
                    for i, d in enumerate(tc_result["details"])
                ],
            })
        overall_ok = all(a["all_passed"] for a in approach_results) if approach_results else False
        return {
            "problem_id": problem_id,
            "title": problem.title,
            "overall_ok": overall_ok,
            "approaches": approach_results,
        }

    hidden_tcs = problem.hidden_test_cases or []

    visible_tc = {
        "description": "Visible (sample data)",
        "schema_sql": problem.schema_sql,
        "data_sql": problem.sample_data_sql,
        "expected_output": problem.expected_output,
    }
    all_tcs = [visible_tc] + [
        {
            "description": htc.get("description", f"Hidden TC {i + 1}"),
            "schema_sql": problem.schema_sql,
            "data_sql": htc.get("data_sql", problem.sample_data_sql),
            "expected_output": htc.get("expected_output", {}),
        }
        for i, htc in enumerate(hidden_tcs)
    ]

    approach_results = []
    for approach in editorial:
        sql = approach.get("solution_sql", "")
        if not sql.strip():
            continue
        tc_result = run_test_cases(
            user_sql=sql,
            test_cases=all_tcs,
            schema_sql=problem.schema_sql,
            data_sql=problem.sample_data_sql,
            dialect=problem.dialect or "mysql",
        )
        approach_results.append({
            "approach_name": approach.get("approach_name", "Unknown"),
            "passed": tc_result["passed"],
            "total": tc_result["total"],
            "all_passed": tc_result["all_passed"],
            "details": [
                {
                    "description": all_tcs[i]["description"],
                    **d,
                }
                for i, d in enumerate(tc_result["details"])
            ],
        })

    overall_ok = all(a["all_passed"] for a in approach_results)
    return {
        "problem_id": problem_id,
        "title": problem.title,
        "overall_ok": overall_ok,
        "approaches": approach_results,
    }


@router.post("/{problem_id}/flag")
def flag_problem(problem_id: str, body: FlagRequest, db: Session = Depends(get_db)):
    problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")
    problem.is_flagged = True
    problem.flag_reason = body.reason
    db.commit()
    return {"message": "Problem flagged"}


def _get_or_create_state(profile_id: str, problem_id: str, db: Session) -> UserProblemState:
    """Get existing UserProblemState or create one with all defaults initialized."""
    state = db.query(UserProblemState).filter(
        UserProblemState.profile_id == profile_id,
        UserProblemState.problem_id == problem_id,
    ).first()
    if not state:
        state = UserProblemState(
            profile_id=profile_id,
            problem_id=problem_id,
            status="unsolved",
            is_bookmarked=False,
            personal_notes="",
            time_spent_seconds=0,
            attempt_count=0,
        )
        db.add(state)
        db.flush()  # Get the ID without committing
    return state


@router.post("/{problem_id}/bookmark")
def toggle_bookmark(problem_id: str, body: BookmarkRequest, db: Session = Depends(get_db)):
    state = _get_or_create_state(body.profile_id, problem_id, db)
    state.is_bookmarked = not (state.is_bookmarked or False)
    db.commit()
    return {"is_bookmarked": state.is_bookmarked}


@router.put("/{problem_id}/rate")
def rate_problem(problem_id: str, body: RateRequest, db: Session = Depends(get_db)):
    state = _get_or_create_state(body.profile_id, problem_id, db)
    state.user_difficulty_rating = body.difficulty
    db.commit()
    return {"user_difficulty_rating": state.user_difficulty_rating}


@router.post("/{problem_id}/notes")
def save_notes(problem_id: str, body: NotesRequest, db: Session = Depends(get_db)):
    state = _get_or_create_state(body.profile_id, problem_id, db)
    state.personal_notes = body.notes
    db.commit()
    return {"saved": True}
