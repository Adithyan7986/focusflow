
from pathlib import Path

import joblib

# Models are stored in backend/models/
MODEL_DIR = Path(__file__).resolve().parent.parent / "models"

MODEL_FILES = {
    "focus_score": "focusflow_focus_score_model.pkl",
    "productivity": "focusflow_productivity_model.pkl",
    "attention_stability": "focusflow_attention_stability_model.pkl",
    "distraction": "focusflow_distraction_model.pkl",
    "focus_degradation": "focusflow_focus_degradation_model.pkl",
}


def load_models():
    loaded = {}

    for name, filename in MODEL_FILES.items():
        path = MODEL_DIR / filename

        if not path.exists():
            raise FileNotFoundError(
                f"ML model not found: {path}"
            )

        loaded[name] = joblib.load(path)

    return loaded
