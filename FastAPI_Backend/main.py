from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Any, Dict, List, Optional, Union
import pandas as pd
import re
from model import recommend,output_recommended_recipes
from pregnancy_ml_predictor import get_pregnancy_predictor
from gemini_refiner import refine_recipe_tips, refine_risk_explanation
from gemini_prescription_reader import (
    extract_prescription_structured,
    generate_diet_plan_from_extraction,
)

from functools import lru_cache


import os
import gzip


_REQUIRED_DATASET_COLUMNS = {
    "RecipeIngredientParts",
    "RecipeInstructions",
}


def _looks_like_git_lfs_pointer(path: str) -> bool:
    try:
        with open(path, "rb") as f:
            head = f.read(200)
    except OSError:
        return False

    try:
        text = head.decode("utf-8", errors="ignore").strip().lower()
    except Exception:
        return False

    return text.startswith("version https://git-lfs.github.com/spec/v1")


def _is_gzip_file(path: str) -> bool:
    try:
        with open(path, "rb") as f:
            return f.read(2) == b"\x1f\x8b"
    except OSError:
        return False


def _read_csv_auto(path: str) -> pd.DataFrame:
    if _looks_like_git_lfs_pointer(path):
        raise ValueError("Git LFS pointer file, not a real CSV")

    if _is_gzip_file(path):
        return pd.read_csv(path, compression="gzip")

    return pd.read_csv(path)


def _dataset_candidates() -> List[str]:
    candidates: List[str] = []

    env_path = os.getenv("DATASET_PATH")
    if env_path:
        candidates.append(env_path)

    # Common container mount paths
    candidates.append("/app/Data/dataset.csv")
    candidates.append("/app/Data/dataset1.csv")

    # Monorepo layout: ../Data/dataset.csv from this file
    candidates.append(
        os.path.abspath(
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "Data", "dataset.csv")
        )
    )

    candidates.append(
        os.path.abspath(
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "Data", "dataset1.csv")
        )
    )

    return candidates


@lru_cache(maxsize=1)
def get_dataset() -> pd.DataFrame:
    for path in _dataset_candidates():
        try:
            if not path or not os.path.exists(path):
                continue

            df = _read_csv_auto(path)

            # Validate expected schema to avoid hard-to-debug 500s later.
            missing = _REQUIRED_DATASET_COLUMNS.difference(set(df.columns))
            if missing:
                continue

            # The ML pipeline currently expects at least 15 columns due to
            # positional slicing in model.py (iloc[:, 6:15]).
            if df.shape[1] < 15:
                continue

            return df
        except (OSError, ValueError, UnicodeDecodeError, gzip.BadGzipFile):
            continue

    raise RuntimeError(
        "Dataset not found or invalid. Set DATASET_PATH to a valid recipes CSV (or gzipped CSV), "
        "or mount Data/ to /app/Data in Docker. Required columns: RecipeIngredientParts, RecipeInstructions."
    )

app = FastAPI()


class PregnancyInfo(BaseModel):
    pregnancy_month: int  # 1-9
    age: int
    pre_pregnancy_weight: float  # in kg
    current_weight: float  # in kg
    height: float  # in cm
    has_gestational_diabetes: bool = False
    has_anemia: bool = False
    has_morning_sickness: bool = False
    has_heartburn: bool = False
    has_constipation: bool = False
    medications: List[str] = []
    food_aversions: List[str] = []
    food_cravings: List[str] = []
    dietary_restrictions: List[str] = []  # vegetarian, vegan, gluten-free, etc.
    activity_level: str = "moderate"  # low, moderate, high

class HealthAnalyticsInput(BaseModel):
    """Extended health data for ML prediction"""
    age: int
    systolic_bp: int = 120
    diastolic_bp: int = 80
    blood_sugar: float = 7.0
    body_temp: float = 98.6
    bmi: float = 22.0
    heart_rate: int = 75
    previous_complications: bool = False
    preexisting_diabetes: bool = False
    gestational_diabetes: bool = False
    mental_health_issues: bool = False
    # Lifestyle factors
    smoking_history: bool = False
    alcohol_consumption: str = "none"  # none, occasional, regular
    exercise_frequency: str = "moderate"  # low, moderate, high
    sleep_hours: int = 8
    stress_level: str = "low"  # low, moderate, high

