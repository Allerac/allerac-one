from typing import Optional, List, Dict, Any
from openai import OpenAI
from app.config import settings


class LLMService:
    """Service for interaction with LLMs (GitHub Models, OpenAI, Ollama)."""
    
    def __init__(self):
        self.github_client = None
        self.openai_client = None
        self.ollama_client = None
        
        # Initialize clients according to availability
        if settings.github_token:
            self.github_client = OpenAI(
                base_url="https://models.inference.ai.azure.com",
                api_key=settings.github_token
            )
        
        if settings.openai_api_key:
            self.openai_client = OpenAI(api_key=settings.openai_api_key)
        
        if settings.ollama_base_url:
            self.ollama_client = OpenAI(
                base_url=f"{settings.ollama_base_url}/v1",
                api_key="ollama"  # Ollama doesn't require real key
            )
    
    async def generate_response(
        self,
        messages: List[Dict[str, str]],
        model: str = "gpt-4o-mini",
        stream: bool = False,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None
    ) -> Any:
        """
        Generates LLM response.
        
        Args:
            messages: Lista de mensagens no formato OpenAI
            model: Nome do modelo
            stream: Se deve fazer streaming
            temperature: Temperatura (0-1)
            max_tokens: Token limit
        """
        # Determine which client to use based on model
        client = self._get_client_for_model(model)
        
        if not client:
            raise ValueError(f"No client available for model {model}")
        
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            stream=stream,
            temperature=temperature,
            max_tokens=max_tokens
        )
        
        if stream:
            return response  # Returns generator
        else:
            return response.choices[0].message.content
    
    def _get_client_for_model(self, model: str) -> Optional[OpenAI]:
        """Determines which client to use based on model."""
        # GitHub Models
        if model.startswith("gpt-4") or model.startswith("gpt-3.5"):
            return self.github_client or self.openai_client
        
        # Ollama (modelos locais)
        if "deepseek" in model or "llama" in model or "mistral" in model:
            return self.ollama_client
        
        # Default: try GitHub Models or OpenAI
        return self.github_client or self.openai_client
    
    async def generate_embedding(self, text: str) -> List[float]:
        """Generates embedding for text."""
        client = self.openai_client or self.github_client
        
        if not client:
            raise ValueError("No OpenAI client available for embeddings")
        
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=text
        )
        
        return response.data[0].embedding


# Global service instance
llm_service = LLMService()
