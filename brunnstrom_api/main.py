"""
Brunnstrom Recovery Stage Classification API
=============================================
FastAPI wrapper around a scikit-learn Random Forest model that predicts
the Brunnstrom recovery stage (1-6) from biomechanical hand features.

Run locally:
    pip install -r requirements.txt
    uvicorn main:app --host 0.0.0.0 --port 8001 --reload

Deploy:
    - Render / Railway / Fly.io: point to this folder, start command above.
    - Make sure brunnstrom_rf_model.pkl and feature_columns.json sit next to main.py.
"""

import json
import os
from typing import Dict, List

import joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "brunnstrom_rf_model.pkl")
FEATURES_PATH = os.path.join(BASE_DIR, "feature_columns.json")

model = joblib.load(MODEL_PATH)
with open(FEATURES_PATH, "r") as f:
    FEATURE_COLUMNS: List[str] = json.load(f)

# Standard Brunnstrom stage labels
STAGE_LABELS: Dict[int, str] = {
    1: "Flaccid",
    2: "Spasticity appears",
    3: "Spasticity increases",
    4: "Spasticity decreases",
    5: "Complex movement",
    6: "Normal",
}

STAGE_DESCRIPTIONS: Dict[int, str] = {
    1: "No voluntary movement. Limb is flaccid with no muscle tone.",
    2: "Minimal voluntary movement. Spasticity begins to develop.",
    3: "Voluntary movement only in synergy patterns. Spasticity peaks.",
    4: "Movement begins to deviate from synergy. Spasticity decreases.",
    5: "More complex movement combinations possible. Synergies less dominant.",
    6: "Coordinated movement with near-normal speed and control.",
}

# ---------------------------------------------------------------------------
# FastAPI setup
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Brunnstrom Recovery Stage API",
    description="Predicts post-stroke motor recovery stage (Brunnstrom 1-6) from hand biomechanics.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class BrunnstromFeatures(BaseModel):
    rom_index_mcp: float = Field(..., description="Range of motion of index MCP joint (degrees)")
    rom_middle_mcp: float = Field(..., description="Range of motion of middle MCP joint (degrees)")
    rom_thumb_mcp: float = Field(..., description="Range of motion of thumb MCP joint (degrees)")
    mean_velocity: float
    peak_velocity: float
    velocity_variance: float
    mean_palm_acceleration: float
    mean_dominant_finger_acceleration: float
    mean_non_target_acceleration: float
    finger_correlation_score: float
    unintended_activation_ratio: float
    stability_score: float
    tremor_index: float
    smoothness_index: float


class BrunnstromPrediction(BaseModel):
    stage: int
    label: str
    description: str
    confidence: float
    probabilities: Dict[str, float]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": True,
        "n_features": len(FEATURE_COLUMNS),
        "feature_columns": FEATURE_COLUMNS,
        "stages": STAGE_LABELS,
    }


@app.post("/predict-brunnstrom", response_model=BrunnstromPrediction)
def predict_brunnstrom(features: BrunnstromFeatures):
    try:
        feature_dict = features.model_dump()
        # Build feature vector in the exact column order the model was trained on
        x = np.array([[feature_dict[col] for col in FEATURE_COLUMNS]])

        pred = int(model.predict(x)[0])

        # Probabilities (Random Forest supports predict_proba)
        proba_dict: Dict[str, float] = {}
        confidence = 1.0
        if hasattr(model, "predict_proba"):
            proba = model.predict_proba(x)[0]
            classes = [int(c) for c in model.classes_]
            proba_dict = {str(cls): round(float(p), 4) for cls, p in zip(classes, proba)}
            confidence = round(float(max(proba)), 4)

        return BrunnstromPrediction(
            stage=pred,
            label=STAGE_LABELS.get(pred, f"Stage {pred}"),
            description=STAGE_DESCRIPTIONS.get(pred, ""),
            confidence=confidence,
            probabilities=proba_dict,
        )
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Missing feature: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {e}")


if __name__ == "__main__":
    import uvicorn
    print("Starting Brunnstrom API on http://localhost:8001")
    print(f"Loaded model with {len(FEATURE_COLUMNS)} features")
    uvicorn.run(app, host="0.0.0.0", port=8001)
