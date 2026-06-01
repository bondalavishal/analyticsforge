from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=settings.DEBUG,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _migrate_schema():
    """Lightweight SQLite migrations for columns added after initial release."""
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    if "problems" not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns("problems")}
    migrations = []
    if "language" not in existing:
        migrations.append("ALTER TABLE problems ADD COLUMN language VARCHAR(10) DEFAULT 'sql'")
    if "function_name" not in existing:
        migrations.append("ALTER TABLE problems ADD COLUMN function_name VARCHAR(100) DEFAULT ''")
    if "starter_code" not in existing:
        migrations.append("ALTER TABLE problems ADD COLUMN starter_code TEXT DEFAULT ''")

    if not migrations:
        return

    with engine.begin() as conn:
        for stmt in migrations:
            conn.execute(text(stmt))


def init_db():
    from app.db import models  # noqa: F401 - ensures models are registered
    Base.metadata.create_all(bind=engine)
    _migrate_schema()
