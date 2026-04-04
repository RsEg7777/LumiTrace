import asyncio

import cv2
import numpy as np


def _make_test_png() -> bytes:
    image = np.zeros((96, 96, 3), dtype=np.uint8)
    image[:, :, 0] = 180
    image[:, :, 1] = 120
    image[:, :, 2] = 80
    ok, encoded = cv2.imencode('.png', image)
    if not ok:
        raise RuntimeError('Failed to build test image')
    return encoded.tobytes()


async def _wait_for_completion(client, job_id: str, headers=None):
    headers = headers or {}
    for _ in range(20):
        response = await client.get(f'/status/{job_id}', headers=headers)
        assert response.status_code == 200
        status_payload = response.json()
        if status_payload['status'] in {'completed', 'failed'}:
            return status_payload
        await asyncio.sleep(0.1)

    raise AssertionError('Job did not complete in expected time')


async def test_process_image_anonymous_flow(client):
    image_bytes = _make_test_png()

    response = await client.post(
        '/process/image',
        files={'file': ('sample.png', image_bytes, 'image/png')},
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

    status_payload = await _wait_for_completion(client, job_id)
    assert status_payload['status'] == 'completed'
    assert status_payload['progress'] == 100

    download = await client.get(f'/download/{job_id}')
    assert download.status_code == 200
    assert download.headers['content-type'].startswith('image/')
    assert len(download.content) > 10


async def test_job_access_control_for_authenticated_users(client, register_user):
    image_bytes = _make_test_png()

    owner = await register_user('owner@example.com', display_name='Owner', password='password123')
    outsider = await register_user('outsider@example.com', display_name='Outsider', password='password123')

    owner_headers = {'Authorization': f"Bearer {owner['access_token']}"}
    outsider_headers = {'Authorization': f"Bearer {outsider['access_token']}"}

    create_response = await client.post(
        '/process/image',
        files={'file': ('owner.png', image_bytes, 'image/png')},
        data={
            'samples': '64',
            'max_bounces': '4',
            'use_denoising': 'true',
            'use_neural': 'false',
            'exposure': '1.0',
        },
        headers=owner_headers,
    )
    assert create_response.status_code == 200
    job_id = create_response.json()['job_id']

    status_payload = await _wait_for_completion(client, job_id, headers=owner_headers)
    assert status_payload['status'] == 'completed'

    forbidden_status = await client.get(f'/status/{job_id}', headers=outsider_headers)
    assert forbidden_status.status_code == 403

    forbidden_download = await client.get(f'/download/{job_id}', headers=outsider_headers)
    assert forbidden_download.status_code == 403
