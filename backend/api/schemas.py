"""
Pydantic Schemas for API
"""
from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime

class JobBase(BaseModel):
    job_id: str
    status: Literal["pending", "processing", "completed", "failed"]
    created_at: datetime
    
class JobResponse(JobBase):
    progress: Optional[int] = None
    error_message: Optional[str] = None
    output_url: Optional[str] = None
    
    class Config:
        from_attributes = True

class RenderSettings(BaseModel):
    samples: int = 64
    max_bounces: int = 4
    use_denoising: bool = True
    use_neural: bool = False
    exposure: float = 1.0
    
class ModelInfo(BaseModel):
    name: str
    description: str
    version: str
    device: str