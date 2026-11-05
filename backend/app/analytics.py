
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.database import activity_collection, sessions_collection, database, users_collection
from app.sessions import get_current_user
from app.ml_models import load_models


router = APIRouter(
    prefix="/api/v1/analytics",
    tags=["Analytics"],
)

# MongoDB collection for automatically collected browser metrics.
metrics_collection = database["tracking_metrics"]

# Load the five trained models once when this module is imported.
ML_MODELS = load_models()


# ---------------------------------------------------------
# REQUEST MODELS
# ---------------------------------------------------------

class PredictionInput(BaseModel):
    session_duration_min: float = Field(ge=0, le=1440)
    website_category: str
    current_app: str
    tab_switches_per_min: float = Field(ge=0)
    mouse_clicks_per_min: float = Field(ge=0)
    keystrokes_per_min: float = Field(ge=0)
    idle_time_min: float = Field(ge=0)
    time_of_day: str
    notifications_received: int = Field(ge=0)
    breaks_taken: int = Field(ge=0)
    task_goal_match_score: float = Field(ge=0, le=1)
    previous_focus_score: float = Field(ge=0, le=100)
    sleep_hours_previous_night: float = Field(ge=0, le=24)


class DailyTrackingMetric(BaseModel):
    date: date
    tab_switches: int = Field(default=0, ge=0)
    active_seconds: int = Field(default=0, ge=0)
    idle_seconds: int = Field(default=0, ge=0)


class TrackingMetricsSyncRequest(BaseModel):
    metrics: list[DailyTrackingMetric] = Field(max_length=1000)


# ---------------------------------------------------------
# DAILY ANALYTICS HELPER
# ---------------------------------------------------------

def get_daily_data(user_id: str, selected_date: date):
    """Collect website activity and focus sessions for one day."""

    day_string = selected_date.isoformat()

    activity = list(
        activity_collection.find(
            {
                "user_id": user_id,
                "date": day_string,
            },
            {"_id": 0},
        )
    )

    start = datetime.combine(selected_date, time.min)
    end = datetime.combine(
        selected_date + timedelta(days=1),
        time.min,
    )

    sessions = list(
        sessions_collection.find(
            {
                "user_id": user_id,
                "started_at": {
                    "$gte": start,
                    "$lt": end,
                },
            },
            {"_id": 0},
        )
    )

    productive_seconds = sum(
        item.get("seconds", 0)
        for item in activity
        if item.get("category") == "productive"
    )

    distracting_seconds = sum(
        item.get("seconds", 0)
        for item in activity
        if item.get("category") == "distracting"
    )

    total_activity_seconds = sum(
        item.get("seconds", 0)
        for item in activity
    )

    focus_seconds = sum(
        item.get("total_seconds", 0)
        for item in sessions
    )

    return {
        "date": day_string,
        "focus_minutes": round(focus_seconds / 60, 2),
        "productive_minutes": round(productive_seconds / 60, 2),
        "distracting_minutes": round(distracting_seconds / 60, 2),
        "total_tracked_minutes": round(
            total_activity_seconds / 60, 2
        ),
        "completed_sessions": sum(
            1
            for item in sessions
            if item.get("status") == "completed"
        ),
        "website_count": len(activity),
    }


# ---------------------------------------------------------
# WEEKLY FOCUS DASHBOARD
# ---------------------------------------------------------

IST = ZoneInfo("Asia/Kolkata")


