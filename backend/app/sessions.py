
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
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

IST = ZoneInfo("Asia/Kolkata")


def now_utc():
    """Return the current timezone-aware UTC datetime."""
    return datetime.now(timezone.utc)


def to_ist_string(value):
    """Convert a datetime into an ISO-formatted IST string."""
    if value is None:
        return None

    # PyMongo may return naive datetimes representing UTC.
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)

    return value.astimezone(IST).isoformat()


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
    """Return session data with original timestamps and IST strings."""

    started_at = session.get("started_at")
    ended_at = session.get("ended_at")
    created_at = session.get("created_at")

    return {
        "id": session["session_id"],
        "user_id": session["user_id"],
        "goal_minutes": session["goal_minutes"],
        "status": session["status"],

        # Original MongoDB datetime fields
        "started_at": started_at,
        "ended_at": ended_at,
        "created_at": created_at,

        # Readable IST representations
        "started_at_ist": (
            session.get("started_at_ist")
            or to_ist_string(started_at)
        ),
        "ended_at_ist": (
            session.get("ended_at_ist")
            or to_ist_string(ended_at)
        ),
        "created_at_ist": (
            session.get("created_at_ist")
            or to_ist_string(created_at)
        ),

        "total_seconds": session.get("total_seconds", 0),
    }


def calculate_elapsed_seconds(started_at):
    """Calculate non-negative elapsed seconds from a start timestamp."""
    return max(
        0,
        int(
            (
                now_utc() - ensure_utc(started_at)
            ).total_seconds()
        ),
    )


def capped_total_seconds(session, additional_seconds=0):
    """Prevent recorded focus time from exceeding the session goal."""
    goal_seconds = session["goal_minutes"] * 60

    return min(
        goal_seconds,
        max(
            0,
            session.get("total_seconds", 0) + additional_seconds,
        ),
    )


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
    timestamp_ist = to_ist_string(timestamp)

    session = {
        "session_id": str(uuid4()),
        "user_id": user_id,
        "goal_minutes": payload.goal_minutes,
        "status": "running",

        "started_at": timestamp,
        "started_at_ist": timestamp_ist,

        "ended_at": None,
        "ended_at_ist": None,

        "total_seconds": 0,

        "running_since": timestamp,
        "running_since_ist": timestamp_ist,

        "created_at": timestamp,
        "created_at_ist": timestamp_ist,
    }

    sessions_collection.insert_one(session)

    return session_response(session)


@router.post("/{session_id}/pause")
def pause_session(
    session_id: str,
    user_id: str = Depends(get_current_user),
):
    """Pause a running session and save elapsed focus time."""

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

    elapsed = calculate_elapsed_seconds(session["running_since"])
    total_seconds = capped_total_seconds(session, elapsed)
    timestamp = now_utc()

    completed = (
        total_seconds >= session["goal_minutes"] * 60
    )

    sessions_collection.update_one(
        {
            "_id": session["_id"],
            "user_id": user_id,
            "status": "running",
        },
        {
            "$set": {
                "total_seconds": total_seconds,
                "status": "completed" if completed else "paused",

                "running_since": None,
                "running_since_ist": None,

                "ended_at": timestamp if completed else None,
                "ended_at_ist": (
                    to_ist_string(timestamp) if completed else None
                ),
            }
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
    """Resume a paused session if its goal has not been reached."""

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

    if (
        session.get("total_seconds", 0)
        >= session["goal_minutes"] * 60
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The session goal has already been reached.",
        )

    timestamp = now_utc()

    sessions_collection.update_one(
        {
            "_id": session["_id"],
            "user_id": user_id,
            "status": "paused",
        },
        {
            "$set": {
                "status": "running",
                "running_since": timestamp,
                "running_since_ist": to_ist_string(timestamp),
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
    """End an active session without exceeding its planned duration."""

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
        extra_seconds = calculate_elapsed_seconds(
            session["running_since"]
        )

    total_seconds = capped_total_seconds(
        session,
        extra_seconds,
    )

    timestamp = now_utc()

    sessions_collection.update_one(
        {
            "_id": session["_id"],
            "user_id": user_id,
            "status": {"$in": ["running", "paused"]},
        },
        {
            "$set": {
                "total_seconds": total_seconds,
                "status": "completed",

                "ended_at": timestamp,
                "ended_at_ist": to_ist_string(timestamp),

                "running_since": None,
                "running_since_ist": None,
            }
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