class params(BaseModel):
    n_neighbors:int=5
    return_distance:bool=False

class PredictionIn(BaseModel):
    pregnancy_info: PregnancyInfo
    ingredients:list[str]=[]
    params:Optional[params]

class HealthPredictionIn(BaseModel):
    health_data: HealthAnalyticsInput


class Recipe(BaseModel):
    Name:str
    CookTime:Union[str,int,float]
    PrepTime:Union[str,int,float]
    TotalTime:Union[str,int,float]
    RecipeIngredientParts:list[str]
    Calories:float
    FatContent:float
    SaturatedFatContent:float
    CholesterolContent:float
    SodiumContent:float
    CarbohydrateContent:float
    FiberContent:float
    SugarContent:float
    ProteinContent:float
    RecipeInstructions:list[str]
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


def calculate_pregnancy_nutrition(pregnancy_info: PregnancyInfo):
    """Calculate nutrition requirements based on pregnancy information"""
    # Base calorie needs
    bmr = 88.362 + (13.397 * pregnancy_info.current_weight) + (4.799 * pregnancy_info.height) - (5.677 * pregnancy_info.age)
    
    # Activity factor
    activity_factors = {"low": 1.2, "moderate": 1.55, "high": 1.725}
    activity_factor = activity_factors.get(pregnancy_info.activity_level, 1.55)
    
    base_calories = bmr * activity_factor
    
    # Pregnancy calorie adjustments by trimester
    if pregnancy_info.pregnancy_month <= 3:  # First trimester
        calories = base_calories
    elif pregnancy_info.pregnancy_month <= 6:  # Second trimester
        calories = base_calories + 340
    else:  # Third trimester
        calories = base_calories + 450
    
    # Adjust for complications
    if pregnancy_info.has_gestational_diabetes:
        # Lower carbs, higher protein
        carbs_percent = 0.35
        protein_percent = 0.25
        fat_percent = 0.40
    else:
        # Standard pregnancy macros
        carbs_percent = 0.45
        protein_percent = 0.20
        fat_percent = 0.35
    
    # Calculate macronutrients
    carbs = (calories * carbs_percent) / 4  # 4 cal/g
    protein = (calories * protein_percent) / 4  # 4 cal/g
    fat = (calories * fat_percent) / 9  # 9 cal/g
    
    # Essential pregnancy nutrients (approximate daily needs)
    fiber = 28 if pregnancy_info.pregnancy_month <= 6 else 30
    
    # Increased needs for pregnancy
    if pregnancy_info.has_anemia:
        # Higher iron needs reflected in food choices
        pass
    
    # Sodium - lower if has complications
    sodium = 1500 if (pregnancy_info.has_gestational_diabetes or pregnancy_info.pregnancy_month >= 7) else 2300
    
    # Sugar - lower if gestational diabetes
    sugar = 25 if pregnancy_info.has_gestational_diabetes else 50
    
    # Cholesterol
    cholesterol = 200  # mg
    
    return [
        calories,           # 0
        fat,               # 1
        0,                 # 2 - SaturatedFat (calculated as portion of total fat)
        cholesterol,       # 3
        sodium,            # 4
        carbs,             # 5
        fiber,             # 6
        sugar,             # 7
        protein            # 8
    ]

@app.get("/")
def home():
    return {"health_check": "OK - Pregnancy Nutrition API"}


