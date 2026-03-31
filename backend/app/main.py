"""
LumiTrace Backend API
FastAPI service for path tracing processing
"""
from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
import torch
import numpy as np
import cv2
import os
import uuid
from pathlib import Path
import logging

from core.path_tracer import PathTracerCore, RenderConfig, NeuralPathTracer
from core.denoiser import OptixAIDenoiser, TemporalDenoiser
from core.depth_estimator import DepthEstimator, DepthPreprocessor
from utils.video import VideoProcessor
from utils.image import ImageProcessor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="LumiTrace API",
    description="AI-Powered Path Tracing as a Service",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

path_tracer = None
depth_estimator = None
denoiser = None
neural_tracer = None
video_processor = None
image_processor = None

class ProcessRequest(BaseModel):
    samples: int = 64
    max_bounces: int = 4
    use_denoising: bool = True
    use_neural: bool = False
    exposure: float = 1.0

class ProcessResponse(BaseModel):
    job_id: str
    status: str
    message: str

jobs = {}

@app.on_event("startup")
async def startup_event():
    global path_tracer, depth_estimator, denoiser, neural_tracer, video_processor, image_processor
    
    logger.info("🚀 Initializing LumiTrace backend...")
    
    if torch.cuda.is_available():
        device_name = torch.cuda.get_device_name(0)
        logger.info(f"✅ GPU detected: {device_name}")
        logger.info(f"   CUDA Version: {torch.version.cuda}")
        logger.info(f"   VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB")
    else:
        logger.warning("⚠️ No GPU detected, using CPU (slow)")
    
    try:
        path_tracer = PathTracerCore()
        depth_estimator = DepthEstimator()
        denoiser = OptixAIDenoiser()
        neural_tracer = NeuralPathTracer().cuda() if torch.cuda.is_available() else NeuralPathTracer()
        video_processor = VideoProcessor()
        image_processor = ImageProcessor()
        
        logger.info("✅ All models initialized successfully")
    except Exception as e:
        logger.error(f"❌ Model initialization failed: {e}")
        raise

@app.get("/")
async def root():
    return {
        "status": "online",
        "service": "LumiTrace API",
        "gpu": torch.cuda.is_available(),
        "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "gpu_available": torch.cuda.is_available(),
        "models_loaded": all([
            path_tracer is not None,
            depth_estimator is not None,
            denoiser is not None
        ])
    }

@app.post("/process/image", response_model=ProcessResponse)
async def process_image(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    samples: int = 64,
    max_bounces: int = 4,
    use_denoising: bool = True,
    use_neural: bool = False,
    exposure: float = 1.0
):
    job_id = str(uuid.uuid4())
    
    if not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")
    
    jobs[job_id] = {"status": "processing", "progress": 0}
    
    background_tasks.add_task(
        _process_image_task, job_id, file, samples, max_bounces, use_denoising, use_neural, exposure
    )
    
    return ProcessResponse(
        job_id=job_id,
        status="processing",
        message="Image processing started"
    )

@app.post("/process/video", response_model=ProcessResponse)
async def process_video(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    samples: int = 32,
    max_bounces: int = 4,
    use_denoising: bool = True,
    fps: Optional[int] = None
):
    job_id = str(uuid.uuid4())
    
    if not file.content_type.startswith("video/"):
        raise HTTPException(400, "File must be a video")
    
    jobs[job_id] = {"status": "processing", "progress": 0}
    
    background_tasks.add_task(
        _process_video_task, job_id, file, samples, max_bounces, use_denoising, fps
    )
    
    return ProcessResponse(
        job_id=job_id,
        status="processing",
        message="Video processing started"
    )

@app.get("/status/{job_id}")
async def get_status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")
    return jobs[job_id]

@app.get("/download/{job_id}")
async def download_result(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")
    
    job = jobs[job_id]
    if job["status"] != "completed":
        raise HTTPException(400, "Job not completed yet")
    
    output_path = job.get("output_path")
    if not output_path or not os.path.exists(output_path):
        raise HTTPException(404, "Output file not found")
    
    return FileResponse(
        output_path,
        media_type="application/octet-stream",
        filename=os.path.basename(output_path)
    )

async def _process_image_task(job_id, file, samples, max_bounces, use_denoising, use_neural, exposure):
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        jobs[job_id]["progress"] = 10
        
        depth = depth_estimator.estimate(image)
        jobs[job_id]["progress"] = 30
        
        if use_neural:
            result = _neural_render(image, depth)
        else:
            config = RenderConfig(
                samples_per_pixel=samples,
                max_bounces=max_bounces,
                resolution=(image.shape[1], image.shape[0]),
                use_denoising=use_denoising,
                exposure=exposure
            )
            
            path_tracer.load_scene(depth, image)
            result = path_tracer.trace_paths(config)
            
            if use_denoising:
                result = denoiser.denoise(result)
        
        jobs[job_id]["progress"] = 90
        
        output_dir = Path("outputs")
        output_dir.mkdir(exist_ok=True)
        output_path = output_dir / f"{job_id}.png"
        cv2.imwrite(str(output_path), result)
        
        jobs[job_id].update({
            "status": "completed",
            "progress": 100,
            "output_path": str(output_path)
        })
        
    except Exception as e:
        logger.error(f"Job {job_id} failed: {e}")
        jobs[job_id].update({"status": "failed", "error": str(e)})

async def _process_video_task(job_id, file, samples, max_bounces, use_denoising, fps):
    try:
        temp_dir = Path("temp")
        temp_dir.mkdir(exist_ok=True)
        input_path = temp_dir / f"{job_id}_input.mp4"
        
        with open(input_path, "wb") as f:
            f.write(await file.read())
        
        jobs[job_id]["progress"] = 5
        
        output_dir = Path("outputs")
        output_dir.mkdir(exist_ok=True)
        output_path = output_dir / f"{job_id}_path_traced.mp4"
        
        await video_processor.process(
            str(input_path), str(output_path),
            depth_estimator, path_tracer,
            denoiser if use_denoising else None,
            samples, max_bounces, fps,
            lambda p: jobs[job_id].update({"progress": int(p * 100)})
        )
        
        os.remove(input_path)
        
        jobs[job_id].update({
            "status": "completed",
            "progress": 100,
            "output_path": str(output_path)
        })
        
    except Exception as e:
        logger.error(f"Job {job_id} failed: {e}")
        jobs[job_id].update({"status": "failed", "error": str(e)})

def _neural_render(image, depth):
    depth_tensor = torch.from_numpy(depth).unsqueeze(0).unsqueeze(0).float().cuda()
    image_tensor = torch.from_numpy(image).permute(2, 0, 1).unsqueeze(0).float().cuda() / 255
    
    with torch.no_grad():
        output = neural_tracer(depth_tensor, image_tensor)
    
    result = output.squeeze(0).permute(1, 2, 0).cpu().numpy() * 255
    return result.astype(np.uint8)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)