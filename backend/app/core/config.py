from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings
from pydantic import Field

BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    APP_NAME: str = "AnalyticsForge"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = f"sqlite:///{BASE_DIR}/queryforge.db"
    DUCKDB_PATH: str = ":memory:"

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000", "http://localhost:8000"]

    # Paths
    DATA_DIR: Path = BASE_DIR / "data"
    EXPORTS_DIR: Path = BASE_DIR / "data" / "exports"
    DATASETS_DIR: Path = BASE_DIR / "data" / "datasets"
    BUNDLED_DATASETS_DIR: Path = BASE_DIR / "data" / "bundled_datasets"

    # LLM API Keys (empty by default, set via settings UI)
    CEREBRAS_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    GOOGLE_AI_API_KEY: str = ""
    OPENROUTER_API_KEY: str = ""

    # Kaggle
    KAGGLE_USERNAME: str = ""
    KAGGLE_KEY: str = ""

    # Local LLM
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    LMSTUDIO_BASE_URL: str = "http://localhost:1234"

    # LLM Fallback Order
    LLM_FALLBACK_ORDER: List[str] = ["cerebras", "groq", "google", "openrouter", "lmstudio", "ollama"]

    # Notifications
    NOTIFICATION_TIME: str = "09:00"
    STREAK_REMINDER_ENABLED: bool = True

    # Security
    SECRET_KEY: str = "queryforge-secret-key-change-in-production"

    class Config:
        env_file = str(BASE_DIR / ".env")
        env_file_encoding = "utf-8"
        case_sensitive = True
        extra = "ignore"


settings = Settings()

# Ensure directories exist
for d in [settings.DATA_DIR, settings.EXPORTS_DIR, settings.DATASETS_DIR, settings.BUNDLED_DATASETS_DIR]:
    d.mkdir(parents=True, exist_ok=True)
