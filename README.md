# LumiTrace

LumiTrace is an AI-powered path tracing platform for image and video enhancement with a modern Next.js frontend and a FastAPI backend optimized for GPU rendering workflows.

## What Is New In This Implementation Wave

- Account system with JWT auth (`/auth/register`, `/auth/login`, `/auth/me`)
- Persistent job storage in database (`users`, `jobs` tables)
- Durable queue worker with lease heartbeats, bounded retries, and restart recovery
- Optional standalone worker process mode for API/worker separation
- Request observability middleware with request IDs and slow-request logging
- Runtime metrics endpoint (`/metrics`) for HTTP, queue, and maintenance counters
- Automated retention cleanup loop for expired completed/failed jobs and artifacts
- Job ownership enforcement for status/download access
- Real-time progress transport via WebSocket (`/ws/jobs/{job_id}`) with polling fallback
- Hardened processing parameter validation and file-size checks
- Frontend redesign with:
  - quality presets
  - keyboard shortcuts
  - local settings persistence
  - local render history timeline
  - account-aware cloud job sync
  - retry-safe processing flow through typed API client
- Automated tests for backend and frontend
- CI workflow for lint, typecheck, tests, production build, backend smoke checks, PostgreSQL-backed backend tests, and Redis broker-mode backend tests

## Project Structure

```text
backend/
  app/          # FastAPI app, config, db, models, security
  api/          # auth and utility routes
  core/         # path tracing, depth estimation, denoising
  utils/        # media processing utilities
  tests/        # backend tests
frontend/
  app/          # Next.js app routes, hooks, shared types
  components/   # UI components
  lib/          # API client and utilities
  __tests__/    # frontend tests
.github/workflows/
  ci.yml
```

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- NVIDIA GPU for full rendering pipeline (optional for mock/test mode)

### Backend

```bash
pip install -r requirements.txt
alembic -c backend/alembic.ini upgrade head
uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload
```

For SQLite URLs like `sqlite:///./lumitrace.db`, LumiTrace resolves the file path relative to `backend/` so API and worker processes share the same database path in split mode.

Optional split-mode runtime (separate API and worker processes):

```bash
# API process (no embedded worker)
RUN_QUEUE_WORKER_IN_API=false RUN_RETENTION_CLEANUP_IN_API=false LOAD_RENDER_MODELS_ON_STARTUP=false WORKER_QUEUE_BACKEND=redis \
uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000

# Worker process
WORKER_QUEUE_BACKEND=redis \
python -m app.worker_service
```

When `WORKER_QUEUE_BACKEND=redis`, the API enqueues due jobs into `BROKER_QUEUE_NAME` (default `lumitrace:jobs`) and workers consume via Redis blocking pop.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Set environment in `frontend/.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<google-oauth-client-id> # optional, required only for Google sign-in UI
```

## Testing

### Backend

```bash
alembic -c backend/alembic.ini upgrade head
pytest backend/tests -c backend/pytest.ini -v
```

For PostgreSQL environments, set `DATABASE_URL` (for example `postgresql+psycopg2://user:pass@host:5432/dbname`) before running migrations and tests.

### Frontend

```bash
cd frontend
npm run lint
npm run typecheck
npm test
```

## Core API Endpoints

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/google`
- `GET /auth/me`
- `POST /process/image`
- `POST /process/video`
- `GET /status/{job_id}`
- `GET /download/{job_id}`
- `GET /jobs`
- `DELETE /jobs/{job_id}`
- `GET /metrics`

## Deployment

See `docs/DEPLOYMENT.md` for the production deployment flow and rollout checklist.

For a full local production-like stack (API + worker + Redis + PostgreSQL), use:

```bash
docker compose -f docker-compose.stack.yml up --build
```

The compose stack defaults to `SKIP_MODEL_LOAD=true` for deterministic smoke runs on non-GPU hosts. Set it to `false` in `docker-compose.stack.yml` for full GPU model runtime.

Automated stack validation (health + metrics + mode checks + authenticated end-to-end render smoke):

```powershell
pwsh ./scripts/verify-stack.ps1
```

CI alternative when local Docker is unavailable: run `.github/workflows/stack-smoke.yml` via manual workflow dispatch.
