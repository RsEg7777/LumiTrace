"""LumiTrace Backend API with persistence, auth, and durable job execution."""
import asyncio
import contextlib
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
import json
import logging
import os
from pathlib import Path
import threading
import time
import uuid

import cv2
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import numpy as np
try:
    from redis import Redis
    from redis.exceptions import RedisError
except Exception:  # pragma: no cover - fallback for minimal environments
    Redis = None

    class RedisError(Exception):
        pass
from sqlalchemy import func, inspect, or_, text
from sqlalchemy.orm import Session
import torch

from api.auth import router as auth_router
from api.routes import router as utility_router
from api.schemas import JobSummary, ProcessResponse
from app.config import get_settings
from app.db import SessionLocal, engine, get_db
from app.dependencies import get_current_user, get_current_user_optional
from app.models import Job, User
from app.security import decode_access_token
from core.denoiser import OptixAIDenoiser
from core.path_tracer import NeuralPathTracer, PathTracerCore, RenderConfig
from utils.video import VideoProcessor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = get_settings()

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _resolve_runtime_dir(path_value: str) -> Path:
    candidate = Path(path_value)
    if candidate.is_absolute():
        return candidate
    return (BACKEND_ROOT / candidate).resolve()


OUTPUT_DIR_PATH = _resolve_runtime_dir(settings.OUTPUT_DIR)
TEMP_DIR_PATH = _resolve_runtime_dir(settings.TEMP_DIR)

WORKER_IDLE_SLEEP_SECONDS = 1.0
WEBSOCKET_POLL_SECONDS = 0.75
WORKER_HEARTBEAT_SECONDS = max(float(settings.WORKER_HEARTBEAT_SECONDS), 1.0)
WORKER_STALE_SCAN_SECONDS = max(float(settings.WORKER_STALE_SCAN_SECONDS), 1.0)
REQUEST_SLOW_THRESHOLD_MS = max(float(settings.REQUEST_LOG_SLOW_MS), 1.0)
RETENTION_CLEANUP_INTERVAL_SECONDS = max(int(settings.RETENTION_CLEANUP_INTERVAL_SECONDS), 15)
JOB_RETENTION_HOURS = max(int(settings.JOB_RETENTION_HOURS), 1)
WORKER_INSTANCE_ID = f"worker-{os.getpid()}-{uuid.uuid4().hex[:8]}"

# Runtime-initialized processing components.
path_tracer = None
depth_estimator = None
denoiser = None
neural_tracer = None
video_processor = None

# Queue worker lifecycle controls.
queue_worker_task: asyncio.Task | None = None
retention_cleanup_task: asyncio.Task | None = None
queue_stop_event: asyncio.Event | None = None
queue_wakeup_event: asyncio.Event | None = None
broker_client_lock = threading.Lock()
broker_client = None

_runtime_started_at = datetime.now(UTC).replace(tzinfo=None)
_runtime_metrics_lock = threading.Lock()
_PRODUCTION_DEFAULT_JWT_SECRET = "change-me-in-production"
_runtime_metrics = {
    "requests_total": 0,
    "requests_in_flight": 0,
    "request_errors_total": 0,
    "request_duration_ms_total": 0.0,
    "request_duration_ms_max": 0.0,
    "slow_requests_total": 0,
    "jobs_claimed_total": 0,
    "jobs_completed_total": 0,
    "jobs_failed_total": 0,
    "jobs_retried_total": 0,
    "stale_jobs_reclaimed_total": 0,
    "broker_dispatch_scans_total": 0,
    "broker_dispatch_candidates_total": 0,
    "broker_enqueue_requests_total": 0,
    "broker_enqueue_added_total": 0,
    "broker_enqueue_deduped_total": 0,
    "broker_enqueue_errors_total": 0,
    "broker_pops_total": 0,
    "broker_claimed_from_pop_total": 0,
    "broker_claim_misses_total": 0,
    "retention_runs_total": 0,
    "retention_jobs_deleted_total": 0,
    "retention_files_deleted_total": 0,
    "requests_by_method": {},
    "responses_by_status": {},
}


def _utcnow_naive() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _should_run_embedded_queue_worker() -> bool:
    return bool(settings.RUN_QUEUE_WORKER_IN_API)


def _should_run_retention_cleanup() -> bool:
    return bool(settings.RUN_RETENTION_CLEANUP_IN_API)


def _should_load_render_models() -> bool:
    return bool(settings.LOAD_RENDER_MODELS_ON_STARTUP)


def _queue_backend() -> str:
    backend = str(settings.WORKER_QUEUE_BACKEND or "db").strip().lower()
    if backend not in {"db", "redis"}:
        logger.warning("Unknown WORKER_QUEUE_BACKEND '%s', defaulting to db", backend)
        return "db"
    return backend


def _should_use_redis_broker() -> bool:
    return _queue_backend() == "redis"


def _is_production_environment() -> bool:
    return str(settings.ENVIRONMENT or "").strip().lower() == "production"


def _validate_runtime_configuration() -> None:
    if not _is_production_environment():
        return

    secret = str(settings.JWT_SECRET_KEY or "").strip()
    if not secret or secret == _PRODUCTION_DEFAULT_JWT_SECRET:
        raise RuntimeError("Refusing to start in production with default JWT_SECRET_KEY")

    if secret.lower().startswith("change-me"):
        logger.warning("JWT_SECRET_KEY appears to be placeholder-like in production")

    if settings.ALLOW_ANONYMOUS_JOBS:
        logger.warning("ALLOW_ANONYMOUS_JOBS=true in production; account-only mode is recommended")

    if _should_use_redis_broker() and Redis is None:
        raise RuntimeError("WORKER_QUEUE_BACKEND=redis requires redis package support")


def _validate_database_schema() -> None:
    required_tables = {"users", "jobs"}

    try:
        existing_tables = set(inspect(engine).get_table_names())
    except Exception as exc:
        raise RuntimeError(f"Failed to inspect database schema: {exc}") from exc

    missing_tables = sorted(required_tables - existing_tables)
    if missing_tables:
        raise RuntimeError(
            "Database schema is missing required tables "
            f"({', '.join(missing_tables)}). Run 'alembic -c backend/alembic.ini upgrade head' before starting the service."
        )

    if "alembic_version" not in existing_tables:
        logger.warning(
            "Database schema appears unversioned (missing alembic_version table). "
            "Use Alembic migration flow to avoid schema drift."
        )


def _broker_queue_name() -> str:
    name = str(settings.BROKER_QUEUE_NAME or "lumitrace:jobs").strip()
    return name or "lumitrace:jobs"


def _broker_inflight_set_name() -> str:
    return f"{_broker_queue_name()}:inflight"


_BROKER_ENQUEUE_IF_NEW_LUA = """
local added = redis.call('SADD', KEYS[2], ARGV[1])
if added == 1 then
    redis.call('RPUSH', KEYS[1], ARGV[1])
end
return added
"""


