# LumiTrace Architecture

## System Overview

LumiTrace is a distributed path tracing system consisting of:

1. **Frontend**: Next.js 14 web application
2. **Backend**: FastAPI with CUDA path tracing
3. **ML Models**: PyTorch neural renderers
4. **Storage**: Local filesystem (S3 in production)

---

## Data Flow

```
User Upload
    ↓
Frontend (Next.js/Vercel)
    ↓
Backend API (FastAPI)
    ↓
Depth Estimation (MiDaS/DPT)
    ↓
Path Tracing (CUDA/OptiX)
    ↓
Denoising (OptiX AI)
    ↓
Result Storage
    ↓
User Download
```

---

## Component Details

### Path Tracer Core

The path tracer uses Monte Carlo integration with:

* **Ray Generation**: Pinhole camera model
* **Intersection**: Depth-based sphere tracing
* **BSDF**: Lambertian diffuse (extendable)
* **Sampling**: Cosine-weighted hemisphere
* **Acceleration**: BVH (future)

---

### Neural Renderer

U-Net architecture for fast approximation:

* **Input**: Depth map + Albedo
* **Encoder**: 3 downsampling layers
* **Bottleneck**: Attention mechanism
* **Decoder**: 2 upsampling layers
* **Output**: 3-channel RGB

---

### Depth Estimation

DPT (Dense Prediction Transformer):

* **Model**: Intel/dpt-large
* **Input**: RGB image
* **Output**: Metric depth map
* **Optimization**: Torch.compile for inference

---

### Denoiser

OptiX AI Denoiser with fallback:

* **Primary**: NVIDIA OptiX 8.0
* **Fallback**: Lightweight CNN
* **Temporal**: Exponential moving average
* **Guides**: Albedo + Normal maps

---

## Scalability

### Horizontal Scaling

```yaml
version: '3.8'
services:
  backend:
    image: lumitrace-backend
    deploy:
      replicas: 3
    environment:
      - REDIS_URL=redis://redis:6379

  worker:
    image: lumitrace-backend
    command: celery -A app.worker worker
    deploy:
      replicas: 5

  redis:
    image: redis:alpine
```

---

### Queue System

Jobs are processed asynchronously:

1. Client uploads file → Gets job_id
2. Job queued in Redis
3. Worker picks up job
4. Progress updates via WebSocket
5. Client polls for completion

---

## Security

* File validation (type, size)
* Rate limiting (Redis-based)
* CORS configuration
* Input sanitization
* Isolated processing containers

---

## Monitoring

```python
from prometheus_client import Counter, Histogram

jobs_completed = Counter('jobs_completed_total', 'Total jobs')
processing_time = Histogram('processing_seconds', 'Time spent')
```
