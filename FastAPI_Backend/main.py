import gzip
import logging
import mimetypes
import os
import re
import threading
from functools import lru_cache
from typing import Any, Dict, List, Literal, Optional, Union

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, conlist
from starlette.concurrency import run_in_threadpool

from diet_rules import (
    FOOD_GROUPS,
    NOT_HUMAN_FOOD,
    PREGNANCY_UNSAFE,
    RESTRICTION_GROUPS,
    compile_terms,
    normalize_restrictions,
    term_pattern,
)
from gemini_prescription_reader import (
    extract_prescription_structured,
    generate_diet_plan_from_extraction,
)
from gemini_refiner import refine_recipe_tips, refine_risk_explanation
from model import SEARCH_COLUMN, build_search_text, output_recommended_recipes, recommend
from pregnancy_ml_predictor import get_pregnancy_predictor

logger = logging.getLogger("pregnancy_api")

_REQUIRED_DATASET_COLUMNS = {
    "Name",
    "RecipeIngredientParts",
    "RecipeInstructions",
    "Calories",
    "FatContent",
    "SaturatedFatContent",
    "CholesterolContent",
    "SodiumContent",
    "CarbohydrateContent",
    "FiberContent",
    "SugarContent",
    "ProteinContent",
}

MEALS_PER_DAY = 3


# ---------------------------------------------------------------------------
# Dataset loading
# ---------------------------------------------------------------------------

def _looks_like_git_lfs_pointer(path: str) -> bool:
    try:
        with open(path, "rb") as f:
            head = f.read(200)
    except OSError:
        return False
    return head.decode("utf-8", errors="ignore").strip().lower().startswith("version https://git-lfs.github.com/spec/v1")


def _is_gzip_file(path: str) -> bool:
    try:
        with open(path, "rb") as f:
            return f.read(2) == b"\x1f\x8b"
    except OSError:
        return False


def _read_csv_auto(path: str) -> pd.DataFrame:
    if _looks_like_git_lfs_pointer(path):
        raise ValueError("Git LFS pointer file, not a real CSV (run `git lfs pull`)")
    if _is_gzip_file(path):
        return pd.read_csv(path, compression="gzip")
    return pd.read_csv(path)


def _dataset_candidates() -> List[str]:
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.getenv("DATASET_PATH"),
        "/app/Data/dataset.csv",
        "/app/Data/dataset1.csv",
        os.path.join(here, "..", "Data", "dataset.csv"),
        os.path.join(here, "..", "Data", "dataset1.csv"),
    ]
    return [os.path.abspath(c) for c in candidates if c]


_dataset_lock = threading.Lock()


@lru_cache(maxsize=1)
def _load_dataset() -> pd.DataFrame:
    problems = []
    for path in _dataset_candidates():
        if not os.path.exists(path):
            continue
        try:
            df = _read_csv_auto(path)
        except (OSError, ValueError, UnicodeDecodeError, gzip.BadGzipFile) as e:
            problems.append(f"{path}: {e}")
            continue
        missing = _REQUIRED_DATASET_COLUMNS.difference(df.columns)
        if missing:
            problems.append(f"{path}: missing columns {sorted(missing)}")
            continue

        df[SEARCH_COLUMN] = build_search_text(df)
        # Drop pregnancy-unsafe dishes (and pet-food recipes) once, at load time,
        # so no request can ever return them.
        unsafe = df[SEARCH_COLUMN].str.contains(
            compile_terms(PREGNANCY_UNSAFE + NOT_HUMAN_FOOD), regex=True, na=False
        )
        df = df[~unsafe].reset_index(drop=True)
        logger.info("Loaded %s recipes from %s (%s pregnancy-unsafe excluded)", len(df), path, int(unsafe.sum()))
        return df

    detail = "; ".join(problems) if problems else "no candidate file exists"
    raise RuntimeError(
        "Recipe dataset not found or invalid. Set DATASET_PATH to the recipes CSV (or gzipped CSV), "
        f"or mount Data/ to /app/Data in Docker. Details: {detail}"
    )