def _as_utc(value: datetime) -> datetime:
    """Treat naive MongoDB datetimes as UTC and return an aware UTC value."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


@router.get("/weekly-focus")
def weekly_focus(
    user_id: str = Depends(get_current_user),
):
    """Return Monday-Sunday focus statistics for the current IST week."""
    now_ist = datetime.now(IST)
    today_ist = now_ist.date()
    week_start = today_ist - timedelta(days=today_ist.weekday())
    next_week_start = week_start + timedelta(days=7)

    # MongoDB stores session timestamps in UTC. Convert IST boundaries to UTC
    # before querying so sessions around midnight are assigned correctly.
    start_utc = datetime.combine(week_start, time.min, tzinfo=IST).astimezone(timezone.utc)
    end_utc = datetime.combine(next_week_start, time.min, tzinfo=IST).astimezone(timezone.utc)
    now_utc = datetime.now(timezone.utc)

    records = list(sessions_collection.find({
        "user_id": user_id,
        "started_at": {"$gte": start_utc, "$lt": end_utc},
    }, {"_id": 0}))

    daily = []
    for offset in range(7):
        day = week_start + timedelta(days=offset)
        day_start = datetime.combine(day, time.min, tzinfo=IST).astimezone(timezone.utc)
        day_end = datetime.combine(day + timedelta(days=1), time.min, tzinfo=IST).astimezone(timezone.utc)
        day_records = [
            item for item in records
            if item.get("started_at") is not None
            and day_start <= _as_utc(item["started_at"]) < day_end
        ]

        focus_seconds = 0
        for item in day_records:
            seconds = max(0, int(item.get("total_seconds", 0) or 0))
            if item.get("status") == "running" and item.get("running_since"):
                seconds += max(0, int((now_utc - _as_utc(item["running_since"])).total_seconds()))
            focus_seconds += seconds

        daily.append({
            "date": day.isoformat(),
            "day": day.strftime("%a"),
            "focus_seconds": focus_seconds,
            "focus_minutes": round(focus_seconds / 60, 2),
            "sessions": len(day_records),
            "completed_sessions": sum(1 for item in day_records if item.get("status") == "completed"),
        })

    total_seconds = sum(item["focus_seconds"] for item in daily)
    completed_sessions = sum(item["completed_sessions"] for item in daily)
    # Respect the user's saved daily goal when available; otherwise use the
    # same 120-minute default used by the dashboard.
    profile = users_collection.find_one({"user_id": user_id}, {"daily_goal_minutes": 1}) or {}
    daily_goal_minutes = int(profile.get("daily_goal_minutes", 120) or 120)
    weekly_goal_minutes = daily_goal_minutes * 7

    return {
        "week_start": week_start.isoformat(),
        "week_end": (next_week_start - timedelta(days=1)).isoformat(),
        "timezone": "Asia/Kolkata",
        "today": today_ist.isoformat(),
        "total_focus_seconds": total_seconds,
        "total_focus_minutes": round(total_seconds / 60, 2),
        "completed_sessions": completed_sessions,
        "total_sessions": sum(item["sessions"] for item in daily),
        "average_daily_focus_minutes": round(total_seconds / 60 / 7, 2),
        "daily_goal_minutes": daily_goal_minutes,
        "weekly_goal_minutes": weekly_goal_minutes,
        "weekly_goal_progress": round((total_seconds / 60 / weekly_goal_minutes) * 100, 1) if weekly_goal_minutes else 0,
        "daily": daily,
    }


# ---------------------------------------------------------
# 1. DAILY ANALYTICS
# ---------------------------------------------------------

@router.get("/daily")
def daily_analytics(
    selected_date: date = Query(
        default_factory=date.today,
        alias="date",
    ),
    user_id: str = Depends(get_current_user),
):
    return get_daily_data(user_id, selected_date)


# ---------------------------------------------------------
# 2. ACTIVITY-BASED FOCUS SCORE
# ---------------------------------------------------------

@router.get("/focus-score")
def focus_score(
    selected_date: date = Query(
        default_factory=date.today,
        alias="date",
    ),
    user_id: str = Depends(get_current_user),
):
    data = get_daily_data(user_id, selected_date)

    tracked = (
        data["productive_minutes"]
        + data["distracting_minutes"]
    )

    score = (
        round(100 * data["productive_minutes"] / tracked)
        if tracked > 0
        else None
    )

    return {
        "date": data["date"],
        "activity_based_focus_score": score,
        "score_available": score is not None,
        "note": (
            "Based on categorized website time; "
            "not the trained ML focus score."
        ),
    }


# ---------------------------------------------------------
# 3. DISTRACTION ANALYTICS
# ---------------------------------------------------------

@router.get("/distractions")
def distraction_analytics(
    days: int = Query(default=7, ge=1, le=90),
    user_id: str = Depends(get_current_user),
):
    start_date = date.today() - timedelta(days=days - 1)

    records = list(
        activity_collection.find(
            {
                "user_id": user_id,
                "date": {"$gte": start_date.isoformat()},
                "category": "distracting",
            },
            {"_id": 0},
        ).sort([
            ("date", -1),
            ("seconds", -1),
        ])
    )

    total_seconds = sum(
        record.get("seconds", 0)
        for record in records
    )

    return {
        "days": days,
        "total_distraction_minutes": round(
            total_seconds / 60, 2
        ),
        "distraction_count": len(records),
        "top_distractions": records[:10],
    }


# ---------------------------------------------------------
# 4. ANALYTICS SUMMARY
# ---------------------------------------------------------

@router.get("/summary")
def analytics_summary(
    days: int = Query(default=7, ge=1, le=90),
    user_id: str = Depends(get_current_user),
):
    today = date.today()

    daily = [
        get_daily_data(
            user_id,
            today - timedelta(days=offset),
        )
        for offset in range(days - 1, -1, -1)
    ]

    total_focus = sum(
        item["focus_minutes"] for item in daily
    )

    total_productive = sum(
        item["productive_minutes"] for item in daily
    )

    total_distracting = sum(
        item["distracting_minutes"] for item in daily
    )

    return {
        "period_days": days,
        "daily": daily,
        "totals": {
            "focus_minutes": round(total_focus, 2),
            "productive_minutes": round(total_productive, 2),
            "distracting_minutes": round(total_distracting, 2),
            "completed_sessions": sum(
                item["completed_sessions"]
                for item in daily
            ),
        },
    }


# ---------------------------------------------------------
# 5. SYNC AUTOMATICALLY COLLECTED BROWSER METRICS
# ---------------------------------------------------------

@router.post("/metrics/sync")
def sync_tracking_metrics(
    payload: TrackingMetricsSyncRequest,
    user_id: str = Depends(get_current_user),
):
    """
    Save daily browser metrics collected by the Chrome extension.

    Metrics include tab switches, active browsing time and
    idle time. Records are stored separately for each user and day.
    """

    saved = 0
    now = datetime.now(timezone.utc)

    for item in payload.metrics:
        day_string = item.date.isoformat()

        metrics_collection.update_one(
            {
                "user_id": user_id,
                "date": day_string,
            },
            {
                "$set": {
                    "tab_switches": item.tab_switches,
                    "active_seconds": item.active_seconds,
                    "idle_seconds": item.idle_seconds,
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "created_at": now,
                },
            },
            upsert=True,
        )

        saved += 1

    return {
        "message": "Tracking metrics synced successfully.",
        "saved": saved,
    }


# ---------------------------------------------------------
# 6. RETRIEVE AUTOMATICALLY COLLECTED METRICS
# ---------------------------------------------------------

@router.get("/metrics")
def get_tracking_metrics(
    selected_date: date = Query(
        default_factory=date.today,
        alias="date",
    ),
    user_id: str = Depends(get_current_user),
):
    """Return collected browser metrics for the authenticated user."""

    record = metrics_collection.find_one(
        {
            "user_id": user_id,
            "date": selected_date.isoformat(),
        },
        {"_id": 0},
    )

    if not record:
        return {
            "date": selected_date.isoformat(),
            "available": False,
            "tab_switches": 0,
            "active_seconds": 0,
            "idle_seconds": 0,
            "message": "No tracking metrics have been synced for this date.",
        }

    return {
        "date": record["date"],
        "available": True,
        "tab_switches": record.get("tab_switches", 0),
        "active_seconds": record.get("active_seconds", 0),
        "idle_seconds": record.get("idle_seconds", 0),
        "updated_at": record.get("updated_at"),
    }


# ---------------------------------------------------------
# 7. TRAINED ML PREDICTIONS
# ---------------------------------------------------------

@router.post("/predictions")
def predictions(
    inputs: PredictionInput,
    user_id: str = Depends(get_current_user),
):
    """
    Generate predictions using the existing five trained ML models.

    The current models still require all 13 original features.
    This endpoint retains the existing request format.
    """

    try:
        features = pd.DataFrame([inputs.model_dump()])

        focus_score_prediction = (
            ML_MODELS["focus_score"].predict(features)[0]
        )

        productivity_prediction = (
            ML_MODELS["productivity"].predict(features)[0]
        )

        attention_stability_prediction = (
            ML_MODELS["attention_stability"].predict(features)[0]
        )

        distraction_prediction = (
            ML_MODELS["distraction"].predict(features)[0]
        )

        focus_degradation_prediction = (
            ML_MODELS["focus_degradation"].predict(features)[0]
        )

        return {
            "available": True,
            "user_id": user_id,
            "prediction_type": "trained_ml_models",
            "predictions": {
                "focus_score": round(
                    float(focus_score_prediction), 2
                ),
                "productivity_score": round(
                    float(productivity_prediction), 2
                ),
                "attention_stability_score": round(
                    float(attention_stability_prediction), 2
                ),
                "distraction_analysis": str(
                    distraction_prediction
                ),
                "focus_degradation_risk": round(
                    float(focus_degradation_prediction), 2
                ),
            },
            "input_features": inputs.model_dump(),
            "note": (
                "These are experimental estimates based on the "
                "provided features and synthetic training data."
            ),
        }

    except Exception as exc:
        print(f"ML prediction error: {exc}")

        raise HTTPException(
            status_code=500,
            detail=(
                "Prediction failed. Check the backend terminal "
                "for the underlying model error."
            ),
        ) from exc


# ---------------------------------------------------------
# 8. ACTIVITY INSIGHTS
# ---------------------------------------------------------

@router.get("/insights")
def insights(
    selected_date: date = Query(
        default_factory=date.today,
        alias="date",
    ),
    user_id: str = Depends(get_current_user),
):
    data = get_daily_data(user_id, selected_date)
    messages = []

    if (
        data["distracting_minutes"]
        > data["productive_minutes"]
    ):
        messages.append(
            "More time was spent on distracting than "
            "productive websites."
        )

    if data["focus_minutes"] == 0:
        messages.append(
            "No focus-session time was recorded for this date."
        )

    if not messages:
        messages.append(
            "Keep tracking your activity to build "
            "more personalized insights."
        )

    return {
        "date": data["date"],
        "insights": messages,
    }
