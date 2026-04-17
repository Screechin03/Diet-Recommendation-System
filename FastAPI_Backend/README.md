# ML_BACKEND (FastAPI)

FastAPI backend for the Diet Recommendation System.

## Run locally

```bash
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8080
```

## Environment variables

- `GEMINI_API_KEY`: enables Gemini refinement + prescription extraction
- `GEMINI_MODEL`: optional; defaults to `gemini-1.5-flash`
- `GEMINI_PRESCRIPTION_MODEL`: optional override model for prescription extraction
- `DATASET_PATH`: optional explicit path to `dataset.csv`
- `PRESCRIPTION_MAX_BYTES`: optional max upload size in bytes (default `10485760`)

## Data

The `/predict/` endpoint needs the recipes dataset (`dataset.csv`). In Docker, mount your Data folder to `/app/Data`:

```bash
docker run -p 8080:8080 \
  -v $(pwd)/Data:/app/Data:ro \
  backend:latest
```

## Endpoints

- `POST /predict/` pregnancy-safe recipe recommendations
- `POST /predict_pregnancy_risk` pregnancy risk assessment
- `GET /model_performance` model diagnostics
- `POST /batch_risk_assessment` batch risk
- `POST /prescription_report` upload a PDF/image and extract a structured report + diet guidance (Gemini)

## Notes

Outputs are not medical advice; always consult a clinician.
