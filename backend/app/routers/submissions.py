import uuid
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.db.models import Problem, Submission, UserProblemState
from app.services.sql_service import execute_sql, run_test_cases
from app.services.python_service import build_python_test_cases, execute_python_function, run_python_test_cases

router = APIRouter(prefix="/submissions", tags=["submissions"])


class RunRequest(BaseModel):
    profile_id: str
    problem_id: str
    sql: str
    dialect: str = "mysql"


class SubmitRequest(BaseModel):
    profile_id: str
    problem_id: str
    sql: str
    dialect: str = "mysql"
    time_spent_seconds: int = 0


def _problem_language(problem: Problem) -> str:
    return getattr(problem, "language", None) or "sql"


@router.post("/run")
def run_code(body: RunRequest, db: Session = Depends(get_db)):
    """Execute code without submitting — for the Run button."""
    problem = db.query(Problem).filter(Problem.id == body.problem_id).first()
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")

    if _problem_language(problem) == "python":
        expected = problem.expected_output or {}
        inputs = expected.get("inputs") or {}
        result = execute_python_function(body.sql, problem.function_name or "solve", inputs)
        return {
            "success": result["success"],
            "output": result.get("output"),
            "columns": [],
            "rows": [],
            "row_count": 0,
            "execution_time_ms": result.get("execution_time_ms", 0),
            "error": result.get("error"),
        }

    result = execute_sql(
        sql=body.sql,
        dialect=body.dialect,
        schema_sql=problem.schema_sql,
        data_sql=problem.sample_data_sql,
    )
    return result


@router.post("")
def submit_solution(body: SubmitRequest, db: Session = Depends(get_db)):
    """Submit answer, run all test cases, save result."""
    problem = db.query(Problem).filter(Problem.id == body.problem_id).first()
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")

    language = _problem_language(problem)

    if language == "python":
        problem_dict = {
            "expected_output": problem.expected_output,
            "hidden_test_cases": problem.hidden_test_cases or [],
        }
        all_test_cases = build_python_test_cases(problem_dict)
        tc_result = run_python_test_cases(
            body.sql,
            problem.function_name or "solve",
            all_test_cases,
        )
    else:
        visible_tc = [{
            "schema_sql": problem.schema_sql,
            "data_sql": problem.sample_data_sql,
            "expected_output": problem.expected_output,
        }]
        hidden_tcs = []
        for htc in (problem.hidden_test_cases or []):
            hidden_tcs.append({
                "schema_sql": problem.schema_sql,
                "data_sql": htc.get("data_sql", problem.sample_data_sql),
                "expected_output": htc.get("expected_output", {}),
            })
        all_test_cases = visible_tc + hidden_tcs

        tc_result = run_test_cases(
            user_sql=body.sql,
            test_cases=all_test_cases,
            schema_sql=problem.schema_sql,
            data_sql=problem.sample_data_sql,
            dialect=body.dialect,
        )

    passed = tc_result["passed"]
    total = tc_result["total"]
    all_passed = tc_result["all_passed"]

    details = tc_result["details"]
    exec_time = round(sum(d.get("execution_time_ms", 0.0) for d in details) / len(details), 2) if details else 0.0

    error_msg = ""
    for d in details:
        if d.get("error"):
            error_msg = d["error"]
            break

    has_error = any(d.get("error") for d in details)
    # Product rule: a submission is accepted as soon as it passes any test case.
    status = "accepted" if passed > 0 else ("error" if has_error else "wrong_answer")

    submission = Submission(
        id=str(uuid.uuid4()),
        profile_id=body.profile_id,
        problem_id=body.problem_id,
        submitted_sql=body.sql,
        status=status,
        execution_time_ms=exec_time,
        test_cases_passed=passed,
        test_cases_total=total,
        error_message=error_msg[:2000] if error_msg else "",
        dialect_used=body.dialect if language == "sql" else "python",
    )
    db.add(submission)

    state = db.query(UserProblemState).filter(
        UserProblemState.profile_id == body.profile_id,
        UserProblemState.problem_id == body.problem_id,
    ).first()

    if not state:
        state = UserProblemState(
            profile_id=body.profile_id,
            problem_id=body.problem_id,
        )
        db.add(state)

    state.attempt_count = (state.attempt_count or 0) + 1
    state.last_attempted_at = datetime.utcnow()
    state.time_spent_seconds = (state.time_spent_seconds or 0) + body.time_spent_seconds

    if passed > 0:
        state.status = "solved"
        if not state.solved_at:
            state.solved_at = datetime.utcnow()
        from app.services.analytics_service import update_streak
        update_streak(body.profile_id, db)
    elif state.status != "solved":
        state.status = "attempted"

    db.commit()

    return {
        "submission_id": submission.id,
        "status": status,
        "test_cases_passed": passed,
        "test_cases_total": total,
        "all_passed": all_passed,
        "execution_time_ms": exec_time,
        "error_message": error_msg,
        "test_case_details": tc_result["details"],
        "language": language,
    }


@router.get("")
def list_submissions(
    problem_id: Optional[str] = Query(None),
    profile_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    limit: int = Query(20),
):
    q = db.query(Submission)
    if problem_id:
        q = q.filter(Submission.problem_id == problem_id)
    if profile_id:
        q = q.filter(Submission.profile_id == profile_id)
    submissions = q.order_by(Submission.submitted_at.desc()).limit(limit).all()
    return submissions


@router.post("/{submission_id}/explanation")
async def get_explanation(submission_id: str, db: Session = Depends(get_db)):
    """Get LLM explanation for a wrong answer."""
    sub = db.query(Submission).filter(Submission.id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    if sub.status == "accepted":
        return {"explanation": "Your answer was correct — no explanation needed! 🎉"}

    if sub.wrong_answer_explanation:
        return {"explanation": sub.wrong_answer_explanation}

    problem = db.query(Problem).filter(Problem.id == sub.problem_id).first()
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")

    from app.services.problem_generator import generate_wrong_answer_explanation

    language = _problem_language(problem)

    if language == "python":
        from app.services.python_service import execute_python_function
        expected = problem.expected_output or {}
        inputs = expected.get("inputs") or {}
        actual_result = execute_python_function(sub.submitted_sql, problem.function_name or "solve", inputs)
        actual_output = {"value": actual_result.get("output")}
        expected_output = {"value": expected.get("expected")}
        schema_sql = f"def {problem.function_name}(...):\n{problem.starter_code or ''}"
        user_code = sub.submitted_sql
    else:
        from app.services.sql_service import execute_sql as run_sql
        actual_result = run_sql(sub.submitted_sql, sub.dialect_used, problem.schema_sql, problem.sample_data_sql)
        actual_output = {"columns": actual_result["columns"], "rows": actual_result["rows"]}
        expected_output = problem.expected_output
        schema_sql = problem.schema_sql
        user_code = sub.submitted_sql

    explanation = await generate_wrong_answer_explanation(
        profile_id=sub.profile_id,
        db=db,
        problem_description=problem.description,
        schema_sql=schema_sql,
        user_sql=user_code,
        expected_output=expected_output,
        actual_output=actual_output,
        dialect=sub.dialect_used if language == "sql" else "python",
    )

    sub.wrong_answer_explanation = explanation
    db.commit()

    return {"explanation": explanation}
