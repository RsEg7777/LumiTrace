from datetime import UTC, datetime, timedelta
from pathlib import Path
import uuid

import app.main as main_module
from app.db import SessionLocal
from app.models import Job


def _utcnow_naive() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


async def test_metrics_endpoint_includes_runtime_sections(client):
    response = await client.get('/metrics')
    assert response.status_code == 200
    assert response.headers.get('x-request-id')

    payload = response.json()
    assert isinstance(payload.get('uptime_seconds'), int)
    assert payload['worker']['instance_id']
    assert isinstance(payload['worker']['running'], bool)

    for section in ('http', 'jobs', 'broker', 'maintenance', 'queue'):
        assert section in payload


async def test_metrics_include_broker_snapshot_when_redis_enabled(client, monkeypatch):
    monkeypatch.setattr(main_module.settings, 'WORKER_QUEUE_BACKEND', 'redis')
    monkeypatch.setattr(main_module.settings, 'BROKER_QUEUE_NAME', 'lumitrace:test:jobs')

    class FakeRedis:
        def llen(self, name):
            assert name == 'lumitrace:test:jobs'
            return 3

        def scard(self, name):
            assert name == 'lumitrace:test:jobs:inflight'
            return 1

    monkeypatch.setattr(main_module, '_get_broker_client', lambda: FakeRedis())

    response = await client.get('/metrics')
    assert response.status_code == 200

    broker = response.json()['worker']['broker']
    assert broker['enabled'] is True
    assert broker['available'] is True
    assert broker['queue_depth'] == 3
    assert broker['inflight_jobs'] == 1
    assert isinstance(broker['latency_ms'], float)

    broker_metrics = response.json()['broker']
    for field in (
        'dispatch_scans_total',
        'dispatch_candidates_total',
        'enqueue_requests_total',
        'enqueue_added_total',
        'enqueue_deduped_total',
        'enqueue_errors_total',
        'pops_total',
        'claimed_from_pop_total',
        'claim_misses_total',
    ):
        assert isinstance(broker_metrics[field], int)


async def test_request_observability_tracks_get_requests(client):
    health_response = await client.get('/health')
    assert health_response.status_code == 200
    assert health_response.headers.get('x-request-id')

    first_metrics_response = await client.get('/metrics')
    assert first_metrics_response.status_code == 200

    metrics_response = await client.get('/metrics')
    assert metrics_response.status_code == 200
    payload = metrics_response.json()

    assert payload['http']['requests_by_method'].get('GET', 0) >= 2
    assert payload['http']['responses_by_status'].get('200', 0) >= 2


async def test_health_degrades_when_redis_broker_unavailable(client, monkeypatch):
    monkeypatch.setattr(main_module.settings, 'WORKER_QUEUE_BACKEND', 'redis')
    monkeypatch.setattr(main_module, '_get_broker_client', lambda: None)

    response = await client.get('/health')
    assert response.status_code == 200

    payload = response.json()
    assert payload['status'] == 'degraded'
    assert payload['broker_enabled'] is True
    assert payload['broker_available'] is False


async def test_health_degrades_when_embedded_worker_expected_but_not_running(client, monkeypatch):
    monkeypatch.setattr(main_module.settings, 'WORKER_QUEUE_BACKEND', 'db')
    monkeypatch.setattr(main_module.settings, 'RUN_QUEUE_WORKER_IN_API', True)
    monkeypatch.setattr(main_module, 'queue_worker_task', None)

    response = await client.get('/health')
    assert response.status_code == 200

    payload = response.json()
    assert payload['status'] == 'degraded'
    assert payload['embedded_worker_enabled'] is True
    assert payload['worker_running'] is False


async def test_health_degrades_when_retention_expected_but_not_running(client, monkeypatch):
    monkeypatch.setattr(main_module.settings, 'WORKER_QUEUE_BACKEND', 'db')
    monkeypatch.setattr(main_module.settings, 'RUN_QUEUE_WORKER_IN_API', False)
    monkeypatch.setattr(main_module.settings, 'RUN_RETENTION_CLEANUP_IN_API', True)
    monkeypatch.setattr(main_module, 'retention_cleanup_task', None)

    response = await client.get('/health')
    assert response.status_code == 200

    payload = response.json()
    assert payload['status'] == 'degraded'
    assert payload['retention_cleanup_enabled'] is True
    assert payload['retention_running'] is False


async def test_cleanup_expired_jobs_removes_db_rows_and_artifacts(client):
    job_id = str(uuid.uuid4())

    output_dir = Path(main_module.settings.OUTPUT_DIR)
    output_dir.mkdir(exist_ok=True)
    output_path = output_dir / f'{job_id}.png'
    output_path.write_bytes(b'expired-output')

    input_path = main_module._job_input_path(job_id, 'image', 'expired-input.png')
    input_path.parent.mkdir(exist_ok=True)
    input_path.write_bytes(b'expired-input')

    manifest_path = main_module._job_manifest_path(job_id)
    manifest_path.write_text('{}', encoding='utf-8')

    expired_at = _utcnow_naive() - timedelta(hours=main_module.JOB_RETENTION_HOURS + 2)

    db = SessionLocal()
    try:
        job = Job(
            id=job_id,
            status='completed',
            progress=100,
            media_type='image',
            attempt_count=1,
            max_attempts=3,
            input_filename='expired-input.png',
            input_content_type='image/png',
            output_path=str(output_path),
            samples=64,
            max_bounces=4,
            use_denoising=True,
            use_neural=False,
            exposure=1.0,
            completed_at=expired_at,
            created_at=expired_at,
            updated_at=expired_at,
        )
        db.add(job)
        db.commit()
    finally:
        db.close()

    deleted_jobs, deleted_files = main_module._cleanup_expired_jobs()
    assert deleted_jobs >= 1
    assert deleted_files >= 1

    db = SessionLocal()
    try:
        stored_job = db.query(Job).filter(Job.id == job_id).first()
        assert stored_job is None
    finally:
        db.close()

    assert not output_path.exists()
    assert not input_path.exists()
    assert not manifest_path.exists()

    metrics_response = await client.get('/metrics')
    maintenance = metrics_response.json()['maintenance']
    assert maintenance['retention_runs_total'] >= 1
    assert maintenance['retention_jobs_deleted_total'] >= 1
