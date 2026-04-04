"""
Database models for auth and processing jobs.
"""
from datetime import UTC, datetime
import uuid

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db import Base


def _utcnow_naive() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    google_sub = Column(String(128), unique=True, nullable=True, index=True)
    password_hash = Column(String(255), nullable=False)
    display_name = Column(String(120), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow_naive)

    jobs = relationship("Job", back_populates="user", cascade="all, delete-orphan")


class Job(Base):
    __tablename__ = "jobs"

    id = Column(String(36), primary_key=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)

    status = Column(String(24), nullable=False, default="pending", index=True)
    progress = Column(Integer, nullable=False, default=0)
    media_type = Column(String(16), nullable=False, default="image")

    attempt_count = Column(Integer, nullable=False, default=0)
    max_attempts = Column(Integer, nullable=False, default=3)
    next_attempt_at = Column(DateTime, nullable=True, index=True)
    lease_expires_at = Column(DateTime, nullable=True, index=True)
    heartbeat_at = Column(DateTime, nullable=True)
    claimed_by = Column(String(64), nullable=True, index=True)

    input_filename = Column(String(255), nullable=True)
    input_content_type = Column(String(120), nullable=True)
    output_path = Column(String(1024), nullable=True)
    error = Column(Text, nullable=True)

    samples = Column(Integer, nullable=False, default=64)
    max_bounces = Column(Integer, nullable=False, default=4)
    use_denoising = Column(Boolean, nullable=False, default=True)
    use_neural = Column(Boolean, nullable=False, default=False)
    exposure = Column(Float, nullable=False, default=1.0)

    created_at = Column(DateTime, nullable=False, default=_utcnow_naive)
    updated_at = Column(DateTime, nullable=False, default=_utcnow_naive, onupdate=_utcnow_naive)
    completed_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="jobs")
