
from datetime import datetime, time, timedelta, timezone
from typing import Literal
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.database import database, activity_collection, sessions_collection
from app.sessions import get_current_user

router = APIRouter(
    prefix="/api/recommendations",
    tags=["Recommendations"],
)

recommendations_collection = database["recommendations"]
metrics_collection = database["tracking_metrics"]

IST = ZoneInfo("Asia/Kolkata")

# One recommendation per user, rule, and local calendar day.
recommendations_collection.create_index(
    [("user_id", 1), ("recommendation_key", 1)],
    unique=True,
)
recommendations_collection.create_index(
    [("user_id", 1), ("created_at", -1)]
)


class GenerateRequest(BaseModel):
    force: bool = False


class RecommendationAction(BaseModel):
    action: Literal["complete", "dismiss", "save"]


def _today_window():
    """Return today's IST date and UTC start/end timestamps."""
    today = datetime.now(IST).date()
    start_local = datetime.combine(today, time.min, tzinfo=IST)
    end_local = start_local + timedelta(days=1)

    return (
        today,
        start_local.astimezone(timezone.utc),
        end_local.astimezone(timezone.utc),
    )


def _collect_signals(user_id: str) -> dict:
    """Collect today's activity, focus sessions, and browser metrics."""
    today, start_utc, end_utc = _today_window()
    day_key = today.isoformat()

    activity = list(
        activity_collection.find(
            {"user_id": user_id, "date": day_key},
            {"_id": 0},
        )
    )

    metrics = metrics_collection.find_one(
        {"user_id": user_id, "date": day_key},
        {"_id": 0},
    ) or {}

    sessions = list(
        sessions_collection.find(
            {
                "user_id": user_id,
                "started_at": {
                    "$gte": start_utc,
                    "$lt": end_utc,
                },
            },
            {"_id": 0},
        )
    )

    productive_seconds = sum(
        max(0, int(item.get("seconds", 0)))
        for item in activity
        if item.get("category") == "productive"
    )

    distracting_seconds = sum(
        max(0, int(item.get("seconds", 0)))
        for item in activity
        if item.get("category") == "distracting"
    )

    uncategorized_seconds = sum(
        max(0, int(item.get("seconds", 0)))
        for item in activity
        if item.get("category") == "uncategorized"
    )

    focus_seconds = sum(
        max(0, int(item.get("total_seconds", 0)))
        for item in sessions
    )

    active_seconds = max(0, int(metrics.get("active_seconds", 0)))
    idle_seconds = max(0, int(metrics.get("idle_seconds", 0)))
    tab_switches = max(0, int(metrics.get("tab_switches", 0)))

    tracked_browser_seconds = active_seconds + idle_seconds

    tab_switches_per_active_min = (
        tab_switches / max(active_seconds / 60, 1)
    )

    idle_ratio = (
        idle_seconds / tracked_browser_seconds
        if tracked_browser_seconds > 0
        else 0
    )

    return {
        "date": day_key,
        "activity_available": bool(activity),
        "metrics_available": bool(metrics),
        "sessions_available": bool(sessions),
        "productive_seconds": productive_seconds,
        "distracting_seconds": distracting_seconds,
        "uncategorized_seconds": uncategorized_seconds,
        "focus_seconds": focus_seconds,
        "active_seconds": active_seconds,
        "idle_seconds": idle_seconds,
        "tab_switches": tab_switches,
        "tab_switches_per_active_min": tab_switches_per_active_min,
        "idle_ratio": idle_ratio,
        "completed_sessions": sum(
            1 for item in sessions
            if item.get("status") == "completed"
        ),
    }


