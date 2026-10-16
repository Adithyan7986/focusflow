
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.database import activity_collection
from app.sessions import get_current_user


router = APIRouter(
    prefix="/api/activity",
    tags=["Website Activity"],
)


class ActivityEntry(BaseModel):
    date: date
    domain: str = Field(min_length=1, max_length=253)
    seconds: int = Field(ge=0, le=86400)
    category: Literal[
        "productive",
        "distracting",
        "uncategorized",
    ] = "uncategorized"


class ActivitySyncRequest(BaseModel):
    entries: list[ActivityEntry] = Field(max_length=1000)


@router.post("/sync")
def sync_activity(
    payload: ActivitySyncRequest,
    user_id: str = Depends(get_current_user),
):
    """Save website activity summaries for the authenticated user."""

    saved = 0

    for entry in payload.entries:
        domain = entry.domain.strip().lower().removeprefix("www.")

        if not domain or domain == "null":
            continue

        activity_collection.update_one(
            {
                "user_id": user_id,
                "date": entry.date.isoformat(),
                "domain": domain,
            },
            {
                "$set": {
                    "seconds": entry.seconds,
                    "category": entry.category,
                    "updated_at": datetime.now(timezone.utc),
                },
                "$setOnInsert": {
                    "created_at": datetime.now(timezone.utc),
                },
            },
            upsert=True,
        )

        saved += 1

    return {
        "message": "Website activity synced successfully.",
        "saved": saved,
    }


@router.get("")
def get_activity(
    days: int = Query(default=7, ge=1, le=30),
    user_id: str = Depends(get_current_user),
):
    """Return recent website activity for the authenticated user."""

    start_date = (
        date.today() - timedelta(days=days - 1)
    ).isoformat()

    records = list(
        activity_collection.find(
            {
                "user_id": user_id,
                "date": {"$gte": start_date},
            },
            {"_id": 0},
        ).sort(
            [("date", -1), ("seconds", -1)]
        )
    )

    return {
        "days": days,
        "activity": records,
    }
