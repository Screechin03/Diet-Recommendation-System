# Run Guide (FastAPI backend + Next.js frontend)

This project has:

- **Backend**: FastAPI app in `FastAPI_Backend/` (serves on `http://localhost:8080`)
- **Frontend**: Next.js app in `nextjs-frontend/` (dev server on `http://localhost:3000`)

Below are the **same steps/commands used in this workspace** (macOS).

---

## 1) Start the FastAPI backend (Python 3.10)

### Prereqs

- Install **Conda** (Miniconda/Anaconda).
- Use **Python 3.10** for the backend (the pinned ML stack may fail on Python 3.12+).

### Create + install deps (one-time)

From the repo root:

```bash
conda create -n diet-backend python=3.10 -y
conda activate diet-backend
pip install -r FastAPI_Backend/requirements.txt
```

### Set dataset path (important)

`Data/dataset.csv` is a Git LFS pointer in some clones, so the backend should use `Data/dataset1.csv`.

Run this from inside `FastAPI_Backend/`:

```bash
cd FastAPI_Backend
export DATASET_PATH="../Data/dataset1.csv"
```

### Start the server

Option A (recommended, avoids import-path confusion):

```bash
python run_server.py
```

Option B (direct uvicorn):

```bash
uvicorn main:app --host 0.0.0.0 --port 8080
```

### Quick backend check

```bash
curl -sS http://localhost:8080/docs | head
```

If you see HTML for Swagger docs, it’s running.

---

## 2) Start the Next.js frontend

### Install deps (one-time)

```bash
cd nextjs-frontend
npm ci
```

### Configure environment

Create/edit `nextjs-frontend/.env`:

```bash
API_BASE_URL=http://localhost:8080
# Optional: choose recipe image provider
# NEXT_PUBLIC_IMAGE_PROVIDER=loremflickr

# Optional: Gemini-generated recipe images (recommended for accuracy)
# Used server-side by `nextjs-frontend/src/app/api/recipe_image/route.ts` (NOT exposed to the browser)
GEMINI_API_KEY=YOUR_GEMINI_KEY
# Optional: override the image-capable model
# GEMINI_IMAGE_MODEL=gemini-2.0-flash-preview-image-generation
# Optional: if true, disables non-Gemini fallbacks (useful to confirm Gemini is working)
# GEMINI_IMAGE_REQUIRED=false
```

### Start dev server

```bash
npm run dev
```

Open:

- Frontend: `http://localhost:3000`

---

## 3) Verify end-to-end

### A) Frontend → backend proxy

The frontend uses Next.js API routes under `nextjs-frontend/src/app/api/*` to proxy requests to the backend.

### B) Test a backend endpoint directly

Example (recipe recommend):

```bash
curl -sS -X POST http://localhost:8080/predict/ \
  -H 'content-type: application/json' \
  -d '{"pregnancy_info":{"pregnancy_month":4,"age":28,"pre_pregnancy_weight":60,"current_weight":64,"height":165,"has_gestational_diabetes":false,"has_anemia":false,"has_morning_sickness":false,"has_heartburn":false,"has_constipation":false,"medications":[],"food_aversions":[],"food_cravings":[],"dietary_restrictions":[],"activity_level":"moderate"},"ingredients":["chicken","spinach"],"params":{"n_neighbors":5,"return_distance":false}}'
```

---

## Troubleshooting

### Port already in use

If you see `[Errno 48] Address already in use`, something is already listening on that port.

- Change backend port (e.g. `--port 8081`) **or** stop the other process.

### Backend 500 about missing recipe columns

If `/predict/` errors with something like `KeyError: 'RecipeIngredientParts'`, the backend likely loaded the wrong dataset.

- Ensure you exported:

```bash
export DATASET_PATH="../Data/dataset1.csv"
```

### Frontend image loading

Some external image sources can return `503` (rate-limited). The frontend includes a placeholder fallback; you can also set:

```bash
NEXT_PUBLIC_IMAGE_PROVIDER=loremflickr
```

in `nextjs-frontend/.env`.

---

## Optional: Run via Docker Compose

A `docker-compose.yml` exists for running both services together. If you prefer containers, use:

```bash
docker compose up --build
```

(Compose wires the frontend to the backend using service DNS names instead of `localhost`.)
