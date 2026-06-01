import uuid
import os
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.config import settings
from app.services.kaggle_service import (
    get_bundled_datasets, load_bundled_dataset,
    search_kaggle_datasets, load_csv_as_schema_context
)

router = APIRouter(prefix="/datasets", tags=["datasets"])


@router.get("/bundled")
def list_bundled():
    return get_bundled_datasets()


@router.get("/bundled/{name}")
def get_bundled(name: str):
    ds = load_bundled_dataset(name)
    if not ds:
        raise HTTPException(status_code=404, detail=f"Bundled dataset '{name}' not found")
    return ds


@router.get("/kaggle/search")
async def search_kaggle(
    q: str = Query(...),
    profile_id: str = Query(...),
    db: Session = Depends(get_db),
):
    from app.db.models import LLMSettings
    llm_settings = db.query(LLMSettings).filter(LLMSettings.profile_id == profile_id).first()
    if not llm_settings or not llm_settings.kaggle_username or not llm_settings.kaggle_key:
        raise HTTPException(status_code=400, detail="Kaggle credentials not configured. Add them in Settings.")

    results = await search_kaggle_datasets(q, llm_settings.kaggle_username, llm_settings.kaggle_key)
    return results


@router.post("/upload")
async def upload_csv(
    file: UploadFile = File(...),
    table_name: Optional[str] = Query(None),
):
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    safe_name = table_name or Path(file.filename).stem.replace("-", "_").replace(" ", "_").lower()
    safe_filename = Path(file.filename).name  # strip any directory components
    save_path = settings.DATASETS_DIR / f"{uuid.uuid4()}_{safe_filename}"
    settings.DATASETS_DIR.mkdir(parents=True, exist_ok=True)

    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)

    try:
        schema_context = load_csv_as_schema_context(str(save_path), table_name=safe_name)
        return {
            "filename": file.filename,
            "table_name": safe_name,
            "schema_sql": schema_context["schema_sql"],
            "sample_data_sql": schema_context["sample_data_sql"],
            "columns": schema_context.get("columns", []),
            "row_count": schema_context.get("row_count", 0),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse CSV: {e}")
    finally:
        if os.path.exists(save_path):
            os.remove(save_path)
