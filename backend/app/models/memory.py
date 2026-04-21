from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class MemoryCreate(BaseModel):
    """Request to create a memory."""
    conversation_id: str
    user_id: str
    content: str
    emotion: Optional[str] = None


class MemoryResponse(BaseModel):
    """Memory response."""
    id: str
    conversation_id: str
    user_id: str
    content: str
    emotion: Optional[str]
    created_at: datetime


class MemorySearchRequest(BaseModel):
    """Request to search memories."""
    user_id: str
    query: str
    limit: int = 5
