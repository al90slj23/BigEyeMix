from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    UPLOAD_DIR: str = "./data/uploads"
    OUTPUT_DIR: str = "./data/outputs"
    MAX_UPLOAD_SIZE: int = 52428800  # 50MB
    ALLOWED_EXTENSIONS: str = "mp3,wav,flac,m4a,ogg"
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:8080,http://127.0.0.1:8080,*"
    
    # PiAPI 配置
    PIAPI_KEY: str = ""
    PIAPI_BASE_URL: str = "https://api.piapi.ai"
    
    # 服务器公网地址（用于 PiAPI 回调访问音频文件）
    SERVER_PUBLIC_URL: str = "https://bem.it.sc.cn"
    
    # 腾讯云语音识别配置
    TENCENT_SECRET_ID: str = ""
    TENCENT_SECRET_KEY: str = ""
    TENCENT_APP_ID: str = ""
    
    @property
    def allowed_extensions_list(self) -> List[str]:
        return [ext.strip() for ext in self.ALLOWED_EXTENSIONS.split(',')]
    
    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(',')]
    
    class Config:
        env_file = ".env"

settings = Settings()
