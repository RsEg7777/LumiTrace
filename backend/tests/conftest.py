import os
import sys
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

os.environ.setdefault('DATABASE_URL', 'sqlite:///./test_lumitrace.db')
os.environ.setdefault('SKIP_MODEL_LOAD', 'true')
os.environ.setdefault('JWT_SECRET_KEY', 'test-secret-key')

from app.config import get_settings  # noqa: E402

get_settings.cache_clear()

from app.db import Base, DATABASE_URL, engine  # noqa: E402
from app.main import _shutdown_runtime, _startup_runtime, app  # noqa: E402


@pytest.fixture(scope='session', autouse=True)
def setup_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    engine.dispose()

    if DATABASE_URL.startswith('sqlite:///'):
        db_path = Path(DATABASE_URL.replace('sqlite:///', '', 1))
        if db_path.exists():
            try:
                db_path.unlink()
            except PermissionError:
                pass


@pytest_asyncio.fixture
async def client():
    await _startup_runtime()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url='http://testserver') as test_client:
        yield test_client
    await _shutdown_runtime()


@pytest_asyncio.fixture
def register_user(client):
    async def _register(email: str, display_name: str = 'Test User', password: str = 'password123'):
        response = await client.post(
            '/auth/register',
            json={
                'email': email,
                'password': password,
                'display_name': display_name,
            },
        )
        assert response.status_code == 200
        return response.json()

    return _register
