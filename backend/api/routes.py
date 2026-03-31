"""
API Routes for LumiTrace
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional

router = APIRouter()

@router.get("/models")
async def list_models():
    """List available AI models"""
    return {
        "depth_models": ["dpt_large", "dpt_hybrid", "midas_v3"],
        "render_modes": ["path_tracing", "neural"],
        "denoisers": ["optix_ai", "temporal", "none"]
    }

@router.get("/queue/status")
async def queue_status():
    """Get current queue status"""
    return {
        "queued_jobs": 0,
        "active_jobs": 0,
        "completed_jobs": 0,
        "gpu_utilization": 0.0
    }