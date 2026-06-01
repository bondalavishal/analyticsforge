from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.db.models import Problem, UserProblemState, Submission
from app.services.export_service import export_to_markdown, export_to_pdf

router = APIRouter(prefix="/export", tags=["export"])


def _get_problem_dict(problem: Problem) -> dict:
    return {
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
    }


@router.post("/problem/{problem_id}/markdown")
def export_markdown(
    problem_id: str,
    profile_id: Optional[str] = Query(None),
    submission_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")

    submission = None
    if submission_id:
        sub = db.query(Submission).filter(Submission.id == submission_id).first()
        if sub:
            submission = {
                "submitted_sql": sub.submitted_sql,
                "status": sub.status,
                "submitted_at": sub.submitted_at.isoformat(),
            }

    notes = ""
    if profile_id:
        state = db.query(UserProblemState).filter(
            UserProblemState.profile_id == profile_id,
            UserProblemState.problem_id == problem_id,
        ).first()
        if state:
            notes = state.personal_notes or ""

    md = export_to_markdown(_get_problem_dict(problem), submission, notes)
    filename = f"{problem.problem_number}_{problem.title.replace(' ', '_')}.md"

    return Response(
        content=md,
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/problem/{problem_id}/pdf")
def export_pdf(
    problem_id: str,
    profile_id: Optional[str] = Query(None),
    submission_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")

    submission = None
    if submission_id:
        sub = db.query(Submission).filter(Submission.id == submission_id).first()
        if sub:
            submission = {
                "submitted_sql": sub.submitted_sql,
                "status": sub.status,
                "submitted_at": sub.submitted_at.isoformat(),
            }

    notes = ""
    if profile_id:
        state = db.query(UserProblemState).filter(
            UserProblemState.profile_id == profile_id,
            UserProblemState.problem_id == problem_id,
        ).first()
        if state:
            notes = state.personal_notes or ""

    try:
        pdf_bytes = export_to_pdf(_get_problem_dict(problem), submission, notes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {e}")

    filename = f"{problem.problem_number}_{problem.title.replace(' ', '_')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