def _get_broker_client():
    global broker_client

    if not _should_use_redis_broker():
        return None
    if Redis is None:
        logger.warning("Redis package is unavailable; broker queue mode cannot connect")
        return None

    with broker_client_lock:
        if broker_client is not None:
            return broker_client

        try:
            broker_client = Redis.from_url(
                settings.REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=max(1, int(settings.BROKER_CONNECT_TIMEOUT_SECONDS)),
                socket_timeout=max(1, int(settings.BROKER_SOCKET_TIMEOUT_SECONDS)),
            )
            return broker_client
        except Exception as exc:
            logger.warning("Failed to initialize Redis broker client: %s", exc)
            broker_client = None
            return None


def _close_broker_client() -> None:
    global broker_client

    with broker_client_lock:
        if broker_client is None:
            return
        try:
            broker_client.close()
        except Exception:
            pass
        finally:
            broker_client = None


def _broker_runtime_snapshot() -> dict:
    if not _should_use_redis_broker():
        return {
            "enabled": False,
            "available": None,
            "queue_depth": None,
            "inflight_jobs": None,
            "latency_ms": None,
        }

    client = _get_broker_client()
    if client is None:
        return {
            "enabled": True,
            "available": False,
            "queue_depth": None,
            "inflight_jobs": None,
            "latency_ms": None,
        }

    started = time.perf_counter()
    try:
        queue_depth = int(client.llen(_broker_queue_name()) or 0)
        inflight_jobs = int(client.scard(_broker_inflight_set_name()) or 0)
    except RedisError:
        return {
            "enabled": True,
            "available": False,
            "queue_depth": None,
            "inflight_jobs": None,
            "latency_ms": None,
        }

    return {
        "enabled": True,
        "available": True,
        "queue_depth": queue_depth,
        "inflight_jobs": inflight_jobs,
        "latency_ms": round((time.perf_counter() - started) * 1000, 3),
    }


def _enqueue_job_to_broker_if_new(job_id: str) -> bool | None:
    _increment_metric("broker_enqueue_requests_total")
    client = _get_broker_client()
    if client is None:
        _increment_metric("broker_enqueue_errors_total")
        return None

    try:
        added = int(
            client.eval(
            _BROKER_ENQUEUE_IF_NEW_LUA,
            2,
            _broker_queue_name(),
            _broker_inflight_set_name(),
            job_id,
            )
            or 0
        )
        if added == 1:
            _increment_metric("broker_enqueue_added_total")
            return True

        _increment_metric("broker_enqueue_deduped_total")
        return False
    except RedisError as exc:
        _increment_metric("broker_enqueue_errors_total")
        logger.warning("Failed to enqueue job %s in Redis broker queue: %s", job_id, exc)
        return None


def _dispatch_job_to_broker(job_id: str) -> bool:
    enqueue_result = _enqueue_job_to_broker_if_new(job_id)
    return enqueue_result is not None


def _dispatch_due_jobs_to_broker(limit: int | None = None) -> int:
    if not _should_use_redis_broker():
        return 0

    _increment_metric("broker_dispatch_scans_total")

    batch_size = int(limit or settings.BROKER_DISPATCH_BATCH_SIZE)
    batch_size = max(1, batch_size)
    now = _utcnow_naive()

    db = SessionLocal()
    try:
        job_ids = [
            row[0]
            for row in (
                db.query(Job.id)
                .filter(
                    Job.status == "pending",
                    or_(Job.next_attempt_at.is_(None), Job.next_attempt_at <= now),
                )
                .order_by(Job.created_at.asc())
                .limit(batch_size)
                .all()
            )
        ]
    finally:
        db.close()

    _increment_metric("broker_dispatch_candidates_total", amount=len(job_ids))

    if not job_ids:
        return 0

    dispatched = 0
    for job_id in job_ids:
        enqueue_result = _enqueue_job_to_broker_if_new(job_id)
        if enqueue_result is True:
            dispatched += 1

    return dispatched


def _claim_job_by_id(job_id: str) -> str | None:
    db = SessionLocal()
    try:
        now = _utcnow_naive()
        pending = (
            db.query(Job)
            .filter(
                Job.id == job_id,
                Job.status == "pending",
                or_(Job.next_attempt_at.is_(None), Job.next_attempt_at <= now),
            )
            .first()
        )
        if pending is None:
            return None

        pending.status = "processing"
        pending.progress = max(1, pending.progress)
        pending.attempt_count = int(pending.attempt_count or 0) + 1
        pending.next_attempt_at = None
        pending.claimed_by = WORKER_INSTANCE_ID
        pending.heartbeat_at = now
        pending.lease_expires_at = now + timedelta(seconds=settings.WORKER_LEASE_SECONDS)
        pending.error = None
        pending.completed_at = None
        pending.updated_at = now
        db.commit()
        _increment_metric("jobs_claimed_total")
        return pending.id
    finally:
        db.close()


def _broker_pop_and_claim_next_job(timeout_seconds: int) -> str | None:
    client = _get_broker_client()
    if client is None:
        time.sleep(max(1, timeout_seconds))
        return None

    try:
        item = client.blpop(_broker_queue_name(), timeout=max(1, timeout_seconds))
    except RedisError as exc:
        logger.warning("Redis broker pop failed: %s", exc)
        time.sleep(max(1, timeout_seconds))
        return None

    if not item:
        return None

    _, job_id = item
    _increment_metric("broker_pops_total")
    try:
        client.srem(_broker_inflight_set_name(), str(job_id))
    except RedisError:
        pass

    claimed_job_id = _claim_job_by_id(str(job_id))
    if claimed_job_id is None:
        _increment_metric("broker_claim_misses_total")
        return None

    _increment_metric("broker_claimed_from_pop_total")
    return claimed_job_id


def _clear_runtime_components() -> None:
    global path_tracer, depth_estimator, denoiser, neural_tracer, video_processor

    path_tracer = None
    depth_estimator = None
    denoiser = None
    neural_tracer = None
    video_processor = None


def _reset_runtime_metrics() -> None:
    global _runtime_started_at

    with _runtime_metrics_lock:
        _runtime_started_at = _utcnow_naive()
        _runtime_metrics["requests_total"] = 0
        _runtime_metrics["requests_in_flight"] = 0
        _runtime_metrics["request_errors_total"] = 0
        _runtime_metrics["request_duration_ms_total"] = 0.0
        _runtime_metrics["request_duration_ms_max"] = 0.0
        _runtime_metrics["slow_requests_total"] = 0
        _runtime_metrics["jobs_claimed_total"] = 0
        _runtime_metrics["jobs_completed_total"] = 0
        _runtime_metrics["jobs_failed_total"] = 0
        _runtime_metrics["jobs_retried_total"] = 0
        _runtime_metrics["stale_jobs_reclaimed_total"] = 0
        _runtime_metrics["broker_dispatch_scans_total"] = 0
        _runtime_metrics["broker_dispatch_candidates_total"] = 0
        _runtime_metrics["broker_enqueue_requests_total"] = 0
        _runtime_metrics["broker_enqueue_added_total"] = 0
        _runtime_metrics["broker_enqueue_deduped_total"] = 0
        _runtime_metrics["broker_enqueue_errors_total"] = 0
        _runtime_metrics["broker_pops_total"] = 0
        _runtime_metrics["broker_claimed_from_pop_total"] = 0
        _runtime_metrics["broker_claim_misses_total"] = 0
        _runtime_metrics["retention_runs_total"] = 0
        _runtime_metrics["retention_jobs_deleted_total"] = 0
        _runtime_metrics["retention_files_deleted_total"] = 0
        _runtime_metrics["requests_by_method"] = {}
        _runtime_metrics["responses_by_status"] = {}


