# ML_BACKEND (FastAPI)

FastAPI backend for the Pregnancy Nutrition app (used by `nextjs-frontend/` and, through it, `mobile-app/`).

## Run locally (Python 3.10)

```bash
git lfs pull                       # Data/*.csv are Git LFS files; without this they are 130-byte pointers
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8080
curl localhost:8080/health         # {"ok":true,"recipes_loaded":338368,"risk_model_loaded":true}
```

Needs about **600 MB RAM**: the recipe dataset is held in memory. Host it on an instance with 1 GB or more.

## Environment variables

- `DATASET_PATH`: path to the recipes CSV (plain or gzipped). Defaults to `../Data/dataset1.csv` or `/app/Data/`.
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
