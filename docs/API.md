# LumiTrace API Documentation

## Base URLs

- Development: `http://localhost:8000`
- Production: `https://api.lumitrace.app`

## Authentication

Auth is JWT bearer token based. Anonymous processing is allowed when `ALLOW_ANONYMOUS_JOBS=true`.

Header format:

```http
Authorization: Bearer <access_token>
```

All HTTP responses include a unique `X-Request-Id` header for request tracing.

## Health and System

### GET /health
Returns backend readiness including database and model state.

Health payload also reports runtime mode flags:

- `embedded_worker_enabled`
- `queue_backend`
- `retention_cleanup_enabled`
- `retention_running`
- `model_loading_enabled`

When `queue_backend=redis`, health includes broker readiness fields:

- `broker_enabled`
- `broker_available`
- `broker_queue_depth`
- `broker_inflight_jobs`

Health returns `status="degraded"` when any expected runtime loop is unavailable (database check fails, Redis broker unavailable in Redis mode, embedded queue worker expected but not running, or retention loop expected but not running).

### GET /metrics
Returns runtime observability counters for HTTP traffic, queue lifecycle events, Redis broker dispatch/pop activity, retention maintenance, and current queue depth.

Response shape:

```json
{
  "uptime_seconds": 342,
  "worker": {
    "instance_id": "worker-1234abcd",
    "running": true,
    "embedded_enabled": true,
    "queue_backend": "redis",
    "broker": {
      "enabled": true,
      "available": true,
      "queue_depth": 0,
      "inflight_jobs": 0,
      "latency_ms": 1.23
    }
  },
  "http": {
    "requests_total": 128,
    "requests_in_flight": 0,
    "request_errors_total": 0,
    "slow_requests_total": 2,
    "avg_request_duration_ms": 23.5,
    "max_request_duration_ms": 188.2,
    "requests_by_method": {"GET": 80, "POST": 48},
    "responses_by_status": {"200": 120, "400": 8}
  },
  "jobs": {
    "jobs_claimed_total": 14,
    "jobs_completed_total": 12,
    "jobs_failed_total": 2,
    "jobs_retried_total": 3,
    "stale_jobs_reclaimed_total": 1
  },
  "broker": {
    "dispatch_scans_total": 30,
    "dispatch_candidates_total": 110,
    "enqueue_requests_total": 110,
    "enqueue_added_total": 42,
    "enqueue_deduped_total": 68,
    "enqueue_errors_total": 0,
    "pops_total": 42,
    "claimed_from_pop_total": 42,
    "claim_misses_total": 0
  },
  "maintenance": {
    "retention_runs_total": 7,
    "retention_jobs_deleted_total": 5,
    "retention_files_deleted_total": 10,
    "retention_cleanup_enabled": true
  },
  "queue": {
    "queued_jobs": 0,
    "active_jobs": 1,
    "completed_jobs": 42,
    "failed_jobs": 3
  }
}
```

### GET /models
Returns supported depth/render/denoising modes and built-in presets.

### GET /queue/status
Returns aggregated job counts by state (`pending`, `processing`, `completed`, `failed`).

## Account Endpoints

### POST /auth/register
Create a user account.

Request body:

```json
{
  "email": "user@example.com",
  "password": "password123",
  "display_name": "Render Artist"
}
```

Response:

```json
{
  "access_token": "jwt-token",
  "token_type": "bearer",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "display_name": "Render Artist",
    "is_active": true,
    "created_at": "2026-04-04T00:00:00"
  }
}
```

### POST /auth/login
Authenticate existing user with email/password.

### POST /auth/google
Authenticate with a Google ID token.

Request body:

```json
{
  "id_token": "google-id-token"
}
```

Notes:

- Backend requires `GOOGLE_CLIENT_ID` to be configured.
- Token must be issued by Google (`accounts.google.com`) and include a verified email.
- Existing users are linked by matching email if `google_sub` is not already set.

### GET /auth/me
Returns authenticated user profile.

## Processing Endpoints

### POST /process/image
Submit image render job.

Multipart form fields:

- `file`: image file
- `samples`: int, range 16-512
- `max_bounces`: int, range 1-16
- `use_denoising`: bool
- `use_neural`: bool
- `exposure`: float, range 0.1-3.0

Response:

```json
{
  "job_id": "uuid",
  "status": "queued",
  "message": "Image job queued"
}
```

### POST /process/video
Submit video render job.

Multipart form fields:

- `file`: video file
- `samples`: int, range 16-512
- `max_bounces`: int, range 1-16
- `use_denoising`: bool
- `fps`: optional int

### GET /status/{job_id}
Fetches job progress.
Status responses now include retry metadata for observability.

Response shape:

```json
{
  "job_id": "uuid",
  "status": "processing",
  "progress": 42,
  "attempt_count": 1,
  "max_attempts": 3,
  "error": null,
  "output_url": null,
  "media_type": "image",
  "queue_position": null
}
```

### WS /ws/jobs/{job_id}
Streams status updates in near real-time. Optional `token` query parameter can be supplied for authenticated user-owned jobs.

Example payload:

```json
{
  "job_id": "uuid",
  "status": "processing",
  "progress": 61,
  "attempt_count": 1,
  "max_attempts": 3,
  "error": null,
  "output_url": null,
  "media_type": "image",
  "queue_position": null
}
```

### GET /download/{job_id}
Downloads completed output artifact.

## User Job Management

### GET /jobs?limit=25
Requires authentication. Returns recent jobs for current user.

### DELETE /jobs/{job_id}
Requires authentication. Deletes owned job and its output artifact.

## API Version Aliases

Auth and utility routes are also available under:

- `/api/v1/auth/*`
- `/api/v1/models`
- `/api/v1/queue/status`

## Error Model

Common status codes:

- `400` invalid input or unsupported media
- `401` authentication required
- `403` unauthorized access to a user-owned job
- `404` resource not found
- `409` email already registered
- `413` file too large
- `422` request validation error
- `500` internal failure
