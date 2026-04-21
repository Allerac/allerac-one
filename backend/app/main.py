from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api import chat, memory, documents

app = FastAPI(
    title="Allerac-One API",
    description="Backend API for Allerac-One - AI Chat with RAG and Memory",
    version="1.0.0",
    debug=settings.debug
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "online",
        "message": "Allerac-One Backend API",
        "version": "1.0.0",
        "environment": settings.environment
    }


@app.get("/health")
async def health_check():
    """Detailed health check."""
    return {
        "status": "healthy",
        "services": {
            "api": "up",
            "database": "up"  # TODO: Add actual DB health check
        }
    }


# Include routers
app.include_router(chat.router, prefix="/api/chat", tags=["Chat"])
app.include_router(memory.router, prefix="/api/memory", tags=["Memory"])
app.include_router(documents.router, prefix="/api/documents", tags=["Documents"])
