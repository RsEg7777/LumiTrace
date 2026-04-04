"""
Database setup and session management.
"""
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import get_settings

settings = get_settings()

SQLITE_RELATIVE_PREFIX = "sqlite:///./"


def resolve_database_url(database_url: str) -> str:
    if database_url.startswith(SQLITE_RELATIVE_PREFIX):
        db_relative_path = database_url[len(SQLITE_RELATIVE_PREFIX):]
        backend_root = Path(__file__).resolve().parents[1]
        resolved_path = (backend_root / db_relative_path).resolve()
        return f"sqlite:///{resolved_path.as_posix()}"

    return database_url


DATABASE_URL = resolve_database_url(settings.DATABASE_URL)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
