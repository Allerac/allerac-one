from fastapi import APIRouter, HTTPException
from app.models.memory import (
    MemoryCreate,
    MemoryResponse,
    MemorySearchRequest
)
from typing import List

router = APIRouter()


@router.post("/", response_model=MemoryResponse)
async def create_memory(request: MemoryCreate):
    """Creates a new memory."""
    # TODO: Implement memory creation logic
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/{conversation_id}", response_model=List[MemoryResponse])
async def get_memories(conversation_id: str):
    """Gets memories from a conversation."""
    # TODO: Implement retrieval logic
    raise HTTPException(status_code=501, detail="Not implemented")


@router.post("/search", response_model=List[MemoryResponse])
async def search_memories(request: MemorySearchRequest):
    """Searches memories semantically."""
    # TODO: Implement vector search
    raise HTTPException(status_code=501, detail="Not implemented")


@router.delete("/{memory_id}")
async def delete_memory(memory_id: str):
    """Deletes a memory."""
    # TODO: Implement deletion logic
    raise HTTPException(status_code=501, detail="Not implemented")