def _increment_metric(metric_name: str, amount: int = 1) -> None:
    with _runtime_metrics_lock:
        current_value = int(_runtime_metrics.get(metric_name, 0))
        updated_value = current_value + amount
        if metric_name == "requests_in_flight":
            updated_value = max(updated_value, 0)
        _runtime_metrics[metric_name] = updated_value


def _increment_grouped_metric(metric_name: str, key: str, amount: int = 1) -> None:
    with _runtime_metrics_lock:
        grouped = _runtime_metrics.get(metric_name)
        if not isinstance(grouped, dict):
            grouped = {}
            _runtime_metrics[metric_name] = grouped

        grouped[key] = int(grouped.get(key, 0)) + amount


def _record_request_observation(duration_ms: float) -> None:
    with _runtime_metrics_lock:
        _runtime_metrics["request_duration_ms_total"] = float(_runtime_metrics["request_duration_ms_total"]) + duration_ms
        _runtime_metrics["request_duration_ms_max"] = max(float(_runtime_metrics["request_duration_ms_max"]), duration_ms)
        if duration_ms >= REQUEST_SLOW_THRESHOLD_MS:
            _runtime_metrics["slow_requests_total"] = int(_runtime_metrics["slow_requests_total"]) + 1


def _build_metrics_payload() -> dict:
    with _runtime_metrics_lock:
        requests_total = int(_runtime_metrics["requests_total"])
        avg_duration_ms = (
            float(_runtime_metrics["request_duration_ms_total"]) / requests_total if requests_total else 0.0
        )
        http_metrics = {
            "requests_total": requests_total,
            "requests_in_flight": int(_runtime_metrics["requests_in_flight"]),
            "request_errors_total": int(_runtime_metrics["request_errors_total"]),
            "slow_requests_total": int(_runtime_metrics["slow_requests_total"]),
            "avg_request_duration_ms": round(avg_duration_ms, 3),
            "max_request_duration_ms": round(float(_runtime_metrics["request_duration_ms_max"]), 3),
            "requests_by_method": dict(_runtime_metrics["requests_by_method"]),
            "responses_by_status": dict(_runtime_metrics["responses_by_status"]),
        }
        jobs_metrics = {
            "jobs_claimed_total": int(_runtime_metrics["jobs_claimed_total"]),
            "jobs_completed_total": int(_runtime_metrics["jobs_completed_total"]),
            "jobs_failed_total": int(_runtime_metrics["jobs_failed_total"]),
            "jobs_retried_total": int(_runtime_metrics["jobs_retried_total"]),
            "stale_jobs_reclaimed_total": int(_runtime_metrics["stale_jobs_reclaimed_total"]),
        }
        broker_metrics = {
            "dispatch_scans_total": int(_runtime_metrics["broker_dispatch_scans_total"]),
            "dispatch_candidates_total": int(_runtime_metrics["broker_dispatch_candidates_total"]),
            "enqueue_requests_total": int(_runtime_metrics["broker_enqueue_requests_total"]),
            "enqueue_added_total": int(_runtime_metrics["broker_enqueue_added_total"]),
            "enqueue_deduped_total": int(_runtime_metrics["broker_enqueue_deduped_total"]),
            "enqueue_errors_total": int(_runtime_metrics["broker_enqueue_errors_total"]),
            "pops_total": int(_runtime_metrics["broker_pops_total"]),
            "claimed_from_pop_total": int(_runtime_metrics["broker_claimed_from_pop_total"]),
            "claim_misses_total": int(_runtime_metrics["broker_claim_misses_total"]),
        }
        maintenance_metrics = {
            "retention_runs_total": int(_runtime_metrics["retention_runs_total"]),
            "retention_jobs_deleted_total": int(_runtime_metrics["retention_jobs_deleted_total"]),
            "retention_files_deleted_total": int(_runtime_metrics["retention_files_deleted_total"]),
            "retention_cleanup_enabled": _should_run_retention_cleanup(),
        }

    uptime_seconds = max(0, int((_utcnow_naive() - _runtime_started_at).total_seconds()))
    worker_running = queue_worker_task is not None and not queue_worker_task.done()
    broker_snapshot = _broker_runtime_snapshot()
    return {
        "uptime_seconds": uptime_seconds,
        "worker": {
            "instance_id": WORKER_INSTANCE_ID,
            "running": worker_running,
            "embedded_enabled": _should_run_embedded_queue_worker(),
            "queue_backend": _queue_backend(),
            "broker": broker_snapshot,
        },
        "http": http_metrics,
        "jobs": jobs_metrics,
        "broker": broker_metrics,
        "maintenance": maintenance_metrics,
    }


class _MockDepthEstimator:
    def estimate(self, image: np.ndarray, target_size=None) -> np.ndarray:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
        depth = cv2.GaussianBlur(gray, (0, 0), sigmaX=3)
        if target_size is not None:
            depth = cv2.resize(depth, (target_size[1], target_size[0]), interpolation=cv2.INTER_LINEAR)
        return depth.astype(np.float32)


class _MockPathTracer:
    def __init__(self):
        self._image = None

    def load_scene(self, depth_map: np.ndarray, albedo: np.ndarray | None = None):
        self._image = albedo

    def trace_paths(self, config: RenderConfig) -> np.ndarray:
        if self._image is None:
            raise ValueError("Scene was not loaded before trace")
        alpha = max(0.1, min(float(config.exposure), 3.0))
        boosted = cv2.convertScaleAbs(self._image, alpha=alpha, beta=8)
        return cv2.bilateralFilter(boosted, 7, 40, 40)


class _MockDenoiser:
    def denoise(self, noisy_image: np.ndarray, *args, **kwargs) -> np.ndarray:
        if noisy_image.dtype != np.uint8:
            noisy_image = (np.clip(noisy_image, 0, 1) * 255).astype(np.uint8)
        return cv2.bilateralFilter(noisy_image, 7, 40, 40)


class _MockNeuralTracer(torch.nn.Module):
    def forward(self, depth: torch.Tensor, albedo: torch.Tensor | None = None) -> torch.Tensor:
        if albedo is None:
            return depth.repeat(1, 3, 1, 1)
        return albedo


