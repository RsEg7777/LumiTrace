"""
LumiTrace Configuration
"""
from pydantic_settings import BaseSettings
from pydantic_settings import SettingsConfigDict
from functools import lru_cache

class Settings(BaseSettings):
    # API
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "LumiTrace"
    ENVIRONMENT: str = "development"
    
    # CORS
    BACKEND_CORS_ORIGINS: list = ["*"]
    
    # File Upload
    MAX_FILE_SIZE: int = 100 * 1024 * 1024  # 100MB
    UPLOAD_DIR: str = "uploads"
    TEMP_DIR: str = "temp"
    OUTPUT_DIR: str = "outputs"
    
    # Processing
    DEFAULT_SAMPLES: int = 64
    DEFAULT_BOUNCES: int = 4
    MAX_SAMPLES: int = 512
    
    # GPU
    CUDA_VISIBLE_DEVICES: str = "0"
    GPU_MEMORY_FRACTION: float = 0.8
    
    # Models
    DEPTH_MODEL: str = "Intel/dpt-large"
    NEURAL_TRACER_PATH: str = "models/neural_tracer.pt"
    
    # Redis (for production)
    REDIS_URL: str = "redis://localhost:6379"

    # Persistence
    DATABASE_URL: str = "sqlite:///./lumitrace.db"

    # Auth
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    ALLOW_ANONYMOUS_JOBS: bool = True
    GOOGLE_CLIENT_ID: str = ""

    # Runtime controls
    MODEL_LOAD_TIMEOUT_SECONDS: int = 120
    SKIP_MODEL_LOAD: bool = False
    WORKER_MAX_ATTEMPTS: int = 3
    WORKER_LEASE_SECONDS: int = 180
    WORKER_HEARTBEAT_SECONDS: int = 5
    WORKER_STALE_SCAN_SECONDS: int = 5
    WORKER_RETRY_BACKOFF_SECONDS: int = 2
    WORKER_RETRY_BACKOFF_MAX_SECONDS: int = 30
    REQUEST_LOGGING_ENABLED: bool = True
    REQUEST_LOG_SLOW_MS: int = 1500
    RETENTION_CLEANUP_INTERVAL_SECONDS: int = 300
    JOB_RETENTION_HOURS: int = 168
    RUN_QUEUE_WORKER_IN_API: bool = True
    RUN_RETENTION_CLEANUP_IN_API: bool = True
    LOAD_RENDER_MODELS_ON_STARTUP: bool = True
    WORKER_QUEUE_BACKEND: str = "db"
    BROKER_QUEUE_NAME: str = "lumitrace:jobs"
    BROKER_BLOCKING_POP_TIMEOUT_SECONDS: int = 2
    BROKER_DISPATCH_SCAN_SECONDS: int = 5
    BROKER_DISPATCH_BATCH_SIZE: int = 100
    BROKER_CONNECT_TIMEOUT_SECONDS: int = 2
    BROKER_SOCKET_TIMEOUT_SECONDS: int = 2
    
    model_config = SettingsConfigDict(env_file=".env")

@lru_cache()
def get_settings():
    return Settings()