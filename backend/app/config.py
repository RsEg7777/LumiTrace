"""
LumiTrace Configuration
"""
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # API
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "LumiTrace"
    
    # CORS
    BACKEND_CORS_ORIGINS: list = ["*"]
    
    # File Upload
    MAX_FILE_SIZE: int = 100 * 1024 * 1024  # 100MB
    UPLOAD_DIR: str = "uploads"
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
    
    class Config:
        env_file = ".env"

@lru_cache()
def get_settings():
    return Settings()