def _initialize_runtime_components() -> None:
    global path_tracer, depth_estimator, denoiser, neural_tracer, video_processor

    if settings.SKIP_MODEL_LOAD:
        logger.warning("SKIP_MODEL_LOAD enabled: starting with lightweight mock pipeline")
        path_tracer = _MockPathTracer()
        depth_estimator = _MockDepthEstimator()
        denoiser = _MockDenoiser()
        neural_tracer = _MockNeuralTracer()
        video_processor = VideoProcessor()
        return

    from core.depth_estimator import DepthEstimator

    path_tracer = PathTracerCore()
    depth_estimator = DepthEstimator()
    denoiser = OptixAIDenoiser()
    neural_tracer = NeuralPathTracer().cuda() if torch.cuda.is_available() else NeuralPathTracer()
    video_processor = VideoProcessor()


async def _startup_runtime() -> None:
    global queue_worker_task, retention_cleanup_task, queue_stop_event, queue_wakeup_event

    _reset_runtime_metrics()
    _validate_runtime_configuration()
    _validate_database_schema()

    logger.info("Initializing LumiTrace backend")
    if torch.cuda.is_available():
        device_name = torch.cuda.get_device_name(0)
        logger.info("GPU detected: %s", device_name)
        logger.info("CUDA Version: %s", torch.version.cuda)
        logger.info("VRAM: %.2f GB", torch.cuda.get_device_properties(0).total_memory / 1e9)
    else:
        logger.warning("No GPU detected, using CPU fallback")

    try:
        _clear_runtime_components()
        if _should_load_render_models():
            _initialize_runtime_components()
        else:
            logger.info("LOAD_RENDER_MODELS_ON_STARTUP disabled: skipping model initialization")

        OUTPUT_DIR_PATH.mkdir(exist_ok=True)
        TEMP_DIR_PATH.mkdir(exist_ok=True)

        run_queue_worker = _should_run_embedded_queue_worker()
        run_retention_cleanup = _should_run_retention_cleanup()
        queue_backend = _queue_backend()

        if run_queue_worker:
            _requeue_inflight_jobs()
            if queue_backend == "redis":
                dispatched = await asyncio.to_thread(_dispatch_due_jobs_to_broker)
                if dispatched:
                    logger.info("Seeded Redis broker queue with %d due job(s)", dispatched)

        if run_queue_worker or run_retention_cleanup:
            queue_stop_event = asyncio.Event()
            queue_wakeup_event = asyncio.Event()
        else:
            queue_stop_event = None
            queue_wakeup_event = None

        if run_queue_worker:
            if queue_backend == "redis":
                queue_worker_task = asyncio.create_task(_broker_worker_loop(), name="lumitrace-broker-worker")
            else:
                queue_worker_task = asyncio.create_task(_queue_worker_loop(), name="lumitrace-worker")
        else:
            queue_worker_task = None
            logger.info("RUN_QUEUE_WORKER_IN_API disabled: API process will not execute queue jobs")

        if run_retention_cleanup:
            retention_cleanup_task = asyncio.create_task(
                _retention_cleanup_loop(),
                name="lumitrace-retention-cleanup",
            )
        else:
            retention_cleanup_task = None
            logger.info("RUN_RETENTION_CLEANUP_IN_API disabled: retention loop not started in API process")

        logger.info("Runtime initialized successfully")
    except Exception as exc:
        logger.exception("Runtime initialization failed: %s", exc)
        raise


async def _shutdown_runtime() -> None:
    global queue_worker_task, retention_cleanup_task, queue_stop_event, queue_wakeup_event

    if queue_stop_event is not None:
        queue_stop_event.set()
    if queue_wakeup_event is not None:
        queue_wakeup_event.set()

    if queue_worker_task is not None:
        try:
            await asyncio.wait_for(queue_worker_task, timeout=15)
        except asyncio.TimeoutError:
            queue_worker_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await queue_worker_task
        finally:
            queue_worker_task = None

    if retention_cleanup_task is not None:
        try:
            await asyncio.wait_for(retention_cleanup_task, timeout=15)
        except asyncio.TimeoutError:
            retention_cleanup_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await retention_cleanup_task
        finally:
            retention_cleanup_task = None

    _close_broker_client()
    queue_stop_event = None
    queue_wakeup_event = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    await _startup_runtime()
    try:
        yield
    finally:
        await _shutdown_runtime()


