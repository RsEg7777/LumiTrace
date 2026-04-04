"""Pydantic schemas for LumiTrace API."""
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RenderSettings(BaseModel):
    samples: int = Field(default=64, ge=16, le=512)
    max_bounces: int = Field(default=4, ge=1, le=16)
    use_denoising: bool = True
    use_neural: bool = False
    exposure: float = Field(default=1.0, ge=0.1, le=3.0)


class ProcessResponse(BaseModel):
    job_id: str
    status: str
    message: str


class JobBase(BaseModel):
    job_id: str
    status: Literal["pending", "processing", "completed", "failed"]
    created_at: datetime


class JobResponse(JobBase):
    progress: int = Field(default=0, ge=0, le=100)
    error: Optional[str] = None
    output_url: Optional[str] = None
    media_type: Optional[str] = None
    input_filename: Optional[str] = None
    completed_at: Optional[datetime] = None


class JobSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    status: str
    progress: int
    media_type: str
    input_filename: Optional[str] = None
    samples: int
    max_bounces: int
    use_denoising: bool
    use_neural: bool
    exposure: float
    error: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    display_name: str
    is_active: bool
    created_at: datetime


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=2, max_length=120)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class GoogleLoginRequest(BaseModel):
    id_token: str = Field(min_length=20, max_length=6000)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class ModelInfo(BaseModel):
    name: str
    description: str
    version: str
    device: str


class QueueStatus(BaseModel):
    queued_jobs: int
    active_jobs: int
    completed_jobs: int
    failed_jobs: int