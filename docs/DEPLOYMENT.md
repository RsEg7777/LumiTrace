# Deployment Guide

## Local Development

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Production Deployment

### Option 1: Vercel + Cloud GPU

#### Frontend (Vercel)

1. Push to GitHub
2. Connect repository to Vercel
3. Set environment variables:

```
NEXT_PUBLIC_API_URL=https://your-backend.com
```

4. Deploy

#### Backend (Cloud GPU)

**AWS EC2 (g5.xlarge)**:

```bash
sudo apt update
sudo apt install -y nvidia-driver-535 nvidia-docker2

docker run --gpus all -d \
  -p 8000:8000 \
  -e CUDA_VISIBLE_DEVICES=0 \
  lumitrace-backend
```

**Google Cloud Platform**:

```bash
gcloud compute instances create lumitrace-backend \
  --zone=us-central1-a \
  --machine-type=n1-standard-4 \
  --accelerator=type=nvidia-tesla-t4,count=1 \
  --image-family=pytorch-latest-gpu \
  --image-project=deeplearning-platform-release

gcloud compute scp --recurse backend/ instance-name:~/
gcloud compute ssh instance-name --command="docker build -t lumitrace . && docker run -d -p 8000:8000 lumitrace"
```

### Option 2: Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: lumitrace-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: lumitrace
  template:
    metadata:
      labels:
        app: lumitrace
    spec:
      containers:
      - name: backend
        image: lumitrace-backend:latest
        resources:
          limits:
            nvidia.com/gpu: 1
        ports:
        - containerPort: 8000
```

### Option 3: Serverless (CPU Fallback)

```yaml
{
  "functions": {
    "api/process.py": {
      "maxDuration": 60
    }
  }
}
```

## CI/CD Pipeline

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build Docker
        run: docker build -t lumitrace-backend ./backend
      
      - name: Push to Registry
        run: |
          echo ${{ secrets.DOCKER_PASSWORD }} | docker login -u ${{ secrets.DOCKER_USERNAME }} --password-stdin
          docker push lumitrace-backend
      
      - name: Deploy to Server
        run: |
          ssh user@server "docker pull lumitrace-backend && docker restart lumitrace"

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: vercel/action-deploy@v1
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
```

## Environment Variables

### Backend

```bash
REDIS_URL=redis://localhost:6379
MODEL_PATH=/app/models
MAX_FILE_SIZE=100MB
GPU_MEMORY_FRACTION=0.8
LOG_LEVEL=INFO
```

### Frontend

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
NEXT_PUBLIC_MAX_UPLOAD_SIZE=104857600
```

## Monitoring & Logging

```python
from prometheus_client import start_http_server
start_http_server(9090)
```

```python
import structlog
logger = structlog.get_logger()
logger.info("job_started", job_id=job_id)
```

## Backup & Recovery

```bash
aws s3 sync models/ s3://lumitrace-backup/models/
aws s3 sync outputs/ s3://lumitrace-backup/outputs/
```

## Security Checklist

* HTTPS enabled
* API key authentication
* Rate limiting
* Input validation
* Container scanning
* Secrets management
* Network policies
* Regular updates

```
```
