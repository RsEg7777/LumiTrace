# LumiTrace API Documentation

## Base URL

```
Development: http://localhost:8000
Production: https://api.lumitrace.app
```

## Authentication

API keys passed via header:

```bash
Authorization: Bearer YOUR_API_KEY
```

## Endpoints

### Health Check

```http
GET /health
```

Response:

```json
{
  "status": "healthy",
  "gpu_available": true,
  "models_loaded": true
}
```

### Process Image

```http
POST /process/image
Content-Type: multipart/form-data
```

Parameters:

| Field         | Type  | Required | Description                             |
| ------------- | ----- | -------- | --------------------------------------- |
| file          | File  | Yes      | Image file (PNG, JPG, WEBP)             |
| samples       | int   | No       | Samples per pixel (16-512, default: 64) |
| max_bounces   | int   | No       | Max light bounces (1-16, default: 4)    |
| use_denoising | bool  | No       | Enable AI denoising (default: true)     |
| use_neural    | bool  | No       | Use neural renderer (default: false)    |
| exposure      | float | No       | Exposure value (0.1-3.0, default: 1.0)  |

Response:

```json
{
  "job_id": "uuid-string",
  "status": "processing",
  "message": "Image processing started"
}
```

### Process Video

```http
POST /process/video
Content-Type: multipart/form-data
```

Additional Parameters:

| Field | Type | Required | Description       |
| ----- | ---- | -------- | ----------------- |
| fps   | int  | No       | Output frame rate |

### Get Job Status

```http
GET /status/{job_id}
```

Response:

```json
{
  "status": "processing",
  "progress": 45,
  "output_path": null
}
```

Statuses: `processing`, `completed`, `failed`

### Download Result

```http
GET /download/{job_id}
```

Returns: Binary file (image/video)

## WebSocket API

```javascript
const ws = new WebSocket('ws://localhost:8000/ws/{job_id}');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.progress);
};
```

## Error Codes

| Code | Description            |
| ---- | ---------------------- |
| 400  | Bad Request            |
| 404  | Job not found          |
| 413  | File too large         |
| 415  | Unsupported media type |
| 500  | Internal server error  |
| 503  | GPU unavailable        |

## Rate Limits

* Free tier: 10 requests/minute
* Pro tier: 100 requests/minute
* Enterprise: Unlimited

## SDK Examples

### Python

```python
import requests

with open('image.jpg', 'rb') as f:
    response = requests.post(
        'http://localhost:8000/process/image',
        files={'file': f},
        data={'samples': 128}
    )

job_id = response.json()['job_id']

import time
while True:
    status = requests.get(f'http://localhost:8000/status/{job_id}').json()
    if status['status'] == 'completed':
        break
    time.sleep(1)

result = requests.get(f'http://localhost:8000/download/{job_id}')
with open('output.png', 'wb') as f:
    f.write(result.content)
```

### JavaScript

```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('samples', '128');

const response = await fetch('http://localhost:8000/process/image', {
  method: 'POST',
  body: formData
});

const { job_id } = await response.json();

const checkStatus = async () => {
  const res = await fetch(`http://localhost:8000/status/${job_id}`);
  const data = await res.json();
  
  if (data.status === 'completed') {
    window.location.href = `http://localhost:8000/download/${job_id}`;
  } else {
    setTimeout(checkStatus, 1000);
  }
};

checkStatus();
```
