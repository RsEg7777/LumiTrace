from datetime import UTC, datetime, timedelta
import asyncio
import uuid

import cv2
import numpy as np

import app.main as main_module
from app.db import SessionLocal
from app.models import Job


def _utcnow_naive() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _make_test_png() -> bytes:
    image = np.zeros((96, 96, 3), dtype=np.uint8)
    image[:, :, 0] = 200
    image[:, :, 1] = 110
    image[:, :, 2] = 90
    ok, encoded = cv2.imencode('.png', image)
    if not ok:
        raise RuntimeError('Failed to build test image')
    return encoded.tobytes()


async def _wait_for_completion(client, job_id: str):
    for _ in range(120):
        response = await client.get(f'/status/{job_id}')
        assert response.status_code == 200
        payload = response.json()
        if payload['status'] in {'completed', 'failed'}:
            return payload
        await asyncio.sleep(0.1)

    raise AssertionError('Job did not complete in expected time window')


async def test_transient_failure_retries_and_succeeds(client, monkeypatch):
    original_depth_estimator = main_module.depth_estimator

    class FlakyDepthEstimator:
        def __init__(self, delegate):
            self.delegate = delegate
            self.calls = 0

        def estimate(self, image, target_size=None):
            self.calls += 1
            if self.calls == 1:
                raise RuntimeError('transient depth estimation failure')
            return self.delegate.estimate(image, target_size=target_size)

    flaky = FlakyDepthEstimator(original_depth_estimator)
    monkeypatch.setattr(main_module, 'depth_estimator', flaky)

    response = await client.post(
        '/process/image',
        files={'file': ('retry.png', _make_test_png(), 'image/png')},
        data={
            'samples': '64',
            'max_bounces': '4',
            'use_denoising': 'true',
            'use_neural': 'false',
            'exposure': '1.0',
        },
    )

    assert response.status_code == 200
    job_id = response.json()['job_id']

    payload = await _wait_for_completion(client, job_id)
    assert payload['status'] == 'completed'
    assert payload['attempt_count'] >= 2

    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        assert job is not None
        assert job.attempt_count >= 2
        assert job.status == 'completed'
    finally:
        db.close()


def test_reclaim_stale_processing_job_back_to_pending(client):
    db = SessionLocal()
    try:
        now = _utcnow_naive()
        job = Job(
            id=str(uuid.uuid4()),
            status='processing',
            progress=45,
            media_type='image',
            input_filename='stale.png',
            samples=64,
            max_bounces=4,
            use_denoising=True,
            use_neural=False,
            exposure=1.0,
            attempt_count=1,
            max_attempts=3,
            claimed_by='dead-worker',
            heartbeat_at=now - timedelta(seconds=40),
            lease_expires_at=now - timedelta(seconds=10),
            next_attempt_at=None,
        )
        db.add(job)
        db.commit()
        job_id = job.id
    finally:
        db.close()

    reclaimed_count = main_module._requeue_stale_processing_jobs()
    assert reclaimed_count >= 1

    db = SessionLocal()
    try:
        reclaimed = db.query(Job).filter(Job.id == job_id).first()
        assert reclaimed is not None
        assert reclaimed.status == 'pending'
        assert reclaimed.progress == 0
        assert reclaimed.claimed_by is None
        assert reclaimed.lease_expires_at is None
        assert reclaimed.next_attempt_at is not None
    finally:
        db.close()


def test_reclaim_stale_processing_job_exhausts_retries(client):
    db = SessionLocal()
    try:
        now = _utcnow_naive()
        job = Job(
            id=str(uuid.uuid4()),
            status='processing',
            progress=88,
            media_type='image',
            input_filename='stale-fail.png',
            samples=64,
            max_bounces=4,
            use_denoising=True,
            use_neural=False,
            exposure=1.0,
            attempt_count=3,
            max_attempts=3,
            claimed_by='dead-worker',
            heartbeat_at=now - timedelta(seconds=40),
            lease_expires_at=now - timedelta(seconds=10),
            next_attempt_at=None,
        )
        db.add(job)
        db.commit()
        job_id = job.id
    finally:
        db.close()

    reclaimed_count = main_module._requeue_stale_processing_jobs()
    assert reclaimed_count >= 1

    db = SessionLocal()
    try:
        reclaimed = db.query(Job).filter(Job.id == job_id).first()
        assert reclaimed is not None
        assert reclaimed.status == 'failed'
        assert reclaimed.completed_at is not None
        assert reclaimed.claimed_by is None
        assert reclaimed.lease_expires_at is None
    finally:
        db.close()


def test_claim_contention_allows_single_worker_claim(monkeypatch):
    db = SessionLocal()
    try:
        db.query(Job).filter(Job.status == 'pending').delete(synchronize_session=False)
        db.commit()

        job = Job(
            id=str(uuid.uuid4()),
            status='pending',
            progress=0,
            media_type='image',
            input_filename='single-claim.png',
            samples=64,
            max_bounces=4,
            use_denoising=True,
            use_neural=False,
            exposure=1.0,
            attempt_count=0,
            max_attempts=3,
            next_attempt_at=_utcnow_naive() - timedelta(seconds=1),
        )
        db.add(job)
        db.commit()
        job_id = job.id
    finally:
        db.close()

    monkeypatch.setattr(main_module, 'WORKER_INSTANCE_ID', 'worker-A')
    first_claim = main_module._claim_next_pending_job()
    assert first_claim == job_id

    monkeypatch.setattr(main_module, 'WORKER_INSTANCE_ID', 'worker-B')
    second_claim = main_module._claim_next_pending_job()
    assert second_claim is None

    db = SessionLocal()
    try:
        claimed = db.query(Job).filter(Job.id == job_id).first()
        assert claimed is not None
        assert claimed.status == 'processing'
        assert claimed.claimed_by == 'worker-A'
        assert claimed.attempt_count == 1
        assert claimed.lease_expires_at is not None
    finally:
        db.close()
