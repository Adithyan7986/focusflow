
from datetime import datetime, timezone
from uuid import uuid4
import os

import jwt
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    status,
)
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from app.database import sessions_collection, users_collection


router = APIRouter(
    prefix="/api/sessions",
    tags=["Focus Sessions"],
)

bearer_scheme = HTTPBearer(auto_error=False)

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = "HS256"


def now_utc():
    return datetime.now(timezone.utc)


def ensure_utc(value):
    """Ensure a datetime is timezone-aware and represented in UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        bearer_scheme
    ),
) -> str:
    """Identify the user from a valid JWT access token."""

    if not JWT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="JWT configuration is missing.",
        )

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Please log in to access focus sessions.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
        )

        user_id = payload.get("sub")

        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token.",
            )

    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = users_collection.find_one({"user_id": user_id})

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found.",
        )

    return user_id


class StartSessionRequest(BaseModel):
    goal_minutes: int = Field(default=25, ge=1, le=180)


def session_response(session):
    """Return session data without exposing MongoDB internal fields."""
    return {
        "id": session["session_id"],
        "user_id": session["user_id"],
        "goal_minutes": session["goal_minutes"],
        "status": session["status"],
        "started_at": session["started_at"],
        "ended_at": session.get("ended_at"),
        "total_seconds": session.get("total_seconds", 0),
        "created_at": session["created_at"],
    }


@router.post("/start")
def start_session(
    payload: StartSessionRequest,
    user_id: str = Depends(get_current_user),
):
    """Start a new focus session for the authenticated user."""

    active = sessions_collection.find_one({
        "user_id": user_id,
        "status": {"$in": ["running", "paused"]},
    })

    if active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have an active focus session.",
        )

    timestamp = now_utc()

    session = {
        "session_id": str(uuid4()),
        "user_id": user_id,
        "goal_minutes": payload.goal_minutes,
        "status": "running",
        "started_at": timestamp,
        "ended_at": None,
        "total_seconds": 0,
        "running_since": timestamp,
        "created_at": timestamp,
    }

    sessions_collection.insert_one(session)

    return session_response(session)


@router.post("/{session_id}/pause")
def pause_session(
    session_id: str,
    user_id: str = Depends(get_current_user),
):
    """Pause a running focus session and save elapsed time."""

    session = sessions_collection.find_one({
        "session_id": session_id,
        "user_id": user_id,
        "status": "running",
    })

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Running session not found.",
        )

    elapsed = max(
        0,
        int(
            (
                now_utc()
                - ensure_utc(session["running_since"])
            ).total_seconds()
        ),
    )

    sessions_collection.update_one(
        {
            "_id": session["_id"],
            "user_id": user_id,
            "status": "running",
        },
        {
            "$inc": {"total_seconds": elapsed},
            "$set": {
                "status": "paused",
                "running_since": None,
            },
        },
    )

    updated = sessions_collection.find_one({
        "_id": session["_id"],
        "user_id": user_id,
    })

    return session_response(updated)


@router.post("/{session_id}/resume")
def resume_session(
    session_id: str,
    user_id: str = Depends(get_current_user),
):
    """Resume a paused focus session."""

    session = sessions_collection.find_one({
        "session_id": session_id,
        "user_id": user_id,
        "status": "paused",
    })

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paused session not found.",
        )

    sessions_collection.update_one(
        {
            "_id": session["_id"],
            "user_id": user_id,
            "status": "paused",
        },
        {
            "$set": {
                "status": "running",
                "running_since": now_utc(),
            }
        },
    )

    updated = sessions_collection.find_one({
        "_id": session["_id"],
        "user_id": user_id,
    })

    return session_response(updated)


@router.post("/{session_id}/end")
def end_session(
    session_id: str,
    user_id: str = Depends(get_current_user),
):
    """End an active focus session and save its elapsed time."""

    session = sessions_collection.find_one({
        "session_id": session_id,
        "user_id": user_id,
        "status": {"$in": ["running", "paused"]},
    })

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active session not found.",
        )

    extra_seconds = 0

    if session["status"] == "running":
        extra_seconds = max(
            0,
            int(
                (
                    now_utc()
                    - ensure_utc(session["running_since"])
                ).total_seconds()
            ),
        )

    sessions_collection.update_one(
        {
            "_id": session["_id"],
            "user_id": user_id,
            "status": {"$in": ["running", "paused"]},
        },
        {
            "$inc": {"total_seconds": extra_seconds},
            "$set": {
                "status": "completed",
                "ended_at": now_utc(),
                "running_since": None,
            },
        },
    )

    updated = sessions_collection.find_one({
        "_id": session["_id"],
        "user_id": user_id,
    })

    return session_response(updated)


@router.get("")
def list_sessions(
    limit: int = Query(default=20, ge=1, le=100),
    user_id: str = Depends(get_current_user),
):
    """List focus sessions belonging to the authenticated user."""

    cursor = (
        sessions_collection.find({"user_id": user_id})
        .sort("created_at", -1)
        .limit(limit)
    )

    return [session_response(item) for item in cursor]
