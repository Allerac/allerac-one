from fastapi import APIRouter, HTTPException, UploadFile, File
from app.models.document import (
    DocumentUploadResponse,
    DocumentSearchRequest
)
from typing import List

router = APIRouter()


@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(
    conversation_id: str,
    file: UploadFile = File(...)
):
    """Uploads a PDF document."""
    # TODO: Implement upload and processing logic
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/{conversation_id}")
async def list_documents(conversation_id: str):
    """Lists documents from a conversation."""
    # TODO: Implement listing logic
    raise HTTPException(status_code=501, detail="Not implemented")


@router.post("/search")
async def search_documents(request: DocumentSearchRequest):
    """Semantic search in documents."""
    # TODO: Implement vector search in documents
    raise HTTPException(status_code=501, detail="Not implemented")


@router.delete("/{document_id}")
async def delete_document(document_id: str):
    """Deletes a document."""
    # TODO: Implement deletion logic
    raise HTTPException(status_code=501, detail="Not implemented")
