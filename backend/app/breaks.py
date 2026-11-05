from datetime import datetime, timezone
from uuid import uuid4
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.database import database
from app.sessions import get_current_user

router = APIRouter(prefix="/api/breaks", tags=["Break Scheduling"])
breaks_collection = database["break_sessions"]


def now_utc():
    return datetime.now(timezone.utc)


def as_utc(value):
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def elapsed_seconds(item, now=None):
    total = max(0, int(item.get("elapsed_seconds", 0)))
    if item.get("status") == "running" and item.get("running_since"):
        now = now or now_utc()
        total += max(0, int((now - as_utc(item["running_since"])).total_seconds()))
    return total


def break_response(item):
    now = now_utc()
    elapsed = elapsed_seconds(item, now)
    return {
        "id": item["break_id"],
        "user_id": item["user_id"],
        "break_type": item["break_type"],
        "duration_minutes": item["duration_minutes"],
        "status": item["status"],
        "elapsed_seconds": elapsed,
        "remaining_seconds": max(0, item["duration_minutes"] * 60 - elapsed),
        "created_at": item.get("created_at"),
        "started_at": item.get("started_at"),
        "ended_at": item.get("ended_at"),
        "running_since": item.get("running_since"),
    }


class StartBreakRequest(BaseModel):
    break_type: Literal["short", "long"] = "short"
    duration_minutes: int = Field(default=5, ge=1, le=30)


@router.post("/start")
def start_break(
    payload: StartBreakRequest,
    user_id: str = Depends(get_current_user),
):
    active = breaks_collection.find_one({
        "user_id": user_id,
        "status": {"$in": ["running", "paused"]},
    })
    if active:
        raise HTTPException(status_code=409, detail="You already have an active break.")

    expected_duration = 15 if payload.break_type == "long" else 5
    if payload.duration_minutes != expected_duration:
        raise HTTPException(
            status_code=422,
            detail=f"{payload.break_type.title()} breaks must be {expected_duration} minutes.",
        )

    now = now_utc()
    item = {
        "break_id": str(uuid4()),
        "user_id": user_id,
        "break_type": payload.break_type,
        "duration_minutes": payload.duration_minutes,
        "status": "running",
        "elapsed_seconds": 0,
        "created_at": now,
        "started_at": now,
        "running_since": now,
        "ended_at": None,
    }
    breaks_collection.insert_one(item)
    return break_response(item)


@router.get("")
def list_breaks(
    limit: int = Query(default=30, ge=1, le=100),
    user_id: str = Depends(get_current_user),
):
    items = breaks_collection.find(
        {"user_id": user_id},
        {"_id": 0},
    ).sort("created_at", -1).limit(limit)
    return {"breaks": [break_response(item) for item in items]}


def get_owned_break(break_id: str, user_id: str):
    item = breaks_collection.find_one({
        "break_id": break_id,
        "user_id": user_id,
    })
    if not item:
        raise HTTPException(status_code=404, detail="Break session not found.")
    return item


@router.post("/{break_id}/pause")
def pause_break(break_id: str, user_id: str = Depends(get_current_user)):
    item = get_owned_break(break_id, user_id)
    if item["status"] != "running":
        raise HTTPException(status_code=409, detail="Only a running break can be paused.")
    now = now_utc()
    elapsed = elapsed_seconds(item, now)
    remaining = max(0, item["duration_minutes"] * 60 - elapsed)
    if remaining == 0:
        breaks_collection.update_one(
            {"break_id": break_id, "user_id": user_id},
            {"$set": {"status": "completed", "elapsed_seconds": item["duration_minutes"] * 60,
                      "running_since": None, "ended_at": now}},
        )
    else:
        breaks_collection.update_one(
            {"break_id": break_id, "user_id": user_id},
            {"$set": {"status": "paused", "elapsed_seconds": elapsed, "running_since": None}},
        )
    updated = get_owned_break(break_id, user_id)
    return break_response(updated)


@router.post("/{break_id}/resume")
def resume_break(break_id: str, user_id: str = Depends(get_current_user)):
    item = get_owned_break(break_id, user_id)
    if item["status"] != "paused":
        raise HTTPException(status_code=409, detail="Only a paused break can be resumed.")
    now = now_utc()
    if int(item.get("elapsed_seconds", 0)) >= item["duration_minutes"] * 60:
        raise HTTPException(status_code=409, detail="This break has already elapsed.")
    breaks_collection.update_one(
        {"break_id": break_id, "user_id": user_id},
        {"$set": {"status": "running", "running_since": now}},
    )
    return break_response(get_owned_break(break_id, user_id))


@router.post("/{break_id}/complete")
def complete_break(break_id: str, user_id: str = Depends(get_current_user)):
    item = get_owned_break(break_id, user_id)
    if item["status"] not in ["running", "paused"]:
        raise HTTPException(status_code=409, detail="This break is no longer active.")
    now = now_utc()
    elapsed = min(item["duration_minutes"] * 60, elapsed_seconds(item, now))
    breaks_collection.update_one(
        {"break_id": break_id, "user_id": user_id},
        {"$set": {"status": "completed", "elapsed_seconds": elapsed,
                  "running_since": None, "ended_at": now}},
    )
    return break_response(get_owned_break(break_id, user_id))


@router.post("/{break_id}/skip")
def skip_break(break_id: str, user_id: str = Depends(get_current_user)):
    item = get_owned_break(break_id, user_id)
    if item["status"] not in ["running", "paused"]:
        raise HTTPException(status_code=409, detail="This break is no longer active.")
    now = now_utc()
    elapsed = elapsed_seconds(item, now)
    breaks_collection.update_one(
        {"break_id": break_id, "user_id": user_id},
        {"$set": {"status": "skipped", "elapsed_seconds": elapsed,
                  "running_since": None, "ended_at": now}},
    )
    return break_response(get_owned_break(break_id, user_id))
