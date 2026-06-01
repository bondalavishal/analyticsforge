import logging
import threading
from datetime import date, timedelta
from typing import Optional
import schedule
import time

logger = logging.getLogger(__name__)

_scheduler_thread: Optional[threading.Thread] = None
_scheduler_running = False


def _send_notification(title: str, message: str):
    """Send macOS desktop notification via plyer."""
    try:
        from plyer import notification
        notification.notify(
            title=title,
            message=message,
            app_name="AnalyticsForge",
            timeout=10,
        )
    except Exception as e:
        logger.warning(f"Could not send notification: {e}")


def check_and_notify(profile_id: str, db=None):
    """Check if user needs a streak reminder and send if necessary."""
    from app.db.models import Streak, AppSettings
    from app.core.database import SessionLocal

    # Always create our own session — scheduler passes db=None
    with SessionLocal() as session:
        settings = session.query(AppSettings).filter(AppSettings.profile_id == profile_id).first()
        if not settings or not settings.streak_reminder_enabled:
            return

        streak = session.query(Streak).filter(Streak.profile_id == profile_id).first()
        if not streak:
            return

        today = date.today()
        last_active = streak.last_activity_date

        if last_active and last_active < today:
            # User hasn't practiced today
            days_inactive = (today - last_active).days
            if days_inactive == 1:
                msg = f"🔥 You have a {streak.current_streak}-day streak! Keep it going — practice today!"
            else:
                msg = f"Come back to AnalyticsForge! You had a {streak.longest_streak}-day streak. Start a new one!"

            from app.db.models import Profile
            profile = session.query(Profile).filter(Profile.id == profile_id).first()
            name = profile.username if profile else "there"
            _send_notification(f"Hey {name}!", msg)


def _run_scheduled_checks():
    """Background thread that runs the schedule loop."""
    global _scheduler_running
    while _scheduler_running:
        schedule.run_pending()
        time.sleep(30)


def schedule_daily_check(notification_time: str, profile_id: str):
    """Schedule a daily streak check at the given HH:MM time."""
    schedule.every().day.at(notification_time).do(check_and_notify, profile_id=profile_id)


def start_scheduler():
    """Start the background scheduler thread."""
    global _scheduler_thread, _scheduler_running
    if _scheduler_running:
        return
    _scheduler_running = True
    _scheduler_thread = threading.Thread(target=_run_scheduled_checks, daemon=True)
    _scheduler_thread.start()
    logger.info("Notification scheduler started")


def stop_scheduler():
    """Stop the background scheduler thread."""
    global _scheduler_running
    _scheduler_running = False
    schedule.clear()
    logger.info("Notification scheduler stopped")
