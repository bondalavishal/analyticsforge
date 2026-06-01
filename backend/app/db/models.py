import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Boolean, DateTime, Date,
    ForeignKey, Text, Float, JSON
)
from sqlalchemy.orm import relationship
from app.core.database import Base


def gen_uuid():
    return str(uuid.uuid4())


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(String, primary_key=True, default=gen_uuid)
    username = Column(String(50), unique=True, nullable=False, index=True)
    avatar_color = Column(String(7), default="#FFA116")
    created_at = Column(DateTime, default=datetime.utcnow)
    last_active = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=False)

    # Relationships
    llm_settings = relationship("LLMSettings", back_populates="profile", uselist=False, cascade="all, delete-orphan")
    app_settings = relationship("AppSettings", back_populates="profile", uselist=False, cascade="all, delete-orphan")
    streak = relationship("Streak", back_populates="profile", uselist=False, cascade="all, delete-orphan")
    problem_states = relationship("UserProblemState", back_populates="profile", cascade="all, delete-orphan")
    submissions = relationship("Submission", back_populates="profile", cascade="all, delete-orphan")
    generation_jobs = relationship("GenerationJob", back_populates="profile", cascade="all, delete-orphan")


class Problem(Base):
    __tablename__ = "problems"

    id = Column(String, primary_key=True, default=gen_uuid)
    problem_number = Column(Integer, nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    language = Column(String(10), default="sql", nullable=False, index=True)  # sql / python
    difficulty = Column(String(10), nullable=False)  # easy / medium / hard
    dialect = Column(String(20), default="mysql")     # mysql / postgresql / sqlite
    function_name = Column(String(100), default="")   # Python: entry function name
    starter_code = Column(Text, default="")           # Python: editor starter template
    topic_tags = Column(JSON, default=list)           # ["JOIN", "CTE", ...]
    schema_sql = Column(Text, nullable=False)
    sample_data_sql = Column(Text, nullable=False)
    expected_output = Column(JSON, nullable=False)    # {columns: [], rows: [[]]}
    hidden_test_cases = Column(JSON, default=list)    # [{schema_sql, data_sql, expected_output}]
    hints = Column(JSON, default=list)                # ["hint1", "hint2", "hint3"]
    editorial = Column(JSON, default=list)            # [{approach_name, explanation, solution_sql, time_complexity, space_complexity}]
    dataset_source = Column(String(20), default="llm")  # kaggle / bundled / uploaded / llm
    dataset_name = Column(String(200), default="")
    is_flagged = Column(Boolean, default=False)
    flag_reason = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_profile_id = Column(String, ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    user_states = relationship("UserProblemState", back_populates="problem", cascade="all, delete-orphan")
    submissions = relationship("Submission", back_populates="problem", cascade="all, delete-orphan")


class UserProblemState(Base):
    __tablename__ = "user_problem_states"

    id = Column(String, primary_key=True, default=gen_uuid)
    profile_id = Column(String, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    problem_id = Column(String, ForeignKey("problems.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(20), default="unsolved")   # unsolved / attempted / solved
    is_bookmarked = Column(Boolean, default=False)
    user_difficulty_rating = Column(String(10), nullable=True)
    personal_notes = Column(Text, default="")
    time_spent_seconds = Column(Integer, default=0)
    attempt_count = Column(Integer, default=0)
    last_attempted_at = Column(DateTime, nullable=True)
    solved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    profile = relationship("Profile", back_populates="problem_states")
    problem = relationship("Problem", back_populates="user_states")


class Submission(Base):
    __tablename__ = "submissions"

    id = Column(String, primary_key=True, default=gen_uuid)
    profile_id = Column(String, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    problem_id = Column(String, ForeignKey("problems.id", ondelete="CASCADE"), nullable=False)
    submitted_sql = Column(Text, nullable=False)
    status = Column(String(20), nullable=False)       # accepted / wrong_answer / error
    execution_time_ms = Column(Float, default=0)
    test_cases_passed = Column(Integer, default=0)
    test_cases_total = Column(Integer, default=0)
    error_message = Column(Text, default="")
    wrong_answer_explanation = Column(Text, default="")
    submitted_at = Column(DateTime, default=datetime.utcnow)
    dialect_used = Column(String(20), default="mysql")

    profile = relationship("Profile", back_populates="submissions")
    problem = relationship("Problem", back_populates="submissions")


class LLMSettings(Base):
    __tablename__ = "llm_settings"

    id = Column(String, primary_key=True, default=gen_uuid)
    profile_id = Column(String, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, unique=True)
    cerebras_api_key = Column(Text, default="")
    groq_api_key = Column(Text, default="")
    google_ai_api_key = Column(Text, default="")
    openrouter_api_key = Column(Text, default="")
    kaggle_username = Column(String(100), default="")
    kaggle_key = Column(Text, default="")
    ollama_base_url = Column(String(200), default="http://localhost:11434")
    lmstudio_base_url = Column(String(200), default="http://localhost:1234")
    fallback_order = Column(JSON, default=lambda: ["cerebras", "groq", "google", "openrouter", "lmstudio", "ollama"])
    active_local_model_ollama = Column(String(100), default="")
    active_local_model_lmstudio = Column(String(100), default="")
    preferred_provider = Column(String(50), default="cerebras")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    profile = relationship("Profile", back_populates="llm_settings")


class AppSettings(Base):
    __tablename__ = "app_settings"

    id = Column(String, primary_key=True, default=gen_uuid)
    profile_id = Column(String, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, unique=True)
    theme = Column(String(10), default="dark")
    dialect = Column(String(20), default="mysql")
    notification_time = Column(String(5), default="09:00")
    streak_reminder_enabled = Column(Boolean, default=True)
    potd_enabled = Column(Boolean, default=False)
    batch_generate_count = Column(Integer, default=5)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    profile = relationship("Profile", back_populates="app_settings")


class Streak(Base):
    __tablename__ = "streaks"

    id = Column(String, primary_key=True, default=gen_uuid)
    profile_id = Column(String, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, unique=True)
    current_streak = Column(Integer, default=0)
    longest_streak = Column(Integer, default=0)
    last_activity_date = Column(Date, nullable=True)
    total_days_active = Column(Integer, default=0)

    profile = relationship("Profile", back_populates="streak")


class GenerationJob(Base):
    __tablename__ = "generation_jobs"

    id = Column(String, primary_key=True, default=gen_uuid)
    profile_id = Column(String, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    job_type = Column(String(20), nullable=False)  # single / batch / adaptive
    status = Column(String(20), nullable=False, default="queued")  # queued / running / succeeded / failed
    progress_percent = Column(Integer, default=0)
    progress_message = Column(String(255), default="Queued")
    requested_count = Column(Integer, default=1)
    completed_count = Column(Integer, default=0)
    failed_count = Column(Integer, default=0)
    params_json = Column(JSON, default=dict)
    generated_problem_ids = Column(JSON, default=list)
    errors = Column(JSON, default=list)
    telemetry = Column(JSON, default=list)
    error_message = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)

    profile = relationship("Profile", back_populates="generation_jobs")
