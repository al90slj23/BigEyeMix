from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import upload, process, health, muggle_splice

app = FastAPI(
    title="BigEyeMix API",
    description="AI-powered music mixing and transition API",
    version="0.1.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(upload.router, prefix="/api", tags=["upload"])
app.include_router(process.router, prefix="/api", tags=["process"])
app.include_router(muggle_splice.router, prefix="/api", tags=["muggle_splice"])

@app.get("/")
async def root():
    return {
        "message": "BigEyeMix API",
        "version": "0.1.0",
        "docs": "/docs"
    }
