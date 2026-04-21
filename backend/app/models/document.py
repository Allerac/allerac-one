from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class DocumentUploadResponse(BaseModel):
    """Document upload response."""
    id: str
    conversation_id: str
    filename: str
    content_type: str
    size: int
    chunks_count: int
    created_at: datetime


class DocumentSearchRequest(BaseModel):
    """Request to search in documents."""
    conversation_id: str
    query: str
    limit: int = 5
