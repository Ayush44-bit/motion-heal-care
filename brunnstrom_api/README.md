# Brunnstrom Recovery Stage API

FastAPI service that wraps the trained Random Forest model
(`brunnstrom_rf_model.pkl`) to predict post-stroke motor recovery stage
(Brunnstrom 1–6) from hand biomechanical features.

## Files
- `main.py` — FastAPI server
- `brunnstrom_rf_model.pkl` — trained scikit-learn model
- `feature_columns.json` — ordered list of 14 input features
- `requirements.txt` — Python dependencies

## Run locally
```bash
cd brunnstrom_api
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

Test:
```bash
curl http://localhost:8001/health
```

## Deploy to Render (recommended, free tier)
1. Push this folder to GitHub.
2. On https://render.com → **New → Web Service** → connect repo.
3. Settings:
   - **Root Directory**: `brunnstrom_api`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Deploy. You'll get a URL like `https://brunnstrom-api.onrender.com`.

## Deploy to Railway
1. `railway init` inside `brunnstrom_api/`.
2. Set start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`.
3. `railway up`.

## Connect to the frontend
Set the env var in the Lovable project (or hardcode in
`src/hooks/useBrunnstromPrediction.ts`):
```
VITE_BRUNNSTROM_API_URL=https://brunnstrom-api.onrender.com
```

## Endpoints
### `GET /health`
Returns model status and the expected feature columns.

### `POST /predict-brunnstrom`
Body (all 14 fields required):
```json
{
  "rom_index_mcp": 65.2,
  "rom_middle_mcp": 70.1,
  "rom_thumb_mcp": 45.8,
  "mean_velocity": 32.5,
  "peak_velocity": 88.3,
  "velocity_variance": 12.1,
  "mean_palm_acceleration": 4.2,
  "mean_dominant_finger_acceleration": 6.8,
  "mean_non_target_acceleration": 2.1,
  "finger_correlation_score": 0.78,
  "unintended_activation_ratio": 0.12,
  "stability_score": 0.85,
  "tremor_index": 0.08,
  "smoothness_index": 0.91
}
```
Response:
```json
{
  "stage": 4,
  "label": "Spasticity decreases",
  "description": "Movement begins to deviate from synergy. Spasticity decreases.",
  "confidence": 0.72,
  "probabilities": { "1": 0.01, "2": 0.05, "3": 0.15, "4": 0.72, "5": 0.06, "6": 0.01 }
}
```
