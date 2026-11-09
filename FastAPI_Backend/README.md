# ML_BACKEND (FastAPI)

FastAPI backend for the Pregnancy Nutrition app (used by `nextjs-frontend/` and, through it, `mobile-app/`).

## Run locally (Python 3.10)

```bash
git lfs pull                       # Data/*.csv are Git LFS files; without this they are 130-byte pointers
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8080
curl localhost:8080/health         # {"ok":true,"recipes_loaded":338368,"risk_model_loaded":true}
```

Loading the CSV directly needs about **800 MB RAM**. For small hosts (Render free, 512 MB), convert it once into
a SQLite store and point `DATASET_PATH` at that: the API then peaks at ~420 MB with identical results.
The Docker image does this automatically.

```bash
python recipe_store.py ../Data/dataset1.csv recipes.sqlite
DATASET_PATH=recipes.sqlite uvicorn main:app --host 0.0.0.0 --port 8080
```

## Deploy on Render (free)

Render → **New → Blueprint** → this repo. It reads `render.yaml` (Docker, free plan, `/health` check) and asks for
`GEMINI_API_KEY`. The Dockerfile downloads the dataset itself, so Git LFS and volumes aren't needed.

## Environment variables

- `DATASET_PATH`: path to the recipes CSV (plain or gzipped) or a `recipe_store.py` SQLite store.
  Defaults to `../Data/dataset1.csv` or `/app/Data/`; the Docker image sets `/opt/data/recipes.sqlite`.
- `PORT`: port to listen on in Docker (default 8080; Render sets it).
- `GEMINI_API_KEY`: enables the prescription reader and the optional AI refinement.
- `GEMINI_MODEL` / `GEMINI_PRESCRIPTION_MODEL`: optional. If unset or retired, the client falls back to
  `gemini-flash-latest`, `gemini-2.5-flash`, `gemini-2.0-flash`, then models discovered from the API.
- `PREGNANCY_MODEL_PATH`: optional. Defaults to `pregnancy_risk_model.pkl`.
- `HEALTH_DATA_PATH`: only needed to retrain the risk model.
- `PRESCRIPTION_MAX_BYTES`: max upload size (default 10 MB).

## Endpoints

- `GET /health`: readiness (dataset + model loaded); returns 503 if not ready
- `POST /predict/`: pregnancy-safe recipe recommendations (`"refine": true` adds Gemini tips)
- `POST /predict_pregnancy_risk`: risk assessment (`"refine": true` adds a Gemini explanation)
- `GET /model_performance`: model diagnostics
- `POST /batch_risk_assessment`: up to 100 patients
- `POST /prescription_report`: multipart PDF/image upload, returns a structured report plus a diet plan (needs Gemini)
- `POST /vitals/analyze`: analyse a vitals-device session sent as protocol lines (JSON: `lines`, optional `pregnancy_month`, `activity`)
- `POST /vitals/analyze_file`: analyse an SD-card session file (multipart: `file`)
- `POST /vitals/report`: PDF report from an analysis (JSON: `analysis`, optional `patient`)
- `GET /vitals/demo?scenario=…`: simulated session, marked as sample data
- `GET /endpoints`: endpoint list; `GET /docs`: Swagger UI

Invalid input returns **422** with a readable `detail` string.

## How recommendations work

1. At load time, recipes that are unsafe in pregnancy are removed: alcohol, raw or undercooked fish dishes,
   high-mercury fish, liver/pâté, raw-egg desserts and unpasteurised milk. Pet-food recipes are removed too.
   The lists live in `diet_rules.py`.
2. Dietary restrictions (vegan, vegetarian, dairy-, egg-, gluten-, nut-, soy-free) and food aversions remove
   recipes whose **name or ingredients** match. Restrictions are never relaxed.
3. Recipes containing more of the requested ingredients are preferred.
4. KNN (cosine) over 9 nutrients picks the recipes closest to a **per-meal** target from the female
   Harris-Benedict BMR, activity level and trimester (+340/+450 kcal).

Food.com ingredient lists are sometimes incomplete, so allergy filtering is best-effort. Users with severe
allergies should always read the full recipe.

## Vitals device (ESP32: MAX30102 + AD8232)

Code in `vitals/`; data format in `Docs/DEVICE_PROTOCOL.md`.

- **`protocol.py`:** parses one JSON object per line. Malformed lines are skipped, out-of-range values rejected, and a
  device reboot inside a file keeps only the latest session.
- **`analysis.py`:** checks each reading against pregnancy screening thresholds, and only flags values that are
  *sustained* (rolling medians), so one motion artefact never raises an alert. It also handles the ECG:
  - beat detection (simplified Pan-Tompkins) and HRV;
  - an irregular-rhythm check;
  - a beat-shape signal-quality check, so noise is reported as "not analysable" instead of producing a made-up heart rate.
- **`report_pdf.py`:** builds the patient PDF, with the ECG on standard 25 mm/s paper and a "SAMPLE DATA" watermark for demos.
- **`simulate.py`:** produces synthetic sessions (`python -m vitals.simulate --scenario irregular`).

## Risk model

`pregnancy_risk_model.pkl` is built with the scikit-learn version pinned in `requirements.txt` and is loaded at
startup. If it is missing or was built with another version, the server retrains from `health_data.csv` at boot.
To rebuild the shipped file:

```bash
HEALTH_DATA_PATH=../Data/health_data.csv python pregnancy_ml_predictor.py
```

## Tests

```bash
pip install -r requirements-dev.txt
pytest tests -q        # uses a small synthetic dataset; no LFS data or Gemini key needed
```

## Notes

Outputs are not medical advice; always consult a clinician.
