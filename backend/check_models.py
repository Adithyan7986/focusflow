
from pathlib import Path
import joblib
import sklearn

MODEL_DIR = Path(__file__).parent / "models"

model_files = [
    "focusflow_focus_score_model.pkl",
    "focusflow_productivity_model.pkl",
    "focusflow_attention_stability_model.pkl",
    "focusflow_distraction_model.pkl",
    "focusflow_focus_degradation_model.pkl",
]

print("Scikit-learn version:", sklearn.__version__)

for filename in model_files:
    path = MODEL_DIR / filename

    if not path.exists():
        print(f"MISSING: {filename}")
        continue

    try:
        model = joblib.load(path)
        print(f"OK: {filename} — {type(model).__name__}")
    except Exception as exc:
        print(f"ERROR: {filename} — {exc}")
