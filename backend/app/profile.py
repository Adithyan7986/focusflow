
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.database import users_collection
from app.sessions import get_current_user

router = APIRouter(prefix="/api/profile", tags=["Profile"])

DEFAULT_DAILY_GOAL = 120


class ProfileUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    daily_goal_minutes: int = Field(ge=15, le=720)


def profile_response(user: dict) -> dict:
    return {
        "id": user["user_id"],
        "name": user["name"],
        "email": user["email"],
        "daily_goal_minutes": user.get(
            "daily_goal_minutes",
            DEFAULT_DAILY_GOAL,
        ),
    }


@router.get("")
def get_profile(user_id: str = Depends(get_current_user)):
    user = users_collection.find_one({"user_id": user_id})

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found.",
        )

    return profile_response(user)


@router.put("")
def update_profile(
    payload: ProfileUpdateRequest,
    user_id: str = Depends(get_current_user),
):
    name = payload.name.strip()

    if not name:
        raise HTTPException(
            status_code=400,
            detail="Name cannot be empty.",
        )

    result = users_collection.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "name": name,
                "daily_goal_minutes": payload.daily_goal_minutes,
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=404,
            detail="User not found.",
        )

    user = users_collection.find_one({"user_id": user_id})

    return {
        "message": "Profile updated successfully.",
        "profile": profile_response(user),
    }
