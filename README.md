# 🌟 LumiTrace

AI-Powered Path Tracing as a Service. Transform your images and videos with physically accurate lighting, global illumination, and cinematic quality rendering.

![LumiTrace Banner](https://img.shields.io/badge/RTX-5070-76B900?style=for-the-badge\&logo=nvidia\&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge\&logo=fastapi)
![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge\&logo=next.js\&logoColor=white)

---

## ✨ Features

* 🎨 **AI Path Tracing**: Monte Carlo path tracing with global illumination
* 🧠 **Neural Rendering**: Fast approximation using trained networks
* 🎥 **Video Support**: Process entire videos with temporal consistency
* 🔍 **Depth Estimation**: MiDaS/DPT integration for 3D reconstruction
* 🎛️ **Real-time Controls**: Adjust samples, bounces, exposure
* ✨ **AI Denoising**: OptiX AI denoiser for clean results
* 🌐 **Web Interface**: Modern React frontend with live preview
* ⚡ **GPU Accelerated**: Optimized for NVIDIA RTX 5070

---

## 🏗️ Architecture

```
LumiTrace/
├── backend/
│   ├── core/
│   ├── api/
│   └── utils/
├── frontend/
│   ├── app/
│   └── components/
└── models/
```

---

## 🚀 Quick Start

### Prerequisites

* NVIDIA GPU with CUDA 12.1+
* Python 3.10+
* Node.js 18+
* Docker (optional)

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### Environment Variables

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 🎯 Usage

1. Upload image/video
2. Configure settings
3. Start rendering
4. Download result

---

## 🔧 API Endpoints

### Process Image

```bash
curl -X POST "http://localhost:8000/process/image" \
  -F "file=@image.jpg" \
  -F "samples=128" \
  -F "max_bounces=8"
```

### Status

```bash
curl "http://localhost:8000/status/{job_id}"
```

---

## 🧪 Development

```bash
cd backend
python train.py --epochs 100
```

---