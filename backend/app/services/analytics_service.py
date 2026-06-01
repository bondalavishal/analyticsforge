from datetime import datetime, date, timedelta
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.models import Profile, Problem, UserProblemState, Submission, Streak


def _get_period_filter(period: str):
    now = datetime.utcnow()
    if period == "daily":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "weekly":
        start = now - timedelta(days=now.weekday())
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "monthly":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        return None
    return start


def _problem_ids_for_language(db: Session, language: Optional[str]) -> Optional[set]:
    if not language:
        return None
    rows = db.query(Problem.id).filter(
        Problem.language == language.lower(),
    ).all()
    return {r[0] for r in rows}


def get_dashboard(profile_id: str, db: Session, period: str = "all", language: Optional[str] = None) -> Dict[str, Any]:
    period_start = _get_period_filter(period)
    language_ids = _problem_ids_for_language(db, language)

    # Base queries
    states_q = db.query(UserProblemState).filter(UserProblemState.profile_id == profile_id)
    submissions_q = db.query(Submission).filter(Submission.profile_id == profile_id)

    if period_start:
        states_q = states_q.filter(UserProblemState.last_attempted_at >= period_start)
        submissions_q = submissions_q.filter(Submission.submitted_at >= period_start)

    all_states = states_q.all()
    all_submissions = submissions_q.all()

    if language_ids is not None:
        all_states = [s for s in all_states if s.problem_id in language_ids]
        all_submissions = [s for s in all_submissions if s.problem_id in language_ids]

    # Batch-load all referenced problems to avoid N+1 queries
    problem_ids = {s.problem_id for s in all_states} | {s.problem_id for s in all_submissions}
    problems_map: Dict[str, Problem] = {}
    if problem_ids:
        problems_map = {
            p.id: p for p in db.query(Problem).filter(Problem.id.in_(problem_ids)).all()
        }

    # Problems by difficulty
    solved_by_difficulty = {"easy": 0, "medium": 0, "hard": 0}
    attempted_by_difficulty = {"easy": 0, "medium": 0, "hard": 0}

    for state in all_states:
        problem = problems_map.get(state.problem_id)
        if not problem:
            continue
        diff = (problem.difficulty or "").lower().strip()
        if diff not in ("easy", "medium", "hard"):
            diff = "medium"
        if state.status == "solved":
            solved_by_difficulty[diff] += 1
        if state.status in ("solved", "attempted"):
            attempted_by_difficulty[diff] += 1

    total_solved = sum(1 for s in all_states if s.status == "solved")
    total_attempted = sum(1 for s in all_states if s.status in ("solved", "attempted"))
    total_submissions = len(all_submissions)
    accepted_submissions = sum(1 for s in all_submissions if s.status == "accepted")
    acceptance_rate = round(accepted_submissions / total_submissions * 100, 1) if total_submissions > 0 else 0.0

    # Avg time to solve
    solved_times = [s.time_spent_seconds for s in all_states if s.status == "solved" and s.time_spent_seconds > 0]
    avg_time_to_solve = round(sum(solved_times) / len(solved_times) / 60, 1) if solved_times else 0.0

    # Topic analytics
    topic_stats: Dict[str, Dict] = {}
    for sub in all_submissions:
        problem = problems_map.get(sub.problem_id)
        if not problem:
            continue
        for tag in (problem.topic_tags or []):
            if tag not in topic_stats:
                topic_stats[tag] = {"attempts": 0, "correct": 0}
            topic_stats[tag]["attempts"] += 1
            if sub.status == "accepted":
                topic_stats[tag]["correct"] += 1

    weak_topics = []
    strong_topics = []
    for tag, stats in topic_stats.items():
        if stats["attempts"] == 0:
            continue
        failure_rate = round((1 - stats["correct"] / stats["attempts"]) * 100, 1)
        success_rate = round(stats["correct"] / stats["attempts"] * 100, 1)
        entry = {
            "topic": tag,
            "attempts": stats["attempts"],
            "correct": stats["correct"],
            "rate": failure_rate,
        }
        if failure_rate >= 40:
            weak_topics.append(entry)
        strong_topics_entry = {**entry, "rate": success_rate}
        if success_rate >= 60:
            strong_topics.append(strong_topics_entry)

    weak_topics.sort(key=lambda x: x["rate"], reverse=True)
    strong_topics.sort(key=lambda x: x["rate"], reverse=True)

    # Submission heatmap (past 365 days)
    today = date.today()
    heatmap = {}
    for sub in db.query(Submission).filter(Submission.profile_id == profile_id).all():
        if language_ids is not None and sub.problem_id not in language_ids:
            continue
        d = sub.submitted_at.date().isoformat()
        heatmap[d] = heatmap.get(d, 0) + 1

    # Weekly improvement
    weekly_data = {}
    for state in db.query(UserProblemState).filter(
        UserProblemState.profile_id == profile_id,
        UserProblemState.status == "solved",
        UserProblemState.solved_at.isnot(None),
    ).all():
        if language_ids is not None and state.problem_id not in language_ids:
            continue
        week = state.solved_at.isocalendar()
        key = f"{week[0]}-W{week[1]:02d}"
        weekly_data[key] = weekly_data.get(key, 0) + 1

    improvement_over_time = [{"week": k, "solved": v} for k, v in sorted(weekly_data.items())]

    # Accuracy by topic
    accuracy_by_topic = {}
    for tag, stats in topic_stats.items():
        if stats["attempts"] > 0:
            accuracy_by_topic[tag] = round(stats["correct"] / stats["attempts"] * 100, 1)

    # Streak info
    streak = db.query(Streak).filter(Streak.profile_id == profile_id).first()
    streak_info = {
        "current_streak": streak.current_streak if streak else 0,
        "longest_streak": streak.longest_streak if streak else 0,
        "last_activity_date": streak.last_activity_date.isoformat() if streak and streak.last_activity_date else None,
        "total_days_active": streak.total_days_active if streak else 0,
    }

    return {
        "total_solved": total_solved,
        "total_attempted": total_attempted,
        "total_submissions": total_submissions,
        "acceptance_rate": acceptance_rate,
        "avg_time_to_solve_minutes": avg_time_to_solve,
        "problems_by_difficulty": solved_by_difficulty,
        "attempted_by_difficulty": attempted_by_difficulty,
        "accuracy_by_topic": accuracy_by_topic,
        "weak_topics": weak_topics[:10],
        "strong_topics": strong_topics[:10],
        "submission_heatmap": heatmap,
        "improvement_over_time": improvement_over_time[-12:],
        "streak_info": streak_info,
    }