app = FastAPI(
    title="LumiTrace API",
    description="AI-Powered Path Tracing as a Service",
    version="1.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def observability_middleware(request: Request, call_next):
    request_id = uuid.uuid4().hex
    started = time.perf_counter()

    _increment_metric("requests_total")
    _increment_metric("requests_in_flight")
    _increment_grouped_metric("requests_by_method", request.method.upper())

    response = None
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        return response
    except Exception:
        _increment_metric("request_errors_total")
        logger.exception("Unhandled request failure request_id=%s path=%s", request_id, request.url.path)
        raise
    finally:
        duration_ms = (time.perf_counter() - started) * 1000
        _record_request_observation(duration_ms)
        _increment_grouped_metric("responses_by_status", str(status_code))
        _increment_metric("requests_in_flight", amount=-1)

        if settings.REQUEST_LOGGING_ENABLED:
            if duration_ms >= REQUEST_SLOW_THRESHOLD_MS:
                logger.warning(
                    "Slow request request_id=%s method=%s path=%s status=%s duration_ms=%.2f",
                    request_id,
                    request.method,
                    request.url.path,
                    status_code,
                    duration_ms,
                )
            else:
                logger.info(
                    "Request request_id=%s method=%s path=%s status=%s duration_ms=%.2f",
                    request_id,
                    request.method,
                    request.url.path,
                    status_code,
                    duration_ms,
                )

        if response is not None:
            response.headers["X-Request-Id"] = request_id


app.include_router(auth_router, prefix="/auth")
app.include_router(auth_router, prefix=f"{settings.API_V1_STR}/auth")
app.include_router(utility_router)
app.include_router(utility_router, prefix=settings.API_V1_STR)


@app.get("/")
async def root():
    return {
        "status": "online",
        "service": "LumiTrace API",
        "environment": settings.ENVIRONMENT,
        "gpu": torch.cuda.is_available(),
        "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
    }


@app.get("/health")
async def health_check(db: Session = Depends(get_db)):
    db_ok = True
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db_ok = False

    broker_snapshot = _broker_runtime_snapshot()
    broker_ok = (not broker_snapshot["enabled"]) or bool(broker_snapshot["available"])
    worker_expected = _should_run_embedded_queue_worker()
    worker_running = queue_worker_task is not None and not queue_worker_task.done()
    worker_ok = (not worker_expected) or worker_running
    retention_expected = _should_run_retention_cleanup()
    retention_running = retention_cleanup_task is not None and not retention_cleanup_task.done()
    retention_ok = (not retention_expected) or retention_running
    return {
        "status": "healthy" if db_ok and broker_ok and worker_ok and retention_ok else "degraded",
        "gpu_available": torch.cuda.is_available(),
        "models_loaded": all(
            [
                path_tracer is not None,
                depth_estimator is not None,
                denoiser is not None,
                neural_tracer is not None,
            ]
        ),
        "database": db_ok,
        "worker_running": worker_running,
        "embedded_worker_enabled": worker_expected,
        "queue_backend": _queue_backend(),
        "broker_enabled": broker_snapshot["enabled"],
        "broker_available": broker_snapshot["available"],
        "broker_queue_depth": broker_snapshot["queue_depth"],
        "broker_inflight_jobs": broker_snapshot["inflight_jobs"],
        "retention_cleanup_enabled": retention_expected,
        "retention_running": retention_running,
        "model_loading_enabled": _should_load_render_models(),
    }


@app.get("/metrics")
async def get_metrics(db: Session = Depends(get_db)):
    queue_counts = dict(db.query(Job.status, func.count(Job.id)).group_by(Job.status).all())
    payload = _build_metrics_payload()
    payload["queue"] = {
        "queued_jobs": int(queue_counts.get("pending", 0)),
        "active_jobs": int(queue_counts.get("processing", 0)),
        "completed_jobs": int(queue_counts.get("completed", 0)),
        "failed_jobs": int(queue_counts.get("failed", 0)),
    }
    return payload


@app.post("/process/image", response_model=ProcessResponse)
async def process_image(
    file: UploadFile = File(...),
    samples: int = Form(default=64, ge=16, le=512),
    max_bounces: int = Form(default=4, ge=1, le=16),
    use_denoising: bool = Form(default=True),
    use_neural: bool = Form(default=False),
    exposure: float = Form(default=1.0, ge=0.1, le=3.0),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    if current_user is None and not settings.ALLOW_ANONYMOUS_JOBS:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File must be an image")

    file_bytes = await file.read()
    if len(file_bytes) > settings.MAX_FILE_SIZE:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File exceeds max size")

    job_id = str(uuid.uuid4())
    _persist_input_file(job_id=job_id, media_type="image", original_filename=file.filename, file_bytes=file_bytes)

    job = Job(
        id=job_id,
        user_id=current_user.id if current_user else None,
        status="pending",
        progress=0,
        attempt_count=0,
        max_attempts=settings.WORKER_MAX_ATTEMPTS,
        next_attempt_at=_utcnow_naive(),
        media_type="image",
        input_filename=file.filename,
        input_content_type=file.content_type,
        samples=samples,
        max_bounces=max_bounces,
        use_denoising=use_denoising,
        use_neural=use_neural,
        exposure=exposure,
    )
    db.add(job)
    db.commit()

    if _should_use_redis_broker():
        await asyncio.to_thread(_dispatch_job_to_broker, job_id)
    else:
        _wake_worker()
    return ProcessResponse(job_id=job_id, status="queued", message="Image job queued")


@app.post("/process/video", response_model=ProcessResponse)
async def process_video(
    file: UploadFile = File(...),
    samples: int = Form(default=32, ge=16, le=512),
    max_bounces: int = Form(default=4, ge=1, le=16),
    use_denoising: bool = Form(default=True),
    fps: int | None = Form(default=None, ge=1, le=240),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    if current_user is None and not settings.ALLOW_ANONYMOUS_JOBS:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    if not (file.content_type or "").startswith("video/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File must be a video")

    file_bytes = await file.read()
    if len(file_bytes) > settings.MAX_FILE_SIZE:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File exceeds max size")

    job_id = str(uuid.uuid4())
    _persist_input_file(job_id=job_id, media_type="video", original_filename=file.filename, file_bytes=file_bytes)
    _write_job_manifest(job_id, {"fps": fps})

    job = Job(
        id=job_id,
        user_id=current_user.id if current_user else None,
        status="pending",
        progress=0,
        attempt_count=0,
        max_attempts=settings.WORKER_MAX_ATTEMPTS,
        next_attempt_at=_utcnow_naive(),
        media_type="video",
        input_filename=file.filename,
        input_content_type=file.content_type,
        samples=samples,
        max_bounces=max_bounces,
        use_denoising=use_denoising,
        use_neural=False,
        exposure=1.0,
    )
    db.add(job)
    db.commit()

    if _should_use_redis_broker():
        await asyncio.to_thread(_dispatch_job_to_broker, job_id)
    else:
        _wake_worker()
    return ProcessResponse(job_id=job_id, status="queued", message="Video job queued")


@app.get("/status/{job_id}")
async def get_status(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    _validate_job_access(job, current_user.id if current_user else None)
    queue_position = _compute_queue_position(db, job)
    return _serialize_job_status(job, queue_position)


@app.websocket("/ws/jobs/{job_id}")
async def stream_status(job_id: str, websocket: WebSocket):
    token = websocket.query_params.get("token")
    current_user_id = _resolve_user_id_from_token(token)
    await websocket.accept()

    last_payload = None
    while True:
        job = _get_job_snapshot(job_id)
        if job is None:
            await websocket.send_json({"detail": "Job not found"})
            await websocket.close(code=4404)
            return

        try:
            _validate_job_access(job, current_user_id)
        except HTTPException:
            await websocket.send_json({"detail": "Not authorized for this job"})
            await websocket.close(code=4403)
            return

        queue_position = _compute_queue_position_for_job_id(job.id)
        payload = _serialize_job_status(job, queue_position)
        if payload != last_payload:
            try:
                await websocket.send_json(payload)
            except WebSocketDisconnect:
                return
            last_payload = payload

        if payload["status"] in {"completed", "failed"}:
            await websocket.close(code=1000)
            return

        try:
            await asyncio.wait_for(websocket.receive_text(), timeout=WEBSOCKET_POLL_SECONDS)
        except asyncio.TimeoutError:
            continue
        except WebSocketDisconnect:
            return


@app.get("/jobs", response_model=list[JobSummary])
async def list_jobs(
    limit: int = 25,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    capped_limit = min(max(limit, 1), 100)
    jobs = (
        db.query(Job)
        .filter(Job.user_id == current_user.id)
        .order_by(Job.created_at.desc())
        .limit(capped_limit)
        .all()
    )
    return [JobSummary.model_validate(item) for item in jobs]


@app.delete("/jobs/{job_id}")
async def delete_job(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    if job.output_path and os.path.exists(job.output_path):
        os.remove(job.output_path)

    input_path = _job_input_path(job.id, job.media_type, job.input_filename)
    _cleanup_job_inputs(job.id, input_path)

    db.delete(job)
    db.commit()
    return {"status": "deleted", "job_id": job_id}


@app.get("/download/{job_id}")
async def download_result(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    _validate_job_access(job, current_user.id if current_user else None)

    if job.status != "completed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Job not completed yet")

    if not job.output_path or not os.path.exists(job.output_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Output file not found")

    media_type = "video/mp4" if job.media_type == "video" else "image/png"
    return FileResponse(
        job.output_path,
        media_type=media_type,
        filename=os.path.basename(job.output_path),
    )


def _validate_job_access(job: Job, current_user_id: str | None) -> None:
    if job.user_id and current_user_id != job.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this job")


def _resolve_user_id_from_token(token: str | None) -> str | None:
    if not token:
        return None

    subject = decode_access_token(token)
    if not subject:
        return None

    db = SessionLocal()
    try:
        user_id = (
            db.query(User.id)
            .filter(User.id == subject, User.is_active.is_(True))
            .scalar()
        )
        return str(user_id) if user_id else None
    finally:
        db.close()


def _serialize_job_status(job: Job, queue_position: int | None = None) -> dict:
    return {
        "job_id": job.id,
        "status": job.status,
        "progress": job.progress,
        "attempt_count": job.attempt_count,
        "max_attempts": job.max_attempts,
        "error": job.error,
        "output_url": f"/download/{job.id}" if job.status == "completed" and job.output_path else None,
        "media_type": job.media_type,
        "queue_position": queue_position,
    }


def _compute_queue_position(db: Session, job: Job) -> int | None:
    if job.status != "pending":
        return None

    position = (
        db.query(func.count(Job.id))
        .filter(Job.status == "pending", Job.created_at <= job.created_at)
        .scalar()
    )
    return int(position or 0)


def _compute_queue_position_for_job_id(job_id: str) -> int | None:
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if job is None:
            return None
        return _compute_queue_position(db, job)
    finally:
        db.close()


def _get_job_snapshot(job_id: str) -> Job | None:
    db = SessionLocal()
    try:
        return db.query(Job).filter(Job.id == job_id).first()
    finally:
        db.close()


def _job_input_path(job_id: str, media_type: str, original_filename: str | None) -> Path:
    suffix = (Path(original_filename).suffix if original_filename else "").lower()
    if not suffix or len(suffix) > 12 or any(ch for ch in suffix if not (ch.isalnum() or ch == ".")):
        suffix = ".mp4" if media_type == "video" else ".bin"
    return TEMP_DIR_PATH / f"{job_id}_input{suffix}"


def _job_manifest_path(job_id: str) -> Path:
    return TEMP_DIR_PATH / f"{job_id}_meta.json"


def _persist_input_file(job_id: str, media_type: str, original_filename: str | None, file_bytes: bytes) -> Path:
    input_path = _job_input_path(job_id, media_type, original_filename)
    input_path.parent.mkdir(exist_ok=True)
    with open(input_path, "wb") as input_file:
        input_file.write(file_bytes)
    return input_path


def _write_job_manifest(job_id: str, payload: dict) -> None:
    manifest_path = _job_manifest_path(job_id)
    with open(manifest_path, "w", encoding="utf-8") as manifest_file:
        json.dump(payload, manifest_file)


def _read_job_manifest(job_id: str) -> dict:
    manifest_path = _job_manifest_path(job_id)
    if not manifest_path.exists():
        return {}

    try:
        with open(manifest_path, "r", encoding="utf-8") as manifest_file:
            return json.load(manifest_file)
    except Exception:
        return {}


def _cleanup_job_inputs(job_id: str, input_path: Path) -> None:
    if input_path.exists():
        input_path.unlink(missing_ok=True)

    manifest_path = _job_manifest_path(job_id)
    if manifest_path.exists():
        manifest_path.unlink(missing_ok=True)


def _unlink_file(path_value: str | Path | None) -> int:
    if path_value is None:
        return 0

    path = Path(path_value)
    if not path.exists() or not path.is_file():
        return 0

    try:
        path.unlink(missing_ok=True)
        return 1
    except Exception as exc:
        logger.warning("Failed to remove file %s: %s", path, exc)
        return 0


def _cleanup_expired_jobs() -> tuple[int, int]:
    db = SessionLocal()
    jobs_deleted = 0
    files_deleted = 0
    try:
        cutoff = _utcnow_naive() - timedelta(hours=JOB_RETENTION_HOURS)
        expired_jobs = (
            db.query(Job)
            .filter(
                Job.status.in_(("completed", "failed")),
                Job.completed_at.is_not(None),
                Job.completed_at < cutoff,
            )
            .all()
        )

        for job in expired_jobs:
            files_deleted += _unlink_file(job.output_path)
            files_deleted += _unlink_file(_job_input_path(job.id, job.media_type, job.input_filename))
            files_deleted += _unlink_file(_job_manifest_path(job.id))
            db.delete(job)
            jobs_deleted += 1

        if jobs_deleted:
            db.commit()
            logger.info(
                "Retention cleanup removed %d expired job(s) and %d file(s)",
                jobs_deleted,
                files_deleted,
            )

        return jobs_deleted, files_deleted
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
        _increment_metric("retention_runs_total")
        if jobs_deleted:
            _increment_metric("retention_jobs_deleted_total", amount=jobs_deleted)
        if files_deleted:
            _increment_metric("retention_files_deleted_total", amount=files_deleted)


def _clear_job_lease(job: Job) -> None:
    job.lease_expires_at = None
    job.heartbeat_at = None
    job.claimed_by = None


def _update_job(job_id: str, **updates):
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            return

        previous_status = job.status

        for key, value in updates.items():
            setattr(job, key, value)

        now = _utcnow_naive()
        job.updated_at = now

        if updates.get("status") in {"completed", "failed"}:
            job.completed_at = now
            _clear_job_lease(job)
            if updates.get("status") == "completed":
                job.next_attempt_at = None
        elif updates.get("status") == "pending":
            _clear_job_lease(job)
            job.completed_at = None
        elif updates.get("status") == "processing":
            job.completed_at = None
            job.heartbeat_at = now
            job.lease_expires_at = now + timedelta(seconds=settings.WORKER_LEASE_SECONDS)
            if not job.claimed_by:
                job.claimed_by = WORKER_INSTANCE_ID
        elif job.status == "processing":
            job.heartbeat_at = now
            job.lease_expires_at = now + timedelta(seconds=settings.WORKER_LEASE_SECONDS)

        status_update = updates.get("status")
        if status_update == "completed" and previous_status != "completed":
            _increment_metric("jobs_completed_total")
        elif status_update == "failed" and previous_status != "failed":
            _increment_metric("jobs_failed_total")

        db.commit()
    finally:
        db.close()


def _compute_retry_delay_seconds(attempt_count: int) -> int:
    base_delay = max(1, int(settings.WORKER_RETRY_BACKOFF_SECONDS))
    max_delay = max(base_delay, int(settings.WORKER_RETRY_BACKOFF_MAX_SECONDS))
    exponent = max(0, attempt_count - 1)
    return min(base_delay * (2 ** exponent), max_delay)


def _mark_job_retry_or_failed(job_id: str, error_message: str) -> bool:
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if job is None:
            return False

        now = _utcnow_naive()
        _clear_job_lease(job)
        job.updated_at = now

        attempt_count = int(job.attempt_count or 0)
        max_attempts = int(job.max_attempts or settings.WORKER_MAX_ATTEMPTS)

        if attempt_count < max_attempts:
            retry_delay_seconds = _compute_retry_delay_seconds(attempt_count)
            job.status = "pending"
            job.progress = 0
            job.error = f"Attempt {attempt_count} failed: {error_message}"
            job.next_attempt_at = now + timedelta(seconds=retry_delay_seconds)
            job.completed_at = None
            db.commit()
            _increment_metric("jobs_retried_total")
            logger.warning(
                "Job %s attempt %d/%d failed, retrying in %d second(s)",
                job_id,
                attempt_count,
                max_attempts,
                retry_delay_seconds,
            )
            if not _should_use_redis_broker():
                _wake_worker()
            return True

        job.status = "failed"
        job.progress = 0
        job.error = error_message
        job.next_attempt_at = None
        job.completed_at = now
        db.commit()
        _increment_metric("jobs_failed_total")
        return False
    finally:
        db.close()


def _requeue_inflight_jobs() -> None:
    db = SessionLocal()
    try:
        stale_jobs = db.query(Job).filter(Job.status == "processing").all()
        recovered_jobs = 0
        failed_jobs = 0
        now = _utcnow_naive()

        for job in stale_jobs:
            _clear_job_lease(job)
            job.updated_at = now
            if int(job.attempt_count or 0) < int(job.max_attempts or settings.WORKER_MAX_ATTEMPTS):
                job.status = "pending"
                job.progress = 0
                job.error = None
                job.next_attempt_at = now
                job.completed_at = None
                recovered_jobs += 1
            else:
                job.status = "failed"
                job.error = job.error or "Exceeded max attempts during startup recovery"
                job.next_attempt_at = None
                job.completed_at = now
                failed_jobs += 1

        if stale_jobs:
            db.commit()
            logger.warning(
                "Recovered %d in-flight job(s); marked %d as failed due to exhausted retries",
                recovered_jobs,
                failed_jobs,
            )
            if _should_use_redis_broker() and recovered_jobs:
                _dispatch_due_jobs_to_broker(limit=recovered_jobs)
    finally:
        db.close()


def _requeue_stale_processing_jobs() -> int:
    db = SessionLocal()
    try:
        now = _utcnow_naive()
        stale_jobs = (
            db.query(Job)
            .filter(
                Job.status == "processing",
                or_(Job.lease_expires_at.is_(None), Job.lease_expires_at < now),
            )
            .all()
        )

        reclaimed = 0
        for job in stale_jobs:
            _clear_job_lease(job)
            job.updated_at = now
            if int(job.attempt_count or 0) < int(job.max_attempts or settings.WORKER_MAX_ATTEMPTS):
                job.status = "pending"
                job.progress = 0
                job.next_attempt_at = now
                job.error = job.error or "Recovered stale worker lease"
            else:
                job.status = "failed"
                job.next_attempt_at = None
                job.completed_at = now
                job.error = job.error or "Worker lease expired and retry budget was exhausted"
            reclaimed += 1

        if reclaimed:
            db.commit()
            _increment_metric("stale_jobs_reclaimed_total", amount=reclaimed)
            logger.warning("Reclaimed %d stale processing job lease(s)", reclaimed)
            if _should_use_redis_broker():
                _dispatch_due_jobs_to_broker(limit=reclaimed)

        return reclaimed
    finally:
        db.close()


def _claim_next_pending_job() -> str | None:
    db = SessionLocal()
    try:
        now = _utcnow_naive()
        pending = (
            db.query(Job)
            .filter(
                Job.status == "pending",
                or_(Job.next_attempt_at.is_(None), Job.next_attempt_at <= now),
            )
            .order_by(Job.created_at.asc())
            .first()
        )
        if pending is None:
            return None

        pending.status = "processing"
        pending.progress = max(1, pending.progress)
        pending.attempt_count = int(pending.attempt_count or 0) + 1
        pending.next_attempt_at = None
        pending.claimed_by = WORKER_INSTANCE_ID
        pending.heartbeat_at = now
        pending.lease_expires_at = now + timedelta(seconds=settings.WORKER_LEASE_SECONDS)
        pending.error = None
        pending.completed_at = None
        pending.updated_at = now
        db.commit()
        _increment_metric("jobs_claimed_total")
        return pending.id
    finally:
        db.close()


def _touch_job_heartbeat(job_id: str, worker_id: str) -> None:
    db = SessionLocal()
    try:
        now = _utcnow_naive()
        job = (
            db.query(Job)
            .filter(Job.id == job_id, Job.status == "processing", Job.claimed_by == worker_id)
            .first()
        )
        if job is None:
            return

        job.heartbeat_at = now
        job.lease_expires_at = now + timedelta(seconds=settings.WORKER_LEASE_SECONDS)
        job.updated_at = now
        db.commit()
    finally:
        db.close()


def _wake_worker() -> None:
    if queue_wakeup_event is not None:
        queue_wakeup_event.set()


async def _job_heartbeat_loop(job_id: str, worker_id: str) -> None:
    while queue_stop_event is None or not queue_stop_event.is_set():
        await asyncio.sleep(WORKER_HEARTBEAT_SECONDS)
        await asyncio.to_thread(_touch_job_heartbeat, job_id, worker_id)


async def _retention_cleanup_loop() -> None:
    logger.info(
        "Retention cleanup loop started (interval=%ss, ttl=%sh)",
        RETENTION_CLEANUP_INTERVAL_SECONDS,
        JOB_RETENTION_HOURS,
    )
    while queue_stop_event is None or not queue_stop_event.is_set():
        try:
            await asyncio.to_thread(_cleanup_expired_jobs)
        except Exception as exc:
            logger.exception("Retention cleanup run failed: %s", exc)

        if queue_stop_event is None:
            await asyncio.sleep(RETENTION_CLEANUP_INTERVAL_SECONDS)
            continue

        try:
            await asyncio.wait_for(
                queue_stop_event.wait(),
                timeout=RETENTION_CLEANUP_INTERVAL_SECONDS,
            )
        except asyncio.TimeoutError:
            continue
    logger.info("Retention cleanup loop stopped")


async def _broker_worker_loop() -> None:
    logger.info("Redis broker worker started queue=%s", _broker_queue_name())
    next_stale_scan_at = _utcnow_naive()
    next_dispatch_scan_at = _utcnow_naive()

    while queue_stop_event is not None and not queue_stop_event.is_set():
        now = _utcnow_naive()
        if now >= next_stale_scan_at:
            _requeue_stale_processing_jobs()
            next_stale_scan_at = now + timedelta(seconds=WORKER_STALE_SCAN_SECONDS)

        if now >= next_dispatch_scan_at:
            await asyncio.to_thread(_dispatch_due_jobs_to_broker)
            next_dispatch_scan_at = now + timedelta(seconds=max(1, int(settings.BROKER_DISPATCH_SCAN_SECONDS)))

        claimed_job_id = await asyncio.to_thread(
            _broker_pop_and_claim_next_job,
            max(1, int(settings.BROKER_BLOCKING_POP_TIMEOUT_SECONDS)),
        )
        if claimed_job_id is not None:
            await _execute_job(claimed_job_id)

    logger.info("Redis broker worker stopped")


async def _queue_worker_loop() -> None:
    logger.info("Queue worker started")
    next_stale_scan_at = _utcnow_naive()

    while queue_stop_event is not None and not queue_stop_event.is_set():
        now = _utcnow_naive()
        if now >= next_stale_scan_at:
            _requeue_stale_processing_jobs()
            next_stale_scan_at = now + timedelta(seconds=WORKER_STALE_SCAN_SECONDS)

        claimed_job_id = _claim_next_pending_job()
        if claimed_job_id is not None:
            await _execute_job(claimed_job_id)
            continue

        if queue_wakeup_event is None:
            await asyncio.sleep(WORKER_IDLE_SLEEP_SECONDS)
            continue

        try:
            await asyncio.wait_for(queue_wakeup_event.wait(), timeout=WORKER_IDLE_SLEEP_SECONDS)
        except asyncio.TimeoutError:
            pass
        finally:
            queue_wakeup_event.clear()

    logger.info("Queue worker stopped")


def _load_job_record(job_id: str) -> dict | None:
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if job is None:
            return None

        return {
            "id": job.id,
            "media_type": job.media_type,
            "input_filename": job.input_filename,
            "samples": job.samples,
            "max_bounces": job.max_bounces,
            "use_denoising": job.use_denoising,
            "use_neural": job.use_neural,
            "exposure": job.exposure,
            "claimed_by": job.claimed_by,
        }
    finally:
        db.close()


async def _execute_job(job_id: str) -> None:
    job = _load_job_record(job_id)
    if job is None:
        return

    if job.get("claimed_by") != WORKER_INSTANCE_ID:
        logger.warning("Skipping job %s claim because it belongs to %s", job_id, job.get("claimed_by"))
        return

    heartbeat_task = asyncio.create_task(
        _job_heartbeat_loop(job["id"], WORKER_INSTANCE_ID),
        name=f"heartbeat-{job['id']}",
    )
    try:
        if job["media_type"] == "image":
            await asyncio.to_thread(
                _process_image_task,
                job["id"],
                job["input_filename"],
                job["samples"],
                job["max_bounces"],
                job["use_denoising"],
                job["use_neural"],
                job["exposure"],
            )
            return

        if job["media_type"] == "video":
            manifest = _read_job_manifest(job["id"])
            fps_value = manifest.get("fps")
            fps = int(fps_value) if isinstance(fps_value, int) else None
            await _process_video_task(
                job["id"],
                job["input_filename"],
                job["samples"],
                job["max_bounces"],
                job["use_denoising"],
                fps,
            )
            return

        _mark_job_retry_or_failed(job_id, f"Unsupported media type: {job['media_type']}")
    finally:
        heartbeat_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await heartbeat_task


def _process_image_task(
    job_id: str,
    input_filename: str | None,
    samples: int,
    max_bounces: int,
    use_denoising: bool,
    use_neural: bool,
    exposure: float,
):
    input_path = _job_input_path(job_id, "image", input_filename)
    should_cleanup_inputs = False

    try:
        if not input_path.exists():
            raise ValueError("Input image file was not found")

        _update_job(job_id, status="processing", progress=5)
        file_bytes = input_path.read_bytes()
        nparr = np.frombuffer(file_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("Failed to decode image")

        _update_job(job_id, progress=20)
        depth = depth_estimator.estimate(image)
        _update_job(job_id, progress=50)

        if use_neural:
            result = _neural_render(image, depth)
        else:
            config = RenderConfig(
                samples_per_pixel=samples,
                max_bounces=max_bounces,
                resolution=(image.shape[1], image.shape[0]),
                use_denoising=use_denoising,
                exposure=exposure,
            )
            path_tracer.load_scene(depth, image)
            result = path_tracer.trace_paths(config)
            if use_denoising:
                result = denoiser.denoise(result)

        _update_job(job_id, progress=90)

        output_dir = OUTPUT_DIR_PATH
        output_dir.mkdir(exist_ok=True)
        output_path = output_dir / f"{job_id}.png"

        if not cv2.imwrite(str(output_path), result):
            raise ValueError("Failed to write output image")

        _update_job(job_id, status="completed", progress=100, output_path=str(output_path), error=None)
        should_cleanup_inputs = True
    except Exception as exc:
        logger.exception("Image job %s failed: %s", job_id, exc)
        should_retry = _mark_job_retry_or_failed(job_id, str(exc))
        should_cleanup_inputs = not should_retry
    finally:
        if should_cleanup_inputs:
            _cleanup_job_inputs(job_id, input_path)


async def _process_video_task(
    job_id: str,
    input_filename: str | None,
    samples: int,
    max_bounces: int,
    use_denoising: bool,
    fps: int | None,
):
    input_path = _job_input_path(job_id, "video", input_filename)
    should_cleanup_inputs = False

    try:
        if not input_path.exists():
            raise ValueError("Input video file was not found")

        _update_job(job_id, status="processing", progress=5)

        output_dir = OUTPUT_DIR_PATH
        output_dir.mkdir(exist_ok=True)
        output_path = output_dir / f"{job_id}_path_traced.mp4"

        await video_processor.process(
            str(input_path),
            str(output_path),
            depth_estimator,
            path_tracer,
            denoiser if use_denoising else None,
            samples,
            max_bounces,
            fps,
            lambda p: _update_job(job_id, progress=max(5, min(99, int(p * 100)))),
        )

        _update_job(job_id, status="completed", progress=100, output_path=str(output_path), error=None)
        should_cleanup_inputs = True
    except Exception as exc:
        logger.exception("Video job %s failed: %s", job_id, exc)
        should_retry = _mark_job_retry_or_failed(job_id, str(exc))
        should_cleanup_inputs = not should_retry
    finally:
        if should_cleanup_inputs:
            _cleanup_job_inputs(job_id, input_path)


def _neural_render(image: np.ndarray, depth: np.ndarray) -> np.ndarray:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    depth_tensor = torch.from_numpy(depth).unsqueeze(0).unsqueeze(0).float().to(device)
    image_tensor = torch.from_numpy(image).permute(2, 0, 1).unsqueeze(0).float().to(device) / 255.0

    model = neural_tracer.to(device) if hasattr(neural_tracer, "to") else neural_tracer
    with torch.no_grad():
        output = model(depth_tensor, image_tensor)

    result = output.squeeze(0).permute(1, 2, 0).cpu().numpy() * 255.0
    return np.clip(result, 0, 255).astype(np.uint8)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