def get_dataset() -> pd.DataFrame:
    with _dataset_lock:  # avoid two concurrent first requests loading ~400 MB twice
        return _load_dataset()


_group_masks: Dict[str, np.ndarray] = {}
_group_locks = {g: threading.Lock() for g in FOOD_GROUPS}


def _group_mask(dataset: pd.DataFrame, group: str) -> np.ndarray:
    """True = recipe contains a food from `group`. Computed once per group (1-3 s each), then cached."""
    if group not in _group_masks:
        with _group_locks[group]:
            if group not in _group_masks:
                pattern = compile_terms(FOOD_GROUPS[group])
                _group_masks[group] = dataset[SEARCH_COLUMN].str.contains(pattern, regex=True, na=False).to_numpy()
    return _group_masks[group]


def apply_dietary_filters(dataset: pd.DataFrame, restrictions: List[str]) -> pd.DataFrame:
    """Remove recipes that violate any restriction. Never falls back to unfiltered data."""
    if not restrictions:
        return dataset
    violates = np.zeros(len(dataset), dtype=bool)
    for key in restrictions:
        for group in RESTRICTION_GROUPS[key]:
            violates |= _group_mask(dataset, group)
    return dataset[~violates]


def exclude_terms(data: pd.DataFrame, terms: List[str]) -> pd.DataFrame:
    """Remove recipes mentioning any of `terms` (used for food aversions)."""
    terms = [t.strip().lower() for t in terms if t and t.strip()]
    if not terms or data.empty:
        return data
    return data[~data[SEARCH_COLUMN].str.contains(compile_terms(terms), regex=True, na=False)]


# ---------------------------------------------------------------------------
# API models
# ---------------------------------------------------------------------------

app = FastAPI(title="Pregnancy Nutrition API")


@app.exception_handler(RequestValidationError)
async def _validation_error(_: Request, exc: RequestValidationError):
    # Readable single-string message ("pregnancy_info.pregnancy_month: ensure this value is ...")
    msgs = []
    for err in exc.errors():
        loc = ".".join(str(p) for p in err.get("loc", []) if p not in ("body",))
        msgs.append(f"{loc}: {err.get('msg')}" if loc else str(err.get("msg")))
    return JSONResponse(status_code=422, content={"detail": "; ".join(msgs)})


class PregnancyInfo(BaseModel):
    pregnancy_month: int = Field(..., ge=1, le=9)
    age: int = Field(..., ge=12, le=60)
    pre_pregnancy_weight: float = Field(..., gt=25, le=300)  # kg
    current_weight: float = Field(..., gt=25, le=300)  # kg
    height: float = Field(..., ge=100, le=250)  # cm
    has_gestational_diabetes: bool = False
    has_anemia: bool = False
    has_morning_sickness: bool = False
    has_heartburn: bool = False
    has_constipation: bool = False
    medications: List[str] = []
    food_aversions: List[str] = []
    food_cravings: List[str] = []
    dietary_restrictions: List[str] = []  # vegan, vegetarian, gluten-free, dairy-free, egg-free, nut-free, soy-free
    activity_level: Literal["low", "moderate", "high"] = "moderate"


class HealthAnalyticsInput(BaseModel):
    """Extended health data for ML prediction"""
    age: int = Field(..., ge=10, le=60)
    systolic_bp: int = Field(120, ge=60, le=250)
    diastolic_bp: int = Field(80, ge=30, le=160)
    blood_sugar: float = Field(7.0, ge=1, le=35)  # mmol/L
    body_temp: float = Field(98.6, ge=90, le=110)  # °F
    bmi: float = Field(22.0, ge=10, le=70)
    heart_rate: int = Field(75, ge=30, le=220)
    previous_complications: bool = False
    preexisting_diabetes: bool = False
    gestational_diabetes: bool = False
    mental_health_issues: bool = False
    smoking_history: bool = False
    alcohol_consumption: Literal["none", "occasional", "regular"] = "none"
    exercise_frequency: Literal["low", "moderate", "high"] = "moderate"
    sleep_hours: float = Field(8, ge=0, le=24)
    stress_level: Literal["low", "moderate", "high"] = "low"


class params(BaseModel):
    n_neighbors: int = Field(5, ge=1, le=50)
    return_distance: bool = False  # accepted for compatibility; indices are always used


class PredictionIn(BaseModel):
    pregnancy_info: PregnancyInfo
    ingredients: List[str] = []
    params: Optional[params]
    refine: bool = False  # Gemini tips; off by default (the web/mobile apps call /api/refine themselves)


class HealthPredictionIn(BaseModel):
    health_data: HealthAnalyticsInput
    refine: bool = False


class Recipe(BaseModel):
    Name: str
    CookTime: Union[str, int, float]
    PrepTime: Union[str, int, float]
    TotalTime: Union[str, int, float]
    RecipeIngredientParts: List[str]
    Calories: float
    FatContent: float
    SaturatedFatContent: float
    CholesterolContent: float
    SodiumContent: float
    CarbohydrateContent: float
    FiberContent: float
    SugarContent: float
    ProteinContent: float
    RecipeInstructions: List[str]
    pregnancy_benefits: Optional[List[str]] = []


class PredictionOut(BaseModel):
    output: Optional[List[Recipe]] = None
    refined: Optional[dict] = None


class PrescriptionReportOut(BaseModel):
    success: bool
    file: Dict[str, Any]
    extracted: Optional[Dict[str, Any]] = None
    diet_plan: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Nutrition
# ---------------------------------------------------------------------------

def calculate_pregnancy_nutrition(pregnancy_info: PregnancyInfo) -> List[float]:
    """Per-MEAL nutrition target, in NUTRITION_COLUMNS order.

    Fixes: the old code used the MALE Harris-Benedict equation, and compared a whole day's
    needs (~2,700 kcal) against single recipes (median ~240 kcal/serving), which pushed the
    KNN toward very heavy dishes.
    """
    # Revised Harris-Benedict, female.
    bmr = (
        447.593
        + 9.247 * pregnancy_info.current_weight
        + 3.098 * pregnancy_info.height
        - 4.330 * pregnancy_info.age
    )
    activity_factor = {"low": 1.2, "moderate": 1.55, "high": 1.725}[pregnancy_info.activity_level]
    calories = bmr * activity_factor

    if pregnancy_info.pregnancy_month <= 3:
        calories += 0  # first trimester
    elif pregnancy_info.pregnancy_month <= 6:
        calories += 340  # second trimester
    else:
        calories += 450  # third trimester

    if pregnancy_info.has_gestational_diabetes:
        carbs_pct, protein_pct, fat_pct = 0.35, 0.25, 0.40  # lower carbs, higher protein
    else:
        carbs_pct, protein_pct, fat_pct = 0.45, 0.20, 0.35

    carbs = calories * carbs_pct / 4
    protein = calories * protein_pct / 4
    fat = calories * fat_pct / 9
    saturated_fat = calories * 0.10 / 9  # <10% of energy
    fiber = 28 if pregnancy_info.pregnancy_month <= 6 else 30
    sodium = 1500 if (pregnancy_info.has_gestational_diabetes or pregnancy_info.pregnancy_month >= 7) else 2300
    sugar = 25 if pregnancy_info.has_gestational_diabetes else 50
    cholesterol = 200

    daily = [calories, fat, saturated_fat, cholesterol, sodium, carbs, fiber, sugar, protein]
    return [v / MEALS_PER_DAY for v in daily]


# Helpful ingredients, used to steer the search only when the user gave no ingredients.
_CONDITION_INGREDIENTS = [
    ("has_anemia", ["spinach", "lentils"]),
    ("has_morning_sickness", ["ginger", "lemon"]),
    ("has_constipation", ["oats", "beans"]),
]
_DIET_INGREDIENTS = {
    "vegan": ["tofu", "lentils", "chickpeas", "beans"],
    "vegetarian": ["beans", "lentils", "paneer", "vegetables"],
}
_UNSAFE_INPUT = re.compile(
    compile_terms(PREGNANCY_UNSAFE + ["raw fish", "raw meat", "alcohol", "high mercury fish"]), re.IGNORECASE
)


def _search_ingredients(info: PregnancyInfo, user_ingredients: List[str], restrictions: List[str]) -> List[str]:
    aversions = [a.strip().lower() for a in info.food_aversions if a.strip()]
    safe = [
        i.strip()
        for i in user_ingredients
        if i and i.strip()
        and not _UNSAFE_INPUT.search(i)
        and not any(re.search(term_pattern(a), i.lower()) for a in aversions)
    ]
    if safe:
        return safe[:6]
    boosters: List[str] = []
    for flag, items in _CONDITION_INGREDIENTS:
        if getattr(info, flag):
            boosters += items
    for r in restrictions:
        boosters += _DIET_INGREDIENTS.get(r, [])
    return boosters[:6]


_BENEFITS = [
    (["spinach", "lentil", "chickpea", "beans", "kale", "beef", "tofu", "iron"], "Rich in iron - helps prevent anemia"),
    (["milk", "cheese", "yogurt", "yoghurt", "paneer", "tofu", "calcium"], "Good source of calcium for baby's bone development"),
    (["salmon", "sardine", "walnut", "chia", "flax", "omega"], "Contains omega-3 fatty acids for brain development"),
    (["spinach", "kale", "broccoli", "asparagus", "lentil", "chickpea", "avocado", "folate", "folic", "leafy"],
     "Contains folate - essential for neural development"),
]


def get_pregnancy_benefits(recipe: Dict[str, Any], pregnancy_info: PregnancyInfo) -> List[str]:
    text = " ".join(recipe.get("RecipeIngredientParts", [])).lower()
    benefits = [msg for words, msg in _BENEFITS if any(w in text for w in words)]
    if pregnancy_info.has_morning_sickness and ("ginger" in text or "lemon" in text):
        benefits.append("May help reduce morning sickness")
    if pregnancy_info.has_constipation and float(recipe.get("FiberContent") or 0) > 5:
        benefits.append("High in fiber - helps with constipation")
    if float(recipe.get("ProteinContent") or 0) >= 20:
        benefits.append("High in protein - supports baby's growth")
    return benefits


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

@app.on_event("startup")
def _warm_up() -> None:
    """Load the dataset and risk model at boot instead of on the first user request."""
    try:
        dataset = get_dataset()
    except RuntimeError as e:
        logger.error("%s", e)
    else:
        # Pre-build the diet filters in the background so the first vegan/gluten-free user doesn't wait.
        def _prebuild():
            for group in FOOD_GROUPS:
                _group_mask(dataset, group)

        threading.Thread(target=_prebuild, name="diet-filter-prebuild", daemon=True).start()
    if get_pregnancy_predictor() is None:
        logger.error("Pregnancy risk model unavailable (see messages above).")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/")
def home():
    return {"health_check": "OK - Pregnancy Nutrition API"}


@app.get("/health")
def health():
    """Readiness: reports whether the dataset and risk model are loaded."""
    try:
        recipes = len(get_dataset())
    except RuntimeError:
        recipes = 0
    predictor = get_pregnancy_predictor()
    ok = recipes > 0 and predictor is not None
    return JSONResponse(
        status_code=200 if ok else 503,
        content={"ok": ok, "recipes_loaded": recipes, "risk_model_loaded": predictor is not None},
    )


@app.get("/features")
def features():
    return {
        "product": "Pregnancy Nutrition Guide",
        "features": [
            {"title": "Pregnancy-safe recipe recommendations",
             "description": "Diet-aware recipe suggestions based on pregnancy profile and ingredients."},
            {"title": "Dietary restriction filtering",
             "description": "Supports vegan, vegetarian, dairy-free, gluten-free, egg-free, nut-free and soy-free filters."},
            {"title": "Pregnancy risk analytics",
             "description": "Risk assessment endpoint with optional refinement for explanations."},
            {"title": "Prescription report reader",
             "description": "Upload a report and extract structured data plus diet guidance."},
            {"title": "Batch risk assessment",
             "description": "Run risk assessment for multiple patients in a single request."},
        ],
    }


# Was `GET /docs`, which FastAPI's Swagger UI already owns, so it could never be reached.
@app.get("/endpoints")
def endpoints():
    return {
        "swagger_ui": "/docs",
        "endpoints": [
            {"method": "POST", "path": "/predict/", "purpose": "Pregnancy-safe recipe recommendations"},
            {"method": "POST", "path": "/predict_pregnancy_risk", "purpose": "Pregnancy risk assessment"},
            {"method": "GET", "path": "/model_performance", "purpose": "Model status and diagnostics"},
            {"method": "POST", "path": "/batch_risk_assessment", "purpose": "Risk assessment for up to 100 patients"},
            {"method": "POST", "path": "/prescription_report",
             "purpose": "Upload a PDF/image report (multipart: file, dietary_preferences, allergies, goals, include_diet_plan)"},
            {"method": "GET", "path": "/health", "purpose": "Readiness check"},
        ],
    }


@app.post("/predict/", response_model=PredictionOut)
def get_pregnancy_recommendations(prediction_input: PredictionIn):
    try:
        dataset = get_dataset()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    info = prediction_input.pregnancy_info
    nutrition_target = calculate_pregnancy_nutrition(info)
    restrictions = normalize_restrictions(info.dietary_restrictions)

    candidates = apply_dietary_filters(dataset, restrictions)
    candidates = exclude_terms(candidates, info.food_aversions)

    ingredients = _search_ingredients(info, prediction_input.ingredients, restrictions)
    params_dict = {"n_neighbors": prediction_input.params.n_neighbors if prediction_input.params else 5}

    output = output_recommended_recipes(recommend(candidates, nutrition_target, ingredients, params_dict))
    if not output:
        return {"output": None, "refined": None}

    for recipe in output:
        recipe["pregnancy_benefits"] = get_pregnancy_benefits(recipe, info)

    refined = None
    if prediction_input.refine:
        try:
            refined = refine_recipe_tips(pregnancy_info=info.dict(), ingredients=ingredients, recipes=output)
        except (ValueError, RuntimeError, TypeError):
            refined = None

    return {"output": output, "refined": refined}


def _patient_data(h: HealthAnalyticsInput) -> Dict[str, Any]:
    return h.dict()


# Plain `def` endpoints run in a worker thread. They were `async def` while doing blocking work
# (model training, 20-45 s Gemini calls), which froze the whole server for every other user.
@app.post("/predict_pregnancy_risk")
def predict_pregnancy_risk(health_input: HealthPredictionIn):
    """Predict pregnancy risk using ML model"""
    predictor = get_pregnancy_predictor()
    if predictor is None:
        raise HTTPException(status_code=503, detail="Risk model not available (health data/model file missing)")

    patient_data = _patient_data(health_input.health_data)
    prediction = predictor.predict_risk(patient_data)
    if prediction is None:
        raise HTTPException(status_code=500, detail="Prediction failed")

    response_payload: Dict[str, Any] = {
        "risk_assessment": prediction,
        "recommendations": predictor.get_recommendations(patient_data, prediction),
        "success": True,
        "refined": None,
    }

    if health_input.refine:
        try:
            response_payload["refined"] = refine_risk_explanation(
                health_data=patient_data, risk_response=response_payload
            )
        except (ValueError, RuntimeError, TypeError):
            response_payload["refined"] = None

    return response_payload


@app.get("/model_performance")
def get_model_performance():
    """Get ML model performance metrics"""
    predictor = get_pregnancy_predictor()
    if predictor is None:
        raise HTTPException(status_code=503, detail="Risk model not available")
    return {
        "model_trained": predictor.is_trained,
        "available_models": list(predictor.models.keys()),
        "feature_importance": predictor.feature_importance,
        "success": True,
    }


@app.post("/batch_risk_assessment")
def batch_risk_assessment(health_inputs: conlist(HealthAnalyticsInput, max_items=100)):
    """Perform risk assessment for multiple patients"""
    predictor = get_pregnancy_predictor()
    if predictor is None:
        raise HTTPException(status_code=503, detail="Risk model not available")

    results = []
    for health_data in health_inputs:
        patient_data = _patient_data(health_data)
        prediction = predictor.predict_risk(patient_data)
        results.append({
            "input_data": patient_data,
            "risk_assessment": prediction,
            # Old code passed a None prediction into get_recommendations -> TypeError -> 500 for the whole batch.
            "recommendations": predictor.get_recommendations(patient_data, prediction) if prediction else None,
            "error": None if prediction else "Prediction failed",
        })

    return {"results": results, "total_processed": len(results), "success": True}


def _split_csv_like(value: str) -> List[str]:
    if not value:
        return []
    out: List[str] = []
    seen = set()
    for item in (v.strip() for v in re.split(r"[,\n]", value)):
        if item and item.lower() not in seen:
            seen.add(item.lower())
            out.append(item)
    return out


_SUPPORTED_UPLOAD_TYPES = ("application/pdf", "image/")


def _resolve_mime_type(content_type: Optional[str], filename: str) -> str:
    """Mobile/browser uploads often arrive as application/octet-stream; infer from the file name."""
    mime = (content_type or "").split(";")[0].strip().lower()
    if not mime or mime == "application/octet-stream":
        mime = (mimetypes.guess_type(filename)[0] or "application/octet-stream").lower()
    if mime == "image/jpg":
        mime = "image/jpeg"
    return mime


@app.post("/prescription_report", response_model=PrescriptionReportOut)
async def prescription_report(
    file: UploadFile = File(...),
    dietary_preferences: str = Form(""),
    allergies: str = Form(""),
    goals: str = Form(""),
    include_diet_plan: bool = Form(True),
):
    """Upload a prescription/lab report (PDF/image), extract readable data, and generate diet guidance.

    Requires env var GEMINI_API_KEY to enable extraction.
    """
    max_bytes = int(os.getenv("PRESCRIPTION_MAX_BYTES", "10485760"))  # 10MB default
    content = await file.read(max_bytes + 1)

    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"File too large (max {max_bytes} bytes)")

    filename = file.filename or "upload"
    mime_type = _resolve_mime_type(file.content_type, filename)
    file_info = {"filename": filename, "mime_type": mime_type, "size_bytes": len(content)}

    if not mime_type.startswith(_SUPPORTED_UPLOAD_TYPES):
        raise HTTPException(status_code=415, detail=f"Unsupported file type {mime_type}. Upload a PDF or an image.")

    try:
        # Gemini calls take 10-45 s; run them in a worker thread so the server stays responsive.
        extracted = await run_in_threadpool(
            extract_prescription_structured, file_bytes=content, mime_type=mime_type, filename=filename
        )
    except (ValueError, TypeError):
        extracted = None

    if not extracted:
        return {
            "success": False,
            "file": file_info,
            "extracted": None,
            "diet_plan": None,
            "error": "Could not read this document (check GEMINI_API_KEY on the server, or try a clearer photo).",
        }

    diet_plan = None
    if include_diet_plan:
        try:
            diet_plan = await run_in_threadpool(
                generate_diet_plan_from_extraction,
                extracted=extracted,
                dietary_preferences=_split_csv_like(dietary_preferences),
                allergies=_split_csv_like(allergies),
                goals=_split_csv_like(goals),
            )
        except (ValueError, TypeError):
            diet_plan = None

    return {"success": True, "file": file_info, "extracted": extracted, "diet_plan": diet_plan, "error": None}