@app.post("/predict/",response_model=PredictionOut)
def get_pregnancy_recommendations(prediction_input:PredictionIn):
    try:
        dataset = get_dataset()
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    # Calculate nutrition needs based on pregnancy info
    nutrition_input = calculate_pregnancy_nutrition(prediction_input.pregnancy_info)
    
    # Filter ingredients based on pregnancy restrictions
    safe_ingredients = []
    unsafe_foods = ['alcohol', 'raw fish', 'raw meat', 'unpasteurized', 'high mercury fish', 'raw eggs']
    
    for ingredient in prediction_input.ingredients:
        if not any(unsafe in ingredient.lower() for unsafe in unsafe_foods):
            safe_ingredients.append(ingredient)
    
    # Add pregnancy-beneficial ingredients
    if prediction_input.pregnancy_info.has_anemia:
        safe_ingredients.extend(['spinach', 'iron'])
    if prediction_input.pregnancy_info.has_morning_sickness:
        safe_ingredients.extend(['ginger', 'lemon'])
    if prediction_input.pregnancy_info.has_constipation:
        safe_ingredients.extend(['fiber', 'prunes'])
    
    # Remove food aversions
    for aversion in prediction_input.pregnancy_info.food_aversions:
        safe_ingredients = [ing for ing in safe_ingredients if aversion.lower() not in ing.lower()]
    
    # Apply dietary restrictions by filtering the dataset first
    dietary_restrictions = prediction_input.pregnancy_info.dietary_restrictions
    filtered_dataset = apply_dietary_filters(dataset, dietary_restrictions)
    
    # Limit ingredients to improve performance
    safe_ingredients = safe_ingredients[:6] if len(safe_ingredients) > 6 else safe_ingredients
    
    # Add appropriate ingredients based on dietary preferences
    if 'Vegan' in dietary_restrictions:
        safe_ingredients.extend(['tofu', 'beans', 'lentils', 'quinoa', 'vegetables', 'plant'])
    elif 'Vegetarian' in dietary_restrictions:
        safe_ingredients.extend(['beans', 'cheese', 'vegetables', 'grains'])
    
    params_dict = prediction_input.params.dict() if prediction_input.params else {'n_neighbors': 5, 'return_distance': False}
    
    recommendation_dataframe = recommend(filtered_dataset, nutrition_input, safe_ingredients, params_dict)
    output = output_recommended_recipes(recommendation_dataframe)
    
    if output is None:
        # If no recommendations found, try with relaxed filters
        relaxed_ingredients = safe_ingredients[:3] if len(safe_ingredients) > 3 else safe_ingredients
        recommendation_dataframe = recommend(filtered_dataset, nutrition_input, relaxed_ingredients, params_dict)
        output = output_recommended_recipes(recommendation_dataframe)
        
        if output is None:
            # Last resort - return random recipes from filtered dataset
            if len(filtered_dataset) > 0:
                random_recipes = filtered_dataset.sample(min(5, len(filtered_dataset)))
                output = output_recommended_recipes(random_recipes)
    
    if output is None:
        return {"output": None, "refined": None}
    else:
        # Add pregnancy-specific nutritional advice to each recipe
        for recipe in output:
            recipe['pregnancy_benefits'] = get_pregnancy_benefits(recipe, prediction_input.pregnancy_info)

        refined = None
        try:
            refined = refine_recipe_tips(
                pregnancy_info=prediction_input.pregnancy_info.dict(),
                ingredients=safe_ingredients,
                recipes=output,
            )
        except (ValueError, RuntimeError, TypeError):
            refined = None

        return {"output": output, "refined": refined}

