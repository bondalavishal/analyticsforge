import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.core.config import settings
from app.core.database import init_db
from app.routers import profiles, problems, submissions, analytics, llm, settings as settings_router, datasets, export
from app.services.notification_service import start_scheduler, stop_scheduler, schedule_daily_check

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
logger = logging.getLogger(__name__)

STATIC_DIR = Path(__file__).parent.parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    init_db()
    start_scheduler()
    # Schedule streak reminders for all profiles that have notifications enabled
    from app.core.database import SessionLocal
    from app.db.models import AppSettings as AppSettingsModel, GenerationJob as GenerationJobModel
    from datetime import datetime
    db = SessionLocal()
    try:
        for app_s in db.query(AppSettingsModel).filter(AppSettingsModel.streak_reminder_enabled == True).all():
            schedule_daily_check(app_s.notification_time, app_s.profile_id)

        # Clean up any stuck generation jobs
        stuck_count = db.query(GenerationJobModel).filter(
            GenerationJobModel.status.in_(["queued", "running"])
        ).update(
            {
                "status": "failed",
                "progress_message": "Generation failed",
                "error_message": "Server restarted while generation was in progress",
                "finished_at": datetime.utcnow()
            },
            synchronize_session=False
        )
        if stuck_count > 0:
            logger.info("Marked %d stuck generation jobs as failed", stuck_count)
            db.commit()
    finally:
        db.close()
    yield
    # Shutdown
    stop_scheduler()
    logger.info("AnalyticsForge shutting down")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="AI-powered SQL & Python analytics practice platform",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routers
API_PREFIX = "/api/v1"
app.include_router(profiles.router, prefix=API_PREFIX)
app.include_router(problems.router, prefix=API_PREFIX)
app.include_router(submissions.router, prefix=API_PREFIX)
app.include_router(analytics.router, prefix=API_PREFIX)
app.include_router(llm.router, prefix=API_PREFIX)
app.include_router(settings_router.router, prefix=API_PREFIX)
app.include_router(datasets.router, prefix=API_PREFIX)
app.include_router(export.router, prefix=API_PREFIX)


@app.get("/api/health")
def health():
    return {"status": "ok", "app": settings.APP_NAME, "version": settings.APP_VERSION}


# Serve React frontend (if built)
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        index = STATIC_DIR / "index.html"
        if index.exists():
            return FileResponse(str(index))
        return {"message": "Frontend not built yet. Run: cd frontend && npm run build"}
else:
    @app.get("/")
    def root():
        return {
            "message": "AnalyticsForge API is running",
            "docs": "/api/docs",
            "note": "Build the frontend: cd frontend && npm install && npm run build",
        }
