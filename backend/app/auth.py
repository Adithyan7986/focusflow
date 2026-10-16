
from datetime import datetime, timedelta, timezone
from uuid import uuid4
import os

import jwt
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from pwdlib import PasswordHash

from app.database import users_collection

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

password_hash = PasswordHash.recommended()
JWT_SECRET = os.getenv("JWT_SECRET")

if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET is missing from backend/.env")

JWT_ALGORITHM = "HS256"
TOKEN_EXPIRE_MINUTES = 60 * 24


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


def create_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)

    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + timedelta(minutes=TOKEN_EXPIRE_MINUTES),
    }

    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def user_response(user: dict) -> dict:
    return {
        "id": user["user_id"],
        "name": user["name"],
        "email": user["email"],
    }


def auth_response(user: dict) -> dict:
    return {
        "message": "Authentication successful",
        "token": create_token(user["user_id"]),
        "user": user_response(user),
    }


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest):
    name = payload.name.strip()
    email = str(payload.email).strip().lower()

    if not name:
        raise HTTPException(
            status_code=400,
            detail="Name cannot be empty.",
        )

    if users_collection.find_one({"email": email}):
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists.",
        )

    user = {
        "user_id": str(uuid4()),
        "name": name,
        "email": email,
        "password_hash": password_hash.hash(payload.password),
        "created_at": datetime.now(timezone.utc),
    }

    users_collection.insert_one(user)

    return auth_response(user)


@router.post("/login")
def login(payload: LoginRequest):
    email = str(payload.email).strip().lower()

    user = users_collection.find_one({"email": email})

    if not user or not password_hash.verify(
        payload.password,
        user["password_hash"],
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password.",
        )

    return auth_response(user)
