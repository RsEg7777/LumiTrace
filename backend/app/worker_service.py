"""Standalone queue worker process entrypoint."""
import asyncio
import contextlib
import logging
import os
import signal

# Force worker capabilities on in this process.
os.environ["RUN_QUEUE_WORKER_IN_API"] = "true"
os.environ.setdefault("RUN_RETENTION_CLEANUP_IN_API", "true")
os.environ.setdefault("LOAD_RENDER_MODELS_ON_STARTUP", "true")

from app.config import get_settings

get_settings.cache_clear()

from app.main import _shutdown_runtime, _startup_runtime

logger = logging.getLogger(__name__)


async def _run_worker_service() -> None:
    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()

    def _request_stop() -> None:
        stop_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        with contextlib.suppress(NotImplementedError):
            loop.add_signal_handler(sig, _request_stop)

    await _startup_runtime()
    logger.info("Standalone worker service started")

    try:
        await stop_event.wait()
    except KeyboardInterrupt:
        logger.info("Worker interrupted by keyboard signal")
    finally:
        await _shutdown_runtime()
        logger.info("Standalone worker service stopped")


if __name__ == "__main__":
    asyncio.run(_run_worker_service())
