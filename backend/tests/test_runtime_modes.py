import app.main as main_module
import pytest
from app.db import resolve_database_url
from pathlib import Path


def test_runtime_mode_helpers_reflect_settings(monkeypatch):
    monkeypatch.setattr(main_module.settings, 'RUN_QUEUE_WORKER_IN_API', False)
    monkeypatch.setattr(main_module.settings, 'RUN_RETENTION_CLEANUP_IN_API', False)
    monkeypatch.setattr(main_module.settings, 'LOAD_RENDER_MODELS_ON_STARTUP', False)

    assert main_module._should_run_embedded_queue_worker() is False
    assert main_module._should_run_retention_cleanup() is False
    assert main_module._should_load_render_models() is False


async def test_startup_without_embedded_worker_or_models(monkeypatch):
    monkeypatch.setattr(main_module.settings, 'RUN_QUEUE_WORKER_IN_API', False)
    monkeypatch.setattr(main_module.settings, 'RUN_RETENTION_CLEANUP_IN_API', False)
    monkeypatch.setattr(main_module.settings, 'LOAD_RENDER_MODELS_ON_STARTUP', False)

    await main_module._startup_runtime()
    try:
        assert main_module.queue_worker_task is None
        assert main_module.retention_cleanup_task is None
        assert main_module.path_tracer is None
        assert main_module.depth_estimator is None
        assert main_module.denoiser is None
        assert main_module.neural_tracer is None
    finally:
        await main_module._shutdown_runtime()


def test_validate_runtime_configuration_rejects_default_production_jwt_secret(monkeypatch):
    monkeypatch.setattr(main_module.settings, 'ENVIRONMENT', 'production')
    monkeypatch.setattr(main_module.settings, 'JWT_SECRET_KEY', 'change-me-in-production')

    with pytest.raises(RuntimeError, match='default JWT_SECRET_KEY'):
        main_module._validate_runtime_configuration()


def test_validate_runtime_configuration_accepts_non_default_production_jwt_secret(monkeypatch):
    monkeypatch.setattr(main_module.settings, 'ENVIRONMENT', 'production')
    monkeypatch.setattr(main_module.settings, 'JWT_SECRET_KEY', 'prod-secret-not-default')
    monkeypatch.setattr(main_module.settings, 'WORKER_QUEUE_BACKEND', 'db')

    main_module._validate_runtime_configuration()


def test_validate_runtime_configuration_requires_redis_support(monkeypatch):
    monkeypatch.setattr(main_module.settings, 'ENVIRONMENT', 'production')
    monkeypatch.setattr(main_module.settings, 'JWT_SECRET_KEY', 'prod-secret-not-default')
    monkeypatch.setattr(main_module.settings, 'WORKER_QUEUE_BACKEND', 'redis')
    monkeypatch.setattr(main_module, 'Redis', None)

    with pytest.raises(RuntimeError, match='redis package support'):
        main_module._validate_runtime_configuration()


def test_resolve_database_url_normalizes_relative_sqlite_path():
    resolved = resolve_database_url('sqlite:///./split-smoke.db')

    assert resolved.startswith('sqlite:///')
    resolved_path = Path(resolved.replace('sqlite:///', '', 1))
    assert resolved_path.is_absolute()
    assert resolved_path.name == 'split-smoke.db'
    assert resolved_path.parent.name == 'backend'


def test_resolve_database_url_keeps_non_sqlite_urls_unchanged():
    postgres_url = 'postgresql+psycopg2://user:pass@localhost:5432/lumitrace'

    assert resolve_database_url(postgres_url) == postgres_url


def test_resolve_runtime_dir_anchors_relative_paths_to_backend_root():
    resolved = main_module._resolve_runtime_dir('temp')

    assert resolved == (main_module.BACKEND_ROOT / 'temp').resolve()


def test_resolve_runtime_dir_keeps_absolute_paths_intact():
    absolute_path = (main_module.BACKEND_ROOT / 'custom-path').resolve()

    assert main_module._resolve_runtime_dir(str(absolute_path)) == absolute_path