def apply_dietary_filters(data, dietary_restrictions):
    """Apply dietary restriction filters more efficiently"""
    filtered_dataset = data.copy()
    
    if not dietary_restrictions:
        return filtered_dataset
    
    try:
        # Pre-filter dataset based on dietary restrictions
        if 'Vegan' in dietary_restrictions:
            # Filter out all animal products for vegan diet
            non_vegan_keywords = ['chicken', 'beef', 'pork', 'turkey', 'fish', 'salmon', 'tuna', 'meat', 
                                'ham', 'bacon', 'sausage', 'milk', 'cheese', 'butter', 'cream', 'egg', 
                                'honey', 'yogurt', 'dairy']
            pattern = '|'.join([f'\\b{re.escape(keyword)}\\b' for keyword in non_vegan_keywords])
            filtered_dataset = filtered_dataset[~filtered_dataset['RecipeIngredientParts'].str.contains(
                pattern, case=False, regex=True, na=False
            )]
        
        elif 'Vegetarian' in dietary_restrictions:
            # Filter out meat but keep dairy
            meat_keywords = ['chicken', 'beef', 'pork', 'turkey', 'fish', 'salmon', 'tuna', 'meat', 
                           'ham', 'bacon', 'sausage']
            pattern = '|'.join([f'\\b{re.escape(keyword)}\\b' for keyword in meat_keywords])
            filtered_dataset = filtered_dataset[~filtered_dataset['RecipeIngredientParts'].str.contains(
                pattern, case=False, regex=True, na=False
            )]
        
        if 'Dairy-free' in dietary_restrictions:
            dairy_keywords = ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'dairy']
            pattern = '|'.join([f'\\b{re.escape(keyword)}\\b' for keyword in dairy_keywords])
            filtered_dataset = filtered_dataset[~filtered_dataset['RecipeIngredientParts'].str.contains(
                pattern, case=False, regex=True, na=False
            )]
        
        if 'Gluten-free' in dietary_restrictions:
            gluten_keywords = ['wheat', 'flour', 'bread', 'pasta', 'barley', 'rye', 'gluten']
            pattern = '|'.join([f'\\b{re.escape(keyword)}\\b' for keyword in gluten_keywords])
            filtered_dataset = filtered_dataset[~filtered_dataset['RecipeIngredientParts'].str.contains(
                pattern, case=False, regex=True, na=False
            )]
        
        if 'Nut-free' in dietary_restrictions:
            nut_keywords = ['nut', 'almond', 'walnut', 'peanut', 'pecan', 'cashew', 'pistachio']
            pattern = '|'.join([f'\\b{re.escape(keyword)}\\b' for keyword in nut_keywords])
            filtered_dataset = filtered_dataset[~filtered_dataset['RecipeIngredientParts'].str.contains(
                pattern, case=False, regex=True, na=False
            )]
        
        # Ensure we have enough recipes after filtering
        if len(filtered_dataset) < 10:
            # If too few recipes after filtering, use original dataset
            print(f"Warning: Dietary filtering resulted in {len(filtered_dataset)} recipes. Using broader selection.")
            return data
        
        return filtered_dataset
        
    except re.error:
        # Fallback to simple string filtering if regex fails
        for restriction in dietary_restrictions:
            if restriction == 'Vegan':
                filtered_dataset = filtered_dataset[
                    ~filtered_dataset['RecipeIngredientParts'].str.contains('chicken|beef|meat|milk|cheese|egg', case=False, na=False)
                ]
            elif restriction == 'Vegetarian':
                filtered_dataset = filtered_dataset[
                    ~filtered_dataset['RecipeIngredientParts'].str.contains('chicken|beef|meat|fish', case=False, na=False)
                ]
        
        return filtered_dataset
    except (AttributeError, KeyError, ValueError):
        # If all filtering fails, return original dataset
        return data

def get_pregnancy_benefits(recipe, pregnancy_info):
    """Add pregnancy-specific benefits information to recipes"""
    benefits = []
    
    ingredients = ' '.join(recipe.get('RecipeIngredientParts', [])).lower()
    
    # Check for beneficial nutrients
    if 'spinach' in ingredients or 'iron' in ingredients:
        benefits.append("Rich in iron - helps prevent anemia")
    if 'calcium' in ingredients or 'milk' in ingredients or 'cheese' in ingredients:
        benefits.append("Good source of calcium for baby's bone development")
    if 'salmon' in ingredients or 'omega' in ingredients:
        benefits.append("Contains omega-3 fatty acids for brain development")
    if 'folate' in ingredients or 'folic' in ingredients or 'leafy' in ingredients:
        benefits.append("Contains folate - essential for neural development")
    if pregnancy_info.has_morning_sickness and ('ginger' in ingredients or 'lemon' in ingredients):
        benefits.append("May help reduce morning sickness")
    if pregnancy_info.has_constipation and recipe.get('FiberContent', 0) > 5:
        benefits.append("High in fiber - helps with constipation")
    
    return benefits

@app.post("/predict_pregnancy_risk")
async def predict_pregnancy_risk(health_input: HealthPredictionIn):
    """Predict pregnancy risk using ML model"""
    try:
        predictor = get_pregnancy_predictor()
        if predictor is None:
            raise HTTPException(status_code=500, detail="ML model not available")
        
        # Convert input to prediction format
        patient_data = {
            'age': health_input.health_data.age,
            'systolic_bp': health_input.health_data.systolic_bp,
            'diastolic_bp': health_input.health_data.diastolic_bp,
            'blood_sugar': health_input.health_data.blood_sugar,
            'body_temp': health_input.health_data.body_temp,
            'bmi': health_input.health_data.bmi,
            'heart_rate': health_input.health_data.heart_rate,
            'previous_complications': health_input.health_data.previous_complications,
            'preexisting_diabetes': health_input.health_data.preexisting_diabetes,
            'gestational_diabetes': health_input.health_data.gestational_diabetes,
            'mental_health_issues': health_input.health_data.mental_health_issues
        }
        
        # Get prediction
        prediction = predictor.predict_risk(patient_data)
        if prediction is None:
            raise HTTPException(status_code=500, detail="Prediction failed")
        
        # Get recommendations
        recommendations = predictor.get_recommendations(patient_data, prediction)
        
        response_payload = {
            "risk_assessment": prediction,
            "recommendations": recommendations,
            "success": True
        }

        try:
            refined = refine_risk_explanation(
                health_data=health_input.health_data.dict(),
                risk_response=response_payload,
            )
            response_payload["refined"] = refined
        except (ValueError, RuntimeError, TypeError):
            response_payload["refined"] = None

        return response_payload
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error in prediction: {str(e)}") from e

@app.get("/model_performance")
async def get_model_performance():
    """Get ML model performance metrics"""
    try:
        predictor = get_pregnancy_predictor()
        if predictor is None:
            raise HTTPException(status_code=500, detail="ML model not available")
        
        return {
            "model_trained": predictor.is_trained,
            "available_models": list(predictor.models.keys()),
            "feature_importance": predictor.feature_importance,
            "success": True
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting model info: {str(e)}") from e

@app.post("/batch_risk_assessment")
async def batch_risk_assessment(health_inputs: List[HealthAnalyticsInput]):
    """Perform risk assessment for multiple patients"""
    try:
        predictor = get_pregnancy_predictor()
        if predictor is None:
            raise HTTPException(status_code=500, detail="ML model not available")
        
        results = []
        
        for health_data in health_inputs:
            patient_data = {
                'age': health_data.age,
                'systolic_bp': health_data.systolic_bp,
                'diastolic_bp': health_data.diastolic_bp,
                'blood_sugar': health_data.blood_sugar,
                'body_temp': health_data.body_temp,
                'bmi': health_data.bmi,
                'heart_rate': health_data.heart_rate,
                'previous_complications': health_data.previous_complications,
                'preexisting_diabetes': health_data.preexisting_diabetes,
                'gestational_diabetes': health_data.gestational_diabetes,
                'mental_health_issues': health_data.mental_health_issues
            }
            
            prediction = predictor.predict_risk(patient_data)
            recommendations = predictor.get_recommendations(patient_data, prediction)
            
            results.append({
                "input_data": health_data.dict(),
                "risk_assessment": prediction,
                "recommendations": recommendations
            })
        
        return {
            "results": results,
            "total_processed": len(results),
            "success": True
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error in batch assessment: {str(e)}") from e


def _split_csv_like(value: str) -> List[str]:
    if not value:
        return []
    items = [v.strip() for v in re.split(r"[,\n]", value) if v.strip()]
    # avoid duplicates while keeping order
    seen = set()
    out: List[str] = []
    for item in items:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


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
    content = await file.read()

    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"File too large (max {max_bytes} bytes)")

    mime_type = file.content_type or "application/octet-stream"
    filename = file.filename or "upload"

    extracted = None
    try:
        extracted = extract_prescription_structured(
            file_bytes=content,
            mime_type=mime_type,
            filename=filename,
        )
    except (ValueError, TypeError):
        extracted = None

    if not extracted:
        return {
            "success": False,
            "file": {
                "filename": filename,
                "mime_type": mime_type,
                "size_bytes": len(content),
            },
            "extracted": None,
            "diet_plan": None,
            "error": "Gemini extraction unavailable (check GEMINI_API_KEY / model / file type).",
        }

    diet_plan = None
    if include_diet_plan:
        try:
            diet_plan = generate_diet_plan_from_extraction(
                extracted=extracted,
                dietary_preferences=_split_csv_like(dietary_preferences),
                allergies=_split_csv_like(allergies),
                goals=_split_csv_like(goals),
            )
        except (ValueError, TypeError):
            diet_plan = None

    return {
        "success": True,
        "file": {
            "filename": filename,
            "mime_type": mime_type,
            "size_bytes": len(content),
        },
        "extracted": extracted,
        "diet_plan": diet_plan,
        "error": None,
    }