def _build_rule_recommendations(signals: dict) -> list:
    """Generate explainable recommendations from actual user activity."""
    items = []
    day_key = signals["date"]

    def add(
        rule_id,
        title,
        message,
        category,
        priority,
        action_text,
    ):
        items.append({
            "recommendation_key": f"{day_key}:{rule_id}",
            "rule_id": rule_id,
            "title": title,
            "message": message,
            "category": category,
            "priority": priority,
            "action_text": action_text,
            "source": "rule_based",
        })

    distracting_min = signals["distracting_seconds"] / 60
    productive_min = signals["productive_seconds"] / 60
    focus_min = signals["focus_seconds"] / 60

    if (
        signals["activity_available"]
        and distracting_min >= 20
        and distracting_min > productive_min
    ):
        add(
            "high_distracting_usage",
            "Reduce distracting website time",
            (
                f"You have spent {distracting_min:.0f} minutes on websites "
                "categorized as distracting today, more than on productive "
                "websites. Consider limiting them during focus sessions."
            ),
            "distraction",
            "high",
            "Review distracting websites",
        )

    if (
        signals["metrics_available"]
        and signals["tab_switches_per_active_min"] >= 1.5
    ):
        add(
            "frequent_tab_switching",
            "Reduce frequent tab switching",
            (
                f"Your browser recorded {signals['tab_switches']} tab "
                "switches today. Group related tasks and keep only the "
                "tabs you need open during a focus session."
            ),
            "focus",
            "medium",
            "Start a focused session",
        )

    if (
        signals["metrics_available"]
        and signals["idle_ratio"] >= 0.35
        and signals["active_seconds"] + signals["idle_seconds"] >= 900
    ):
        add(
            "high_idle_ratio",
            "Review your inactive browser time",
            (
                f"About {signals['idle_ratio'] * 100:.0f}% of your recorded "
                "browser time was idle. If you were taking a break, that is "
                "fine; otherwise, try a short, clearly defined task."
            ),
            "productivity",
            "medium",
            "Choose your next task",
        )

    if signals["sessions_available"] and focus_min >= 50:
        add(
            "take_a_break",
            "Schedule a recovery break",
            (
                f"You have recorded {focus_min:.0f} minutes of focus-session "
                "time today. Consider taking a short break before your next "
                "session."
            ),
            "break",
            "medium",
            "Take a 5-minute break",
        )

    if (
        signals["sessions_available"]
        and signals["completed_sessions"] == 0
        and focus_min == 0
    ):
        add(
            "start_first_focus_session",
            "Start with one focused session",
            (
                "No focus-session time has been recorded today. Start with "
                "a manageable 25-minute session and one clear task."
            ),
            "focus",
            "low",
            "Start a 25-minute session",
        )

    if (
        not signals["activity_available"]
        and not signals["metrics_available"]
        and not signals["sessions_available"]
    ):
        add(
            "enable_activity_tracking",
            "Build your activity history",
            (
                "There is not enough tracking data for personalized "
                "recommendations yet. Sign in to the browser extension, "
                "browse normally, and complete a focus session to build "
                "your activity history."
            ),
            "getting_started",
            "low",
            "Sync browser activity",
        )

    return items


def _add_optional_ml_signal(items: list, signals: dict) -> None:
    """Add an experimental ML insight if model inference succeeds."""
    try:
        import pandas as pd
        from app.analytics import ML_MODELS

        focus_minutes = signals["focus_seconds"] / 60

        features = pd.DataFrame([{
            "session_duration_min": min(focus_minutes, 1440),
            "website_category": (
                "distracting"
                if signals["distracting_seconds"]
                > signals["productive_seconds"]
                else "productive"
            ),
            "current_app": "Chrome",
            "tab_switches_per_min": (
                signals["tab_switches_per_active_min"]
            ),
            "mouse_clicks_per_min": 0,
            "keystrokes_per_min": 0,
            "idle_time_min": signals["idle_seconds"] / 60,
            "time_of_day": datetime.now(IST).strftime("%H:%M"),
            "notifications_received": 0,
            "breaks_taken": 0,
            "task_goal_match_score": 0,
            "previous_focus_score": 0,
            "sleep_hours_previous_night": 0,
        }])

        prediction = float(
            ML_MODELS["focus_degradation"].predict(features)[0]
        )

        items.append({
            "recommendation_key": (
                f"{signals['date']}:experimental_ml_context"
            ),
            "rule_id": "experimental_ml_context",
            "title": "Experimental focus-risk insight",
            "message": (
                "The experimental focus-degradation model returned "
                f"a score of {prediction:.1f}. Treat this as an "
                "exploratory estimate, not a validated assessment."
            ),
            "category": "ml_insight",
            "priority": "low",
            "action_text": "Review your focus pattern",
            "source": "experimental_ml",
            "experimental_score": round(prediction, 2),
        })

    except Exception as exc:
        # ML is optional; rule-based recommendations must still work.
        print(f"Optional recommendation ML signal unavailable: {exc}")


@router.post("/generate")
def generate_recommendations(
    payload: GenerateRequest = GenerateRequest(),
    user_id: str = Depends(get_current_user),
):
    """Generate today's recommendations for the authenticated user."""
    signals = _collect_signals(user_id)
    candidates = _build_rule_recommendations(signals)

    _add_optional_ml_signal(candidates, signals)

    now = datetime.now(timezone.utc)
    saved = 0

    for item in candidates:
        existing = recommendations_collection.find_one({
            "user_id": user_id,
            "recommendation_key": item["recommendation_key"],
        })

        # Never overwrite a user's completed, dismissed, or saved action.
        if existing:
            if existing.get("status") in {
                "completed",
                "dismissed",
                "saved",
            }:
                continue

            # Refresh an existing active recommendation.
            recommendations_collection.update_one(
                {
                    "user_id": user_id,
                    "recommendation_key": item["recommendation_key"],
                    "status": "active",
                },
                {
                    "$set": {
                        **item,
                        "updated_at": now,
                    }
                },
            )
            continue

        recommendations_collection.insert_one({
            **item,
            "recommendation_id": str(uuid4()),
            "date": signals["date"],
            "user_id": user_id,
            "status": "active",
            "created_at": now,
            "updated_at": now,
        })

        saved += 1

    records = list(
        recommendations_collection.find(
            {
                "user_id": user_id,
                "date": signals["date"],
            },
            {"_id": 0},
        ).sort("created_at", -1)
    )

    return {
        "message": "Recommendations generated.",
        "date": signals["date"],
        "generated_count": saved,
        "signals": {
            "activity_available": signals["activity_available"],
            "metrics_available": signals["metrics_available"],
            "sessions_available": signals["sessions_available"],
        },
        "recommendations": records,
        "note": (
            "Rule-based recommendations are primary. ML insights are "
            "experimental and use models trained on synthetic data."
        ),
    }


@router.get("")
def list_recommendations(
    days: int = Query(default=30, ge=1, le=90),
    status_filter: Literal[
        "all",
        "active",
        "completed",
        "dismissed",
        "saved",
    ] = Query(default="all", alias="status"),
    user_id: str = Depends(get_current_user),
):
    """Return the authenticated user's recommendation history."""
    start_date = (
        datetime.now(IST).date() - timedelta(days=days - 1)
    ).isoformat()

    query = {
        "user_id": user_id,
        "date": {"$gte": start_date},
    }

    if status_filter != "all":
        query["status"] = status_filter

    records = list(
        recommendations_collection.find(query, {"_id": 0})
        .sort("created_at", -1)
        .limit(300)
    )

    return {
        "days": days,
        "count": len(records),
        "recommendations": records,
    }


@router.patch("/{recommendation_id}/action")
def update_recommendation_action(
    recommendation_id: str,
    payload: RecommendationAction,
    user_id: str = Depends(get_current_user),
):
    """Complete, dismiss, or save a recommendation."""
    status_value = {
        "complete": "completed",
        "dismiss": "dismissed",
        "save": "saved",
    }[payload.action]

    result = recommendations_collection.update_one(
        {
            "recommendation_id": recommendation_id,
            "user_id": user_id,
        },
        {
            "$set": {
                "status": status_value,
                "action_updated_at": datetime.now(timezone.utc),
            }
        },
    )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Recommendation not found.",
        )

    record = recommendations_collection.find_one(
        {
            "recommendation_id": recommendation_id,
            "user_id": user_id,
        },
        {"_id": 0},
    )

    return {
        "message": "Recommendation updated.",
        "recommendation": record,
    }
