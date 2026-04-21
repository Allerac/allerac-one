from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """Application settings."""
    
    # Supabase
    supabase_url: str
    supabase_anon_key: str
    supabase_service_key: str
    
    # LLM Providers
    github_token: str = ""
    openai_api_key: str = ""
    ollama_base_url: str = "http://localhost:11434"
    
    # Tavily
    tavily_api_key: str = ""
    
    # App Config
    environment: str = "development"
    debug: bool = True
    cors_origins: str = "http://localhost:3000"
    secret_key: str
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Converts CORS origins string to list."""
        return [origin.strip() for origin in self.cors_origins.split(",")]
    
    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
