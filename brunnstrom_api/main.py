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
from collections import defaultdict
from io import BytesIO
from typing import Dict, List, Optional

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from session_runner import start as start_session
from session_runner import status as session_status
from session_runner import stop as stop_session

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


class PerMovementPrediction(BaseModel):
    movement_name: str
    trial_index: Optional[int] = None
    stage: int
    label: str
    confidence: float
    probabilities: Dict[str, float]


class SessionPrediction(BaseModel):
    overall: BrunnstromPrediction
    per_movement: List[PerMovementPrediction]
    excel_filename: str
    trial_count: int


# ---------------------------------------------------------------------------
# Shared prediction helpers
# ---------------------------------------------------------------------------
def _predict_one(feature_vector: np.ndarray) -> BrunnstromPrediction:
    pred = int(model.predict(feature_vector)[0])
    proba_dict: Dict[str, float] = {}
    confidence = 1.0
    if hasattr(model, "predict_proba"):
        proba = model.predict_proba(feature_vector)[0]
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


def _predict_from_dataframe(df: pd.DataFrame) -> SessionPrediction:
    missing = [c for c in FEATURE_COLUMNS if c not in df.columns]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Excel is missing required feature columns: {missing}",
        )

    rows = df[FEATURE_COLUMNS].to_numpy(dtype=float)
    if len(rows) == 0:
        raise HTTPException(status_code=400, detail="Excel contains no trial rows.")

    per_movement: List[PerMovementPrediction] = []
    weighted_proba: Dict[int, float] = defaultdict(float)

    for i, row in enumerate(rows):
        x = row.reshape(1, -1)
        pred = _predict_one(x)
        movement_name = (
            str(df.iloc[i].get("movement_name") or df.iloc[i].get("movement_id") or f"trial_{i + 1}")
        )
        trial_idx_val = df.iloc[i].get("trial_index")
        try:
            trial_idx = int(trial_idx_val) if pd.notna(trial_idx_val) else None
        except (TypeError, ValueError):
            trial_idx = None

        per_movement.append(
            PerMovementPrediction(
                movement_name=movement_name,
                trial_index=trial_idx,
                stage=pred.stage,
                label=pred.label,
                confidence=pred.confidence,
                probabilities=pred.probabilities,
            )
        )

        for stage_str, p in pred.probabilities.items():
            weighted_proba[int(stage_str)] += p

    # Overall = aggregated probabilities across all trials, normalized
    total = sum(weighted_proba.values()) or 1.0
    overall_proba = {str(k): round(v / total, 4) for k, v in sorted(weighted_proba.items())}
    overall_stage = max(weighted_proba, key=weighted_proba.get)
    overall_conf = round(weighted_proba[overall_stage] / total, 4)

    overall = BrunnstromPrediction(
        stage=overall_stage,
        label=STAGE_LABELS.get(overall_stage, f"Stage {overall_stage}"),
        description=STAGE_DESCRIPTIONS.get(overall_stage, ""),
        confidence=overall_conf,
        probabilities=overall_proba,
    )

    return SessionPrediction(
        overall=overall,
        per_movement=per_movement,
        excel_filename="",
        trial_count=len(rows),
    )


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
        x = np.array([[feature_dict[col] for col in FEATURE_COLUMNS]])
        return _predict_one(x)
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Missing feature: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {e}")


# ---------------------------------------------------------------------------
# Session-driven endpoints (wrap the local OpenCV data acquisition CLI)
# ---------------------------------------------------------------------------
@app.post("/session/start")
def session_start():
    try:
        info = start_session()
        return {
            "session_id": info.session_id,
            "started_at": info.started_at,
            "pid": info.process.pid,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/session/status")
def session_status_endpoint():
    return session_status()


@app.post("/session/stop", response_model=SessionPrediction)
def session_stop():
    try:
        session_path = stop_session()
        if session_path.suffix.lower() == ".csv":
            df = pd.read_csv(session_path)
        else:
            df = pd.read_excel(session_path)
        prediction = _predict_from_dataframe(df)
        prediction.excel_filename = session_path.name
        return prediction
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Stop/predict failed: {e}")


@app.post("/predict-from-excel", response_model=SessionPrediction)
async def predict_from_excel(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        df = pd.read_excel(BytesIO(contents))
        prediction = _predict_from_dataframe(df)
        prediction.excel_filename = file.filename or ""
        return prediction
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Excel prediction failed: {e}")


if __name__ == "__main__":
    import uvicorn
    print("Starting Brunnstrom API on http://localhost:8001")
    print(f"Loaded model with {len(FEATURE_COLUMNS)} features")
    uvicorn.run(app, host="0.0.0.0", port=8001)
