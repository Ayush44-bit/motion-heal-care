"""
FastAPI wrapper for the NeuroGlove Hand Detection system.
Run this alongside your Python backend to serve predictions to the frontend.

Usage:
  1. Place this file in the same directory as your neuroglove-data-acquisition code
  2. pip install fastapi uvicorn python-multipart
  3. python api_server.py

The frontend sends base64-encoded webcam frames and receives joint angles + mobility score.
"""

import cv2
import numpy as np
import base64
import time
import mediapipe as mp
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Optional

from biomechanics import BiomechanicalFeatureExtractor

app = FastAPI(title="NeuroGlove Hand Detection API")

# Allow CORS from any origin (for local dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize MediaPipe Hands
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    static_image_mode=True,
    max_num_hands=1,
    min_detection_confidence=0.7,
    min_tracking_confidence=0.5,
)

# Initialize biomechanical feature extractor
extractor = BiomechanicalFeatureExtractor(smoothing_window=5)


class PredictRequest(BaseModel):
    image: str  # base64-encoded JPEG frame


class PredictResponse(BaseModel):
    hand_detected: bool
    confidence: float
    angles: Dict[str, float]
    velocities: Dict[str, float]
    mobility_score: int  # 0-10
    mobility_level: str  # "full", "partial", "minimal", "none"


def classify_mobility(angles: Dict[str, float], velocities: Dict[str, float]) -> tuple:
    """
    Classify mobility based on joint angles and velocities.
    Returns (score: int 0-10, level: str).
    """
    if not angles:
        return 0, "none"

    # Calculate average range of motion across all joints
    angle_values = [abs(v) for v in angles.values() if v != 0]
    velocity_values = [abs(v) for v in velocities.values() if v != 0]

    if not angle_values:
        return 0, "none"

    avg_angle = np.mean(angle_values)
    max_angle = np.max(angle_values)
    avg_velocity = np.mean(velocity_values) if velocity_values else 0

    # Score based on angle range and movement
    score = 0

    # Base score from average angle (0-5 points)
    if avg_angle > 100:
        score += 5
    elif avg_angle > 70:
        score += 4
    elif avg_angle > 45:
        score += 3
    elif avg_angle > 20:
        score += 2
    elif avg_angle > 5:
        score += 1

    # Bonus from max angle diversity (0-3 points)
    if max_angle > 140:
        score += 3
    elif max_angle > 100:
        score += 2
    elif max_angle > 50:
        score += 1

    # Bonus from velocity (0-2 points) — indicates active movement
    if avg_velocity > 50:
        score += 2
    elif avg_velocity > 15:
        score += 1

    score = min(score, 10)

    if score >= 7:
        level = "full"
    elif score >= 4:
        level = "partial"
    elif score >= 1:
        level = "minimal"
    else:
        level = "none"

    return score, level


@app.post("/predict", response_model=PredictResponse)
async def predict(request: PredictRequest):
    """
    Receive a base64-encoded webcam frame, run hand detection,
    compute biomechanical features, and return mobility assessment.
    """
    try:
        # Decode base64 image
        image_data = base64.b64decode(request.image)
        np_arr = np.frombuffer(image_data, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if frame is None:
            return PredictResponse(
                hand_detected=False,
                confidence=0.0,
                angles={},
                velocities={},
                mobility_score=0,
                mobility_level="none",
            )

        # Convert BGR to RGB for MediaPipe
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = hands.process(rgb_frame)

        if not results.multi_hand_landmarks:
            return PredictResponse(
                hand_detected=False,
                confidence=0.0,
                angles={},
                velocities={},
                mobility_score=0,
                mobility_level="none",
            )

        # Get first hand landmarks
        hand_landmarks = results.multi_hand_landmarks[0]
        confidence = results.multi_handedness[0].classification[0].score

        # Extract landmarks list
        landmarks = hand_landmarks.landmark

        # Compute joint angles
        angles = extractor.calculate_finger_angles(landmarks)

        # Compute velocities and accelerations
        timestamp = time.time()
        velocities, accelerations = extractor.compute_derivatives(angles, timestamp)

        # Classify mobility
        score, level = classify_mobility(angles, velocities)

        return PredictResponse(
            hand_detected=True,
            confidence=round(confidence, 3),
            angles={k: round(v, 1) for k, v in angles.items()},
            velocities={k: round(v, 1) for k, v in velocities.items()},
            mobility_score=score,
            mobility_level=level,
        )

    except Exception as e:
        print(f"Error processing frame: {e}")
        return PredictResponse(
            hand_detected=False,
            confidence=0.0,
            angles={},
            velocities={},
            mobility_score=0,
            mobility_level="none",
        )


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    print("Starting NeuroGlove API server on http://localhost:8000")
    print("Endpoints:")
    print("  POST /predict  - Send base64 frame, get mobility analysis")
    print("  GET  /health   - Health check")
    uvicorn.run(app, host="0.0.0.0", port=8000)
