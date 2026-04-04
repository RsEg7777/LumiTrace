# Deployment Guide

## Target Topology

- Frontend: Vercel (`frontend/`)
- Backend: single GPU VM container (`backend/`)
- Database: SQLite for single-node deployment (`lumitrace.db` on VM disk) or PostgreSQL for scalable deployments

## 1. Local Validation Before Deploy

### Backend

```bash
pip install -r requirements.txt
alembic -c backend/alembic.ini upgrade head
pytest backend/tests -c backend/pytest.ini -v
```

### Frontend

```bash
cd frontend
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

## 2. Backend Container Deployment

Build and run:

```bash
cd backend
docker build -t lumitrace-backend .
docker run --gpus all -d \
  -p 8000:8000 \
  -e ENVIRONMENT=production \
  -e DATABASE_URL=sqlite:///./lumitrace.db \
  -e JWT_SECRET_KEY=<strong-secret> \
  -e ALLOW_ANONYMOUS_JOBS=false \
  -v $(pwd)/outputs:/app/outputs \
  -v $(pwd)/temp:/app/temp \
  -v $(pwd)/data:/app \
  lumitrace-backend
```

The backend container startup now applies schema upgrades automatically with `alembic upgrade head` before `uvicorn`.

When using SQLite URLs such as `sqlite:///./lumitrace.db`, LumiTrace resolves the path under `backend/` so split API/worker processes use a shared database location.

For PostgreSQL-backed deployments, set `DATABASE_URL` to a PostgreSQL DSN and keep the same startup flow:

```bash
-e DATABASE_URL=postgresql+psycopg2://<user>:<password>@<host>:5432/<db>
```

For split deployments (API and worker as separate containers/processes), disable embedded worker in API and run the standalone worker entrypoint:

```bash
# API container/process
RUN_QUEUE_WORKER_IN_API=false
RUN_RETENTION_CLEANUP_IN_API=false
LOAD_RENDER_MODELS_ON_STARTUP=false
WORKER_QUEUE_BACKEND=redis
REDIS_URL=redis://<redis-host>:6379

# Worker container/process command override
WORKER_QUEUE_BACKEND=redis
REDIS_URL=redis://<redis-host>:6379
sh -c "alembic -c alembic.ini upgrade head && python -m app.worker_service"
```

## 3. Frontend Vercel Deployment

Set Vercel environment variable:

```bash
NEXT_PUBLIC_API_URL=https://<your-backend-host>
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<google-oauth-client-id>
```

Push to `main` and let Vercel build/deploy.

## 3b. Full Stack Compose Deployment

For a production-like split stack (API + worker + Redis + PostgreSQL):

```bash
docker compose -f docker-compose.stack.yml up --build
```

Stack file location: `docker-compose.stack.yml`
By default this stack uses `SKIP_MODEL_LOAD=true` to make smoke validation deterministic on non-GPU hosts; set it to `false` for full model runtime on GPU nodes.

Automated verification script (starts stack, validates health/metrics/mode flags, runs an authenticated end-to-end render smoke, and confirms post-render queue/broker counters, then tears down):

```powershell
pwsh ./scripts/verify-stack.ps1
```

If local Docker is unavailable, run the manual GitHub Actions stack smoke workflow:

- Workflow: `.github/workflows/stack-smoke.yml`
- Trigger: `workflow_dispatch`

## 4. CI Pipeline

CI workflow file: `.github/workflows/ci.yml`

What it enforces:

- Frontend lint
- Frontend typecheck
- Frontend tests
- Frontend production build
- Backend tests with `SKIP_MODEL_LOAD=true`
- Database migration upgrade check (`alembic upgrade head`)
- Backend runtime smoke checks against `/health`, `/queue/status`, and `/models`
- Backend test matrix coverage on SQLite and PostgreSQL
- Backend test coverage in Redis broker queue mode (`WORKER_QUEUE_BACKEND=redis`)

## 5. Runtime Health Checks

After deployment run:

```bash
curl https://<backend-host>/health
curl https://<backend-host>/models
curl https://<backend-host>/queue/status
curl https://<backend-host>/metrics
```

Expected:

- `database: true`
- `models_loaded: true`
- if `queue_backend=redis`, verify `broker_available: true`
- if `embedded_worker_enabled=true`, verify `worker_running: true`
- if `retention_cleanup_enabled=true`, verify `retention_running: true`
- queue status returns integer counters
- metrics payload includes `http`, `jobs`, `broker`, `maintenance`, and `queue` sections

## 6. Security and Secrets Checklist

- Set strong `JWT_SECRET_KEY`
- Set `GOOGLE_CLIENT_ID` when enabling Google sign-in
- Backend startup now refuses production runtime when `JWT_SECRET_KEY` is still the default `change-me-in-production`
- Set `ALLOW_ANONYMOUS_JOBS=false` in production for account-only mode
- Restrict `BACKEND_CORS_ORIGINS` to frontend origin
- Set retention controls (`JOB_RETENTION_HOURS`, `RETENTION_CLEANUP_INTERVAL_SECONDS`) for storage policy
- Keep request observability on (`REQUEST_LOGGING_ENABLED=true`) and tune `REQUEST_LOG_SLOW_MS`
- In split mode, ensure only worker processes run with `RUN_QUEUE_WORKER_IN_API=true`
- In Redis broker mode, ensure API and worker share the same `REDIS_URL` and `BROKER_QUEUE_NAME`
- Rotate API secrets regularly

## 7. Rollback Procedure

1. Keep prior Docker image tag on VM.
2. If smoke checks fail, stop latest container and restart previous tag.
3. Verify `/health` and one authenticated render flow.

## 8. Recommended Next Ops Enhancements

- Move from SQLite to PostgreSQL for multi-node scale.
- Add structured logging and metrics export.
