from datetime import UTC, datetime, timedelta
import uuid

import app.main as main_module
from app.db import SessionLocal
from app.models import Job


def _utcnow_naive() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def test_redis_backend_flag_reflects_settings(monkeypatch):
    monkeypatch.setattr(main_module.settings, 'WORKER_QUEUE_BACKEND', 'redis')
    assert main_module._should_use_redis_broker() is True

    monkeypatch.setattr(main_module.settings, 'WORKER_QUEUE_BACKEND', 'db')
    assert main_module._should_use_redis_broker() is False


def test_dispatch_job_to_broker_uses_queue_name(monkeypatch):
    monkeypatch.setattr(main_module.settings, 'WORKER_QUEUE_BACKEND', 'redis')
    monkeypatch.setattr(main_module.settings, 'BROKER_QUEUE_NAME', 'lumitrace:test:jobs')

    calls = []
    seen = set()
    queued = []

    class FakeRedis:
        def eval(self, script, numkeys, queue_name, inflight_set_name, job_id):
            calls.append((numkeys, queue_name, inflight_set_name, job_id))
            if job_id in seen:
                return 0
            seen.add(job_id)
            queued.append(job_id)
            return 1

    monkeypatch.setattr(main_module, '_get_broker_client', lambda: FakeRedis())

    assert main_module._dispatch_job_to_broker('job-123') is True
    assert calls == [(2, 'lumitrace:test:jobs', 'lumitrace:test:jobs:inflight', 'job-123')]
    assert queued == ['job-123']


def test_dispatch_job_to_broker_deduplicates_same_job(monkeypatch):
    monkeypatch.setattr(main_module.settings, 'WORKER_QUEUE_BACKEND', 'redis')
    monkeypatch.setattr(main_module.settings, 'BROKER_QUEUE_NAME', 'lumitrace:test:jobs')

    seen = set()
    queued = []

    class FakeRedis:
        def eval(self, script, numkeys, queue_name, inflight_set_name, job_id):
            if job_id in seen:
                return 0
            seen.add(job_id)
            queued.append(job_id)
            return 1

    fake_redis = FakeRedis()
    monkeypatch.setattr(main_module, '_get_broker_client', lambda: fake_redis)

    assert main_module._dispatch_job_to_broker('job-123') is True
    assert main_module._dispatch_job_to_broker('job-123') is True
    assert queued == ['job-123']


def test_dispatch_due_jobs_to_broker_only_enqueues_due_pending(monkeypatch):
    monkeypatch.setattr(main_module.settings, 'WORKER_QUEUE_BACKEND', 'redis')
    monkeypatch.setattr(main_module.settings, 'BROKER_QUEUE_NAME', 'lumitrace:test:jobs')
    main_module._reset_runtime_metrics()

    db = SessionLocal()
    try:
        db.query(Job).filter(Job.status == 'pending').delete(synchronize_session=False)
        db.commit()

        due_id = str(uuid.uuid4())
        future_id = str(uuid.uuid4())
        now = _utcnow_naive()

        due_job = Job(
            id=due_id,
            status='pending',
            progress=0,
            media_type='image',
            input_filename='due.png',
            samples=64,
            max_bounces=4,
            use_denoising=True,
            use_neural=False,
            exposure=1.0,
            attempt_count=0,
            max_attempts=3,
            next_attempt_at=now - timedelta(seconds=1),
        )
        future_job = Job(
            id=future_id,
            status='pending',
            progress=0,
            media_type='image',
            input_filename='future.png',
            samples=64,
            max_bounces=4,
            use_denoising=True,
            use_neural=False,
            exposure=1.0,
            attempt_count=0,
            max_attempts=3,
            next_attempt_at=now + timedelta(minutes=5),
        )

        db.add(due_job)
        db.add(future_job)
        db.commit()
    finally:
        db.close()

    pushed_values = []
    seen = set()

    class FakeRedis:
        def eval(self, script, numkeys, queue_name, inflight_set_name, job_id):
            if job_id in seen:
                return 0
            seen.add(job_id)
            pushed_values.append(job_id)
            return 1

        def llen(self, name):
            return 0

        def scard(self, name):
            return len(seen)

    monkeypatch.setattr(main_module, '_get_broker_client', lambda: FakeRedis())

    dispatched = main_module._dispatch_due_jobs_to_broker(limit=50)
    assert dispatched >= 1
    assert due_id in pushed_values
    assert future_id not in pushed_values

    broker_metrics = main_module._build_metrics_payload()['broker']
    assert broker_metrics['dispatch_scans_total'] >= 1
    assert broker_metrics['dispatch_candidates_total'] >= 1
    assert broker_metrics['enqueue_requests_total'] >= 1


def test_broker_enqueue_metrics_track_added_dedup_and_errors(monkeypatch):
    monkeypatch.setattr(main_module.settings, 'WORKER_QUEUE_BACKEND', 'redis')
    monkeypatch.setattr(main_module.settings, 'BROKER_QUEUE_NAME', 'lumitrace:test:jobs')
    main_module._reset_runtime_metrics()

    seen = set()

    class FakeRedis:
        def eval(self, script, numkeys, queue_name, inflight_set_name, job_id):
            if job_id == 'raise-error':
                raise main_module.RedisError('simulated enqueue error')
            if job_id in seen:
                return 0
            seen.add(job_id)
            return 1

        def llen(self, name):
            return 0

        def scard(self, name):
            return len(seen)

    monkeypatch.setattr(main_module, '_get_broker_client', lambda: FakeRedis())

    assert main_module._enqueue_job_to_broker_if_new('job-1') is True
    assert main_module._enqueue_job_to_broker_if_new('job-1') is False
    assert main_module._enqueue_job_to_broker_if_new('raise-error') is None

    broker_metrics = main_module._build_metrics_payload()['broker']
    assert broker_metrics['enqueue_requests_total'] == 3
    assert broker_metrics['enqueue_added_total'] == 1
    assert broker_metrics['enqueue_deduped_total'] == 1
    assert broker_metrics['enqueue_errors_total'] == 1


def test_claim_job_by_id_marks_job_processing():
    db = SessionLocal()
    try:
        now = _utcnow_naive()
        job = Job(
            id=str(uuid.uuid4()),
            status='pending',
            progress=0,
            media_type='image',
            input_filename='claimable.png',
            samples=64,
            max_bounces=4,
            use_denoising=True,
            use_neural=False,
            exposure=1.0,
            attempt_count=0,
            max_attempts=3,
            next_attempt_at=now - timedelta(seconds=1),
        )
        db.add(job)
        db.commit()
        job_id = job.id
    finally:
        db.close()

    claimed = main_module._claim_job_by_id(job_id)
    assert claimed == job_id

    db = SessionLocal()
    try:
        refreshed = db.query(Job).filter(Job.id == job_id).first()
        assert refreshed is not None
        assert refreshed.status == 'processing'
        assert refreshed.attempt_count == 1
        assert refreshed.claimed_by == main_module.WORKER_INSTANCE_ID
    finally:
        db.close()
