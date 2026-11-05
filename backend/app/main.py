from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.database import check_database_connection
from app.sessions import router as sessions_router
from app.auth import router as auth_router
from app.activity import router as activity_router
from app.profile import router as profile_router
from app.analytics import router as analytics_router
from app.recommendations import router as recommendations_router
from app.breaks import router as breaks_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    check_database_connection()
    print("MongoDB Atlas connected successfully")
    yield


app = FastAPI(
    title="FocusFlow API",
    description="AI-Powered Digital Attention Management System",
    version="1.0.0",
    lifespan=lifespan,
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["General"])
def root():
    return {
        "message": "FocusFlow API is running",
        "backend": "FastAPI",
    }


@app.get("/health", tags=["General"])
def health():
    try:
        check_database_connection()
        return {
            "status": "healthy",
            "database": "connected",
        }
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Database connection failed",
        )


app.include_router(auth_router)
app.include_router(sessions_router)
app.include_router(activity_router)
app.include_router(profile_router)
app.include_router(analytics_router)
app.include_router(recommendations_router)
app.include_router(breaks_router)
