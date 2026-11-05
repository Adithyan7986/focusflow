from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.database import (
    users_collection,
    sessions_collection,
    activity_collection,
)
from app.sessions import get_current_user

router = APIRouter(prefix="/api/admin", tags=["Admin"])


def require_admin(user_id: str = Depends(get_current_user)) -> str:
    """Authorize using the current MongoDB role, not a client-supplied value."""
    user = users_collection.find_one(
        {"user_id": user_id},
        {"_id": 0, "role": 1},
    )
    if not user or user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required.",
        )
    return user_id


def _safe_user(user: dict) -> dict:
    return {
        "user_id": user.get("user_id"),
        "name": user.get("name", ""),
        "email": user.get("email", ""),
        "role": user.get("role", "user"),
        "created_at": user.get("created_at"),
        "daily_goal_minutes": user.get("daily_goal_minutes", 120),
    }


@router.get("/access")
def admin_access(admin_id: str = Depends(require_admin)):
    return {"is_admin": True, "role": "admin"}


@router.get("/overview")
def admin_overview(admin_id: str = Depends(require_admin)):
    now = datetime.now(timezone.utc)
    since_7_days = now - timedelta(days=7)

    total_users = users_collection.count_documents({})
    total_sessions = sessions_collection.count_documents({})
    completed_sessions = sessions_collection.count_documents(
        {"status": "completed"}
    )
    active_sessions = sessions_collection.count_documents(
        {"status": {"$in": ["running", "paused"]}}
    )
    recent_users = users_collection.count_documents(
        {"created_at": {"$gte": since_7_days}}
    )
    recent_sessions = sessions_collection.count_documents(
        {"created_at": {"$gte": since_7_days}}
    )
    activity_pipeline = [
        {"$group": {"_id": None, "total_seconds": {"$sum": "$seconds"}}}
    ]
    activity_result = list(activity_collection.aggregate(activity_pipeline))
    tracked_activity_seconds = (
        int(activity_result[0].get("total_seconds", 0))
        if activity_result else 0
    )

    return {
        "total_users": total_users,
        "recent_users_7_days": recent_users,
        "total_sessions": total_sessions,
        "completed_sessions": completed_sessions,
        "active_sessions": active_sessions,
        "recent_sessions_7_days": recent_sessions,
        "tracked_activity_seconds": tracked_activity_seconds,
    }


@router.get("/users")
def admin_users(
    limit: int = Query(default=100, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
    admin_id: str = Depends(require_admin),
):
    cursor = (
        users_collection.find(
            {},
            {
                "_id": 0,
                "user_id": 1,
                "name": 1,
                "email": 1,
                "role": 1,
                "created_at": 1,
                "daily_goal_minutes": 1,
            },
        )
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
    )
    return {
        "total": users_collection.count_documents({}),
        "limit": limit,
        "skip": skip,
        "users": [_safe_user(user) for user in cursor],
    }


@router.get("/sessions")
def admin_sessions(
    limit: int = Query(default=100, ge=1, le=500),
    admin_id: str = Depends(require_admin),
):
    cursor = (
        sessions_collection.find(
            {},
            {
                "_id": 0,
                "session_id": 1,
                "user_id": 1,
                "goal_minutes": 1,
                "status": 1,
                "started_at": 1,
                "ended_at": 1,
                "created_at": 1,
                "total_seconds": 1,
            },
        )
        .sort("created_at", -1)
        .limit(limit)
    )
    records = list(cursor)
    user_ids = list({item.get("user_id") for item in records if item.get("user_id")})
    user_map = {
        user["user_id"]: {"name": user.get("name", ""), "email": user.get("email", "")}
        for user in users_collection.find(
            {"user_id": {"$in": user_ids}},
            {"_id": 0, "user_id": 1, "name": 1, "email": 1},
        )
    }
    for item in records:
        item["user"] = user_map.get(item.get("user_id"), {})
    return {"sessions": records}


@router.get("/activity")
def admin_activity(
    days: int = Query(default=7, ge=1, le=30),
    limit: int = Query(default=200, ge=1, le=500),
    admin_id: str = Depends(require_admin),
):
    start_date = (datetime.now(timezone.utc).date() - timedelta(days=days - 1)).isoformat()
    pipeline = [
        {"$match": {"date": {"$gte": start_date}}},
        {"$group": {
            "_id": {
                "user_id": "$user_id",
                "date": "$date",
                "category": "$category",
            },
            "seconds": {"$sum": "$seconds"},
            "domains": {"$addToSet": "$domain"},
        }},
        {"$sort": {"_id.date": -1, "seconds": -1}},
        {"$limit": limit},
    ]
    rows = list(activity_collection.aggregate(pipeline))
    user_ids = list({row["_id"]["user_id"] for row in rows})
    user_map = {
        user["user_id"]: {"name": user.get("name", ""), "email": user.get("email", "")}
        for user in users_collection.find(
            {"user_id": {"$in": user_ids}},
            {"_id": 0, "user_id": 1, "name": 1, "email": 1},
        )
    }
    activity = []
    for row in rows:
        key = row["_id"]
        activity.append({
            "user_id": key["user_id"],
            "user": user_map.get(key["user_id"], {}),
            "date": key["date"],
            "category": key.get("category") or "uncategorized",
            "seconds": int(row.get("seconds", 0)),
            "domains": row.get("domains", []),
        })
    return {"days": days, "count": len(activity), "activity": activity}
