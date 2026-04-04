import api.auth as auth_module
from app.db import SessionLocal
from app.models import User


async def test_register_and_me_flow(client):
    register_response = await client.post(
        '/auth/register',
        json={
            'email': 'alice@example.com',
            'password': 'password123',
            'display_name': 'Alice',
        },
    )

    assert register_response.status_code == 200
    payload = register_response.json()
    assert payload['access_token']
    assert payload['user']['email'] == 'alice@example.com'

    token = payload['access_token']
    me_response = await client.get('/auth/me', headers={'Authorization': f'Bearer {token}'})
    assert me_response.status_code == 200
    assert me_response.json()['display_name'] == 'Alice'


async def test_login_rejects_wrong_password(client, register_user):
    await register_user('bob@example.com', display_name='Bob', password='password123')

    response = await client.post(
        '/auth/login',
        json={
            'email': 'bob@example.com',
            'password': 'wrong-password',
        },
    )

    assert response.status_code == 401


async def test_google_login_creates_user(client, monkeypatch):
    monkeypatch.setattr(auth_module.settings, 'GOOGLE_CLIENT_ID', 'test-google-client-id')
    monkeypatch.setattr(
        auth_module,
        '_verify_google_identity',
        lambda _: ('google-sub-1', 'charlie@example.com', 'Charlie Google'),
    )

    response = await client.post('/auth/google', json={'id_token': 'fake-google-id-token-value-12345'})
    assert response.status_code == 200

    payload = response.json()
    assert payload['access_token']
    assert payload['user']['email'] == 'charlie@example.com'

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == 'charlie@example.com').first()
        assert user is not None
        assert user.google_sub == 'google-sub-1'
    finally:
        db.close()


async def test_google_login_links_existing_user_by_email(client, register_user, monkeypatch):
    existing = await register_user('dora@example.com', display_name='Dora', password='password123')
    existing_user_id = existing['user']['id']

    monkeypatch.setattr(auth_module.settings, 'GOOGLE_CLIENT_ID', 'test-google-client-id')
    monkeypatch.setattr(
        auth_module,
        '_verify_google_identity',
        lambda _: ('google-sub-2', 'dora@example.com', 'Dora Google'),
    )

    response = await client.post('/auth/google', json={'id_token': 'fake-google-id-token-value-12345'})
    assert response.status_code == 200
    assert response.json()['user']['id'] == existing_user_id

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == existing_user_id).first()
        assert user is not None
        assert user.google_sub == 'google-sub-2'
    finally:
        db.close()


async def test_google_login_requires_configuration(client, monkeypatch):
    monkeypatch.setattr(auth_module.settings, 'GOOGLE_CLIENT_ID', '')

    response = await client.post('/auth/google', json={'id_token': 'fake-google-id-token-value-12345'})
    assert response.status_code == 503
