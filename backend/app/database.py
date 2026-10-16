
import os

from dotenv import load_dotenv
from pymongo import MongoClient, ASCENDING

# Load environment variables from backend/.env
load_dotenv()

# Read MongoDB connection string
MONGO_URI = os.getenv("MONGO_URI")

if not MONGO_URI:
    raise RuntimeError(
        "MONGO_URI is missing from backend/.env"
    )

# Connect to MongoDB Atlas
client = MongoClient(
    MONGO_URI,
    serverSelectionTimeoutMS=5000,
)

# Select the FocusFlow database
database = client["focusflow"]

# Collections
users_collection = database["users"]
sessions_collection = database["focus_sessions"]
activity_collection = database["activity_logs"]

# Ensure each email belongs to only one account
users_collection.create_index(
    [("email", ASCENDING)],
    unique=True,
)

# Ensure one activity summary per user, date, and domain
activity_collection.create_index(
    [
        ("user_id", ASCENDING),
        ("date", ASCENDING),
        ("domain", ASCENDING),
    ],
    unique=True,
)


def check_database_connection():
    """Check whether MongoDB is reachable."""
    client.admin.command("ping")
    return True