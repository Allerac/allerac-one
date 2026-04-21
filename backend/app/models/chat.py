from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class MessageRequest(BaseModel):
    """Request to send a message."""
    conversation_id: str
    content: str
    user_id: str


class MessageResponse(BaseModel):
    """Message response."""
    id: str
    conversation_id: str
    role: str
    content: str
    created_at: datetime


class ConversationCreate(BaseModel):
    """Request to create a conversation."""
    user_id: str
    title: Optional[str] = "New Conversation"


class ConversationResponse(BaseModel):
    """Conversation response."""
    id: str
    user_id: str
    title: str
    created_at: datetime
    updated_at: datetime


class ChatStreamChunk(BaseModel):
    """Chat streaming chunk."""
    type: str  # "token", "done", "error"
    content: str
    metadata: Optional[dict] = None