def analyze_weaknesses(profile_id: str, db: Session, language: Optional[str] = None) -> str:
    dashboard = get_dashboard(profile_id, db, period="all", language=language)
    weak = dashboard["weak_topics"]

    lang_label = (language or "all languages").upper()
    if not weak:
        return f"The user has no significant {lang_label} weaknesses yet — they are a beginner or have solved very few problems."

    lines = [f"User weakness analysis for adaptive {lang_label} problem generation:"]
    for w in weak[:5]:
        lines.append(f"- {w['topic']}: {w['rate']}% failure rate ({w['attempts']} attempts, {w['correct']} correct)")

    lines.append(f"\nOverall acceptance rate: {dashboard['acceptance_rate']}%")
    lines.append(f"Total problems solved: {dashboard['total_solved']}")

    diff = dashboard["problems_by_difficulty"]
    lines.append(f"Solved by difficulty — Easy: {diff['easy']}, Medium: {diff['medium']}, Hard: {diff['hard']}")

    return "\n".join(lines)


def update_streak(profile_id: str, db: Session):
    today = date.today()
    streak = db.query(Streak).filter(Streak.profile_id == profile_id).first()

    if not streak:
        streak = Streak(profile_id=profile_id, current_streak=1, longest_streak=1,
                        last_activity_date=today, total_days_active=1)
        db.add(streak)
    else:
        if streak.last_activity_date == today:
            return  # Already counted today
        elif streak.last_activity_date == today - timedelta(days=1):
            streak.current_streak += 1
            streak.total_days_active += 1
        else:
            streak.current_streak = 1
            streak.total_days_active += 1

        streak.last_activity_date = today
        streak.longest_streak = max(streak.longest_streak, streak.current_streak)

    db.commit()


def get_leaderboard(db: Session, language: Optional[str] = None) -> List[Dict]:
    profiles = db.query(Profile).all()
    if not profiles:
        return []

    profile_ids = [p.id for p in profiles]

    language_problem_ids = None
    if language:
        language_problem_ids = {
            row[0] for row in db.query(Problem.id).filter(Problem.language == language.lower()).all()
        }

    solved_q = (
        db.query(UserProblemState.profile_id, func.count().label("cnt"))
        .filter(
            UserProblemState.profile_id.in_(profile_ids),
            UserProblemState.status == "solved",
        )
    )
    if language_problem_ids is not None:
        solved_q = solved_q.filter(UserProblemState.problem_id.in_(language_problem_ids))
    solved_rows = solved_q.group_by(UserProblemState.profile_id).all()
    solved_map = {r.profile_id: r.cnt for r in solved_rows}

    total_sub_q = (
        db.query(Submission.profile_id, func.count().label("cnt"))
        .filter(Submission.profile_id.in_(profile_ids))
    )
    if language_problem_ids is not None:
        total_sub_q = total_sub_q.filter(Submission.problem_id.in_(language_problem_ids))
    total_sub_rows = total_sub_q.group_by(Submission.profile_id).all()
    total_sub_map = {r.profile_id: r.cnt for r in total_sub_rows}

    accepted_sub_q = (
        db.query(Submission.profile_id, func.count().label("cnt"))
        .filter(Submission.profile_id.in_(profile_ids), Submission.status == "accepted")
    )
    if language_problem_ids is not None:
        accepted_sub_q = accepted_sub_q.filter(Submission.problem_id.in_(language_problem_ids))
    accepted_sub_rows = accepted_sub_q.group_by(Submission.profile_id).all()
    accepted_sub_map = {r.profile_id: r.cnt for r in accepted_sub_rows}

    # Batch-load streaks
    streaks = db.query(Streak).filter(Streak.profile_id.in_(profile_ids)).all()
    streak_map = {s.profile_id: s for s in streaks}

    board = []
    for profile in profiles:
        total = total_sub_map.get(profile.id, 0)
        accepted = accepted_sub_map.get(profile.id, 0)
        accuracy = round(accepted / total * 100, 1) if total > 0 else 0.0
        streak = streak_map.get(profile.id)
        board.append({
            "profile_id": profile.id,
            "username": profile.username,
            "avatar_color": profile.avatar_color,
            "problems_solved": solved_map.get(profile.id, 0),
            "current_streak": streak.current_streak if streak else 0,
            "accuracy_rate": accuracy,
            "last_active": profile.last_active.isoformat() if profile.last_active else None,
        })

    board.sort(key=lambda x: (x["problems_solved"], x["current_streak"]), reverse=True)
    for i, entry in enumerate(board):
        entry["rank"] = i + 1

    return board
