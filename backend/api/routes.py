"""Utility routes for system metadata and queue state."""
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from api.schemas import QueueStatus
from app.db import get_db
from app.models import Job

router = APIRouter()


@router.get("/models")
async def list_models():
    return {
        "depth_models": ["dpt_large", "dpt_hybrid", "dpt_swin2", "midas_v3"],
        "render_modes": ["path_tracing", "neural"],
        "denoisers": ["optix_ai", "temporal", "cnn_fallback", "none"],
        "presets": [
            {"name": "draft", "samples": 32, "max_bounces": 2, "use_denoising": False, "exposure": 1.0},
            {"name": "balanced", "samples": 64, "max_bounces": 4, "use_denoising": True, "exposure": 1.0},
            {"name": "cinematic", "samples": 256, "max_bounces": 8, "use_denoising": True, "exposure": 1.1},
        ],
    }


@router.get("/queue/status", response_model=QueueStatus)
async def queue_status(db: Session = Depends(get_db)):
    status_counts = dict(
        db.query(Job.status, func.count(Job.id)).group_by(Job.status).all()
    )
    return QueueStatus(
        queued_jobs=int(status_counts.get("pending", 0)),
        active_jobs=int(status_counts.get("processing", 0)),
        completed_jobs=int(status_counts.get("completed", 0)),
        failed_jobs=int(status_counts.get("failed", 0)),
    )