from datetime import date, datetime, time, timedelta, timezone
from typing import Optional
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.database import database
from app.sessions import get_current_user

router = APIRouter(prefix="/api/habits", tags=["Habit Tracking"])

habits_collection = database["habits"]
habit_completions_collection = database["habit_completions"]

IST = ZoneInfo("Asia/Kolkata")

# One completion record per user, habit, and local calendar day.
habits_collection.create_index([("user_id", 1), ("habit_id", 1)], unique=True)
habits_collection.create_index([("user_id", 1), ("is_active", 1)])
habit_completions_collection.create_index(
    [("user_id", 1), ("habit_id", 1), ("date", 1)], unique=True
)
habit_completions_collection.create_index([("user_id", 1), ("date", -1)])


class HabitCreate(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=240)


class HabitUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=80)
    description: Optional[str] = Field(default=None, max_length=240)
    is_active: Optional[bool] = None


def today_ist() -> date:
    return datetime.now(IST).date()


def habit_payload(habit: dict, completed_today: bool = False, streak: int = 0):
    return {
        "id": habit["habit_id"],
        "title": habit["title"],
        "description": habit.get("description", ""),
        "is_active": habit.get("is_active", True),
        "created_at": habit["created_at"].isoformat(),
        "completed_today": completed_today,
        "current_streak": streak,
    }


def completion_dates(user_id: str, habit_id: str, end_day: date, limit: int = 400):
    start_day = end_day - timedelta(days=limit - 1)
    rows = habit_completions_collection.find(
        {
            "user_id": user_id,
            "habit_id": habit_id,
            "date": {"$gte": start_day.isoformat(), "$lte": end_day.isoformat()},
        },
        {"_id": 0, "date": 1},
    ).sort("date", -1)
    return [date.fromisoformat(row["date"]) for row in rows]


def calculate_streak(dates: list[date], today: date) -> int:
    completed = set(dates)
    # A habit completed yesterday but not yet today retains its current streak.
    cursor = today if today in completed else today - timedelta(days=1)
    if cursor not in completed:
        return 0
    streak = 0
    while cursor in completed:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


@router.post("", status_code=status.HTTP_201_CREATED)
def create_habit(payload: HabitCreate, user_id: str = Depends(get_current_user)):
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Habit title cannot be empty.")

    now = datetime.now(timezone.utc)
    habit = {
        "habit_id": str(uuid4()),
        "user_id": user_id,
        "title": title,
        "description": payload.description.strip(),
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    habits_collection.insert_one(habit)
    return habit_payload(habit)


@router.get("")
def list_habits(
    include_archived: bool = Query(default=False),
    user_id: str = Depends(get_current_user),
):
    query = {"user_id": user_id}
    if not include_archived:
        query["is_active"] = True

    today = today_ist()
    results = []
    for habit in habits_collection.find(query, {"_id": 0}).sort("created_at", 1):
        dates = completion_dates(user_id, habit["habit_id"], today)
        results.append(
            habit_payload(
                habit,
                completed_today=today in set(dates),
                streak=calculate_streak(dates, today),
            )
        )
    return {"habits": results, "date": today.isoformat()}


@router.patch("/{habit_id}")
def update_habit(
    habit_id: str,
    payload: HabitUpdate,
    user_id: str = Depends(get_current_user),
):
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No changes supplied.")
    if "title" in updates:
        updates["title"] = updates["title"].strip()
        if not updates["title"]:
            raise HTTPException(status_code=422, detail="Habit title cannot be empty.")
    if "description" in updates:
        updates["description"] = updates["description"].strip()

    updates["updated_at"] = datetime.now(timezone.utc)
    result = habits_collection.update_one(
        {"habit_id": habit_id, "user_id": user_id}, {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Habit not found.")
    habit = habits_collection.find_one(
        {"habit_id": habit_id, "user_id": user_id}, {"_id": 0}
    )
    today = today_ist()
    dates = completion_dates(user_id, habit_id, today)
    return habit_payload(
        habit, today in set(dates), calculate_streak(dates, today)
    )


@router.delete("/{habit_id}")
def delete_habit(habit_id: str, user_id: str = Depends(get_current_user)):
    result = habits_collection.delete_one({"habit_id": habit_id, "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Habit not found.")
    habit_completions_collection.delete_many(
        {"habit_id": habit_id, "user_id": user_id}
    )
    return {"message": "Habit and its completion history deleted.", "id": habit_id}


@router.post("/{habit_id}/complete")
def complete_habit(habit_id: str, user_id: str = Depends(get_current_user)):
    habit = habits_collection.find_one(
        {"habit_id": habit_id, "user_id": user_id, "is_active": True}
    )
    if not habit:
        raise HTTPException(status_code=404, detail="Active habit not found.")

    today = today_ist()
    now = datetime.now(timezone.utc)
    habit_completions_collection.update_one(
        {
            "user_id": user_id,
            "habit_id": habit_id,
            "date": today.isoformat(),
        },
        {
            "$setOnInsert": {
                "completion_id": str(uuid4()),
                "user_id": user_id,
                "habit_id": habit_id,
                "date": today.isoformat(),
                "completed_at": now,
            }
        },
        upsert=True,
    )
    dates = completion_dates(user_id, habit_id, today)
    return {
        "message": "Habit marked complete for today.",
        "habit_id": habit_id,
        "date": today.isoformat(),
        "completed_today": True,
        "current_streak": calculate_streak(dates, today),
    }


@router.delete("/{habit_id}/complete")
def undo_habit_completion(habit_id: str, user_id: str = Depends(get_current_user)):
    habit = habits_collection.find_one({"habit_id": habit_id, "user_id": user_id})
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found.")

    today = today_ist()
    habit_completions_collection.delete_one(
        {"user_id": user_id, "habit_id": habit_id, "date": today.isoformat()}
    )
    dates = completion_dates(user_id, habit_id, today)
    return {
        "message": "Today's completion has been removed.",
        "habit_id": habit_id,
        "date": today.isoformat(),
        "completed_today": False,
        "current_streak": calculate_streak(dates, today),
    }


@router.get("/progress")
def habit_progress(
    days: int = Query(default=7, ge=7, le=30),
    user_id: str = Depends(get_current_user),
):
    today = today_ist()
    start_day = today - timedelta(days=days - 1)
    active_habits = list(
        habits_collection.find(
            {"user_id": user_id, "is_active": True},
            {"_id": 0, "habit_id": 1, "title": 1},
        )
    )
    daily_rows = []
    total_possible = len(active_habits)
    total_completed = 0

    for offset in range(days):
        day = start_day + timedelta(days=offset)
        completed_ids = {
            row["habit_id"]
            for row in habit_completions_collection.find(
                {
                    "user_id": user_id,
                    "date": day.isoformat(),
                    "habit_id": {"$in": [h["habit_id"] for h in active_habits]},
                },
                {"_id": 0, "habit_id": 1},
            )
        } if active_habits else set()
        count = len(completed_ids)
        total_completed += count
        daily_rows.append(
            {
                "date": day.isoformat(),
                "completed": count,
                "total": total_possible,
                "completion_percentage": round(count / total_possible * 100)
                if total_possible else 0,
            }
        )

    return {
        "start_date": start_day.isoformat(),
        "end_date": today.isoformat(),
        "active_habits": total_possible,
        "completed_check_ins": total_completed,
        "possible_check_ins": total_possible * days,
        "overall_completion_percentage": round(
            total_completed / (total_possible * days) * 100
        ) if total_possible else 0,
        "daily_progress": daily_rows,
        "habits": [
            {
                "id": h["habit_id"],
                "title": h["title"],
                "completed_days": habit_completions_collection.count_documents(
                    {
                        "user_id": user_id,
                        "habit_id": h["habit_id"],
                        "date": {
                            "$gte": start_day.isoformat(),
                            "$lte": today.isoformat(),
                        },
                    }
                ),
            }
            for h in active_habits
        ],
    }
