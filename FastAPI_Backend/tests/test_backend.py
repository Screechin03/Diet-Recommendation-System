"""Regression tests for the backend bugs fixed in fix/backend.

Runs on a small synthetic recipe CSV, so it needs neither the 95 MB LFS dataset nor a Gemini key.
    pip install -r requirements.txt -r requirements-dev.txt
    pytest FastAPI_Backend/tests -q
"""

import os
import sys

import pandas as pd
import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)

NUTRITION = dict(
    Calories=550.0, FatContent=20.0, SaturatedFatContent=6.0, CholesterolContent=60.0, SodiumContent=600.0,
    CarbohydrateContent=55.0, FiberContent=7.0, SugarContent=8.0, ProteinContent=30.0,
)


def _recipe(i, name, ingredients, **overrides):
    parts = "c(" + ", ".join(f'"{x}"' for x in ingredients) + ")"
    row = dict(
        RecipeId=i, Name=name, CookTime="PT20M", PrepTime="PT10M", TotalTime="PT30M",
        RecipeIngredientParts=parts, **{**NUTRITION, **overrides},
        RecipeInstructions='c("Cook it.", "Serve.")',
    )
    return row


RECIPES = [
    ("BBQ Chicken Pizza", ["barbecue sauce", "mozzarella cheese"]),  # meat only in the NAME
    ("Peanut Noodle Bowl", ["rice noodles", "peanuts", "lime"]),  # plural nut
    ("Amaretti Pear Crumble", ["pears", "amaretti", "oats"]),  # hidden nut
    ("Coq au Vin", ["chicken", "red wine", "onion"]),  # alcohol -> excluded at load
    ("Balsamic Greens", ["spinach", "red wine vinegar", "olive oil"]),  # vinegar is fine
    ("Doggie Cookies", ["oats", "peanut butter"]),  # pet food -> excluded at load
    ("Mac &amp; Cheese", ["macaroni", "cheese", "milk"]),  # HTML entity
    ("Honey Glazed Carrots", ["carrots", "honey"]),
    ("Coconut Lentil Curry", ["lentils", "coconut milk", "spinach"]),  # vegan despite "milk"
    ("Salmon Rice Bowl", ["salmon", "rice", "spinach"]),
    ("Easy Chicken Pot Pie", ["chicken", "peas", "carrots"]),  # crust only in the name
    ("Scrambled Eggs", ["eggs", "butter"]),
] + [(f"Vegetable Soup {i}", ["carrots", "celery", "lentils", "tomatoes"]) for i in range(20)] + [
    (f"Chicken Spinach Bake {i}", ["chicken", "spinach", "rice"]) for i in range(10)
]


@pytest.fixture(scope="session")
def client(tmp_path_factory):
    rows = [_recipe(i, n, ing, Calories=300.0 + 15 * i) for i, (n, ing) in enumerate(RECIPES)]
    path = tmp_path_factory.mktemp("data") / "recipes.csv"
    pd.DataFrame(rows).to_csv(path, index=False)
    os.environ["DATASET_PATH"] = str(path)

    import main  # noqa: E402  (env must be set first)
    from fastapi.testclient import TestClient

    main._load_dataset.cache_clear()
    main._group_masks.clear()
    with TestClient(main.app) as c:
        yield c


PROFILE = {"pregnancy_month": 5, "age": 29, "pre_pregnancy_weight": 60, "current_weight": 65, "height": 165}


def _names(client, restrictions=(), ingredients=(), n=10, **profile):
    res = client.post(
        "/predict/",
        json={
            "pregnancy_info": {**PROFILE, **profile, "dietary_restrictions": list(restrictions)},
            "ingredients": list(ingredients),
            "params": {"n_neighbors": n},
        },
    )
    assert res.status_code == 200, res.text
    return [r["Name"] for r in (res.json()["output"] or [])]


def all_names(client):
    return set(_names(client, n=50))


def test_unsafe_and_pet_recipes_never_returned(client):
    names = all_names(client)
    assert "Coq au Vin" not in names
    assert "Doggie Cookies" not in names
    assert "Balsamic Greens" in names  # "red wine vinegar" is not alcohol


def test_vegan_checks_recipe_name_honey_and_plant_milk(client):
    names = set(_names(client, ["Vegan"], n=50))
    assert "BBQ Chicken Pizza" not in names
    assert "Honey Glazed Carrots" not in names
    assert "Scrambled Eggs" not in names
    assert "Coconut Lentil Curry" in names


def test_nut_free_catches_plurals_and_hidden_nuts(client):
    names = set(_names(client, ["nut-free"], n=50))
    assert "Peanut Noodle Bowl" not in names
    assert "Amaretti Pear Crumble" not in names


def test_egg_free_and_gluten_free_are_applied(client):
    assert "Scrambled Eggs" not in _names(client, ["Egg-free"], n=50)
    gf = _names(client, ["Gluten-free"], n=50)
    assert "Easy Chicken Pot Pie" not in gf
    assert "Mac & Cheese" not in gf


def test_restriction_is_never_dropped_when_few_recipes_remain(client):
    # Old code returned the UNFILTERED dataset when < 10 recipes survived a filter.
    names = _names(client, ["Vegan", "Gluten-free", "Soy-free"], n=50)
    assert names and not any("Chicken" in n or "Mac" in n for n in names)


def test_food_aversions_exclude_recipes(client):
    names = _names(client, ingredients=["spinach"], n=50, food_aversions=["salmon"])
    assert "Salmon Rice Bowl" not in names


def test_prefers_recipes_with_all_requested_ingredients(client):
    names = _names(client, ingredients=["chicken", "spinach"], n=5)
    assert len(names) == 5 and all(n.startswith("Chicken Spinach Bake") for n in names)


def test_html_entities_are_unescaped(client):
    assert "Mac & Cheese" in all_names(client)


def test_return_distance_true_no_longer_crashes(client):
    res = client.post("/predict/", json={"pregnancy_info": PROFILE, "params": {"n_neighbors": 3, "return_distance": True}})
    assert res.status_code == 200 and len(res.json()["output"]) == 3


def test_invalid_input_is_422_with_readable_message(client):
    res = client.post("/predict/", json={"pregnancy_info": {**PROFILE, "pregnancy_month": 0}})
    assert res.status_code == 422
    assert "pregnancy_month" in res.json()["detail"]


def test_nutrition_uses_female_bmr_and_per_meal_target():
    import main

    info = main.PregnancyInfo(**PROFILE)
    target = main.calculate_pregnancy_nutrition(info)
    bmr = 447.593 + 9.247 * 65 + 3.098 * 165 - 4.330 * 29
    assert target[0] == pytest.approx((bmr * 1.55 + 340) / 3)
    assert target[2] > 0  # saturated fat target was hard-coded to 0


def test_risk_obesity_does_not_trigger_diabetes_or_bp_advice(client):
    res = client.post("/predict_pregnancy_risk", json={"health_data": {"age": 30, "bmi": 34}})
    assert res.status_code == 200
    recs = res.json()["recommendations"]
    assert "Nutritionist consultation" in recs["medical_consultations"]
    assert "Follow strict diabetic diet plan" not in recs["lifestyle_changes"]
    assert "Cardiologist consultation" not in recs["medical_consultations"]


def test_risk_recommendations_have_no_duplicates_and_use_lifestyle(client):
    res = client.post(
        "/predict_pregnancy_risk",
        json={"health_data": {"age": 40, "systolic_bp": 160, "diastolic_bp": 100, "blood_sugar": 12,
                              "preexisting_diabetes": True, "gestational_diabetes": True,
                              "smoking_history": True, "body_temp": 101}},
    )
    body = res.json()
    for items in body["recommendations"].values():
        assert len(items) == len(set(items))
    factors = " ".join(body["risk_assessment"]["risk_factors"])
    assert "Smoking" in factors and "Fever" in factors


def test_batch_and_model_endpoints(client):
    res = client.post("/batch_risk_assessment", json=[{"age": 29}, {"age": 41, "systolic_bp": 150}])
    assert res.status_code == 200 and res.json()["total_processed"] == 2
    assert client.get("/model_performance").json()["model_trained"] is True


def test_shipped_model_file_loads_with_installed_sklearn():
    import pregnancy_ml_predictor as p

    assert p.PregnancyRiskPredictor().load_model(p.MODEL_PATH)


def test_endpoints_listing_and_swagger_are_both_reachable(client):
    assert client.get("/endpoints").json()["swagger_ui"] == "/docs"
    assert "swagger" in client.get("/docs").text.lower()


def test_prescription_upload_type_handling(client):
    bad = client.post("/prescription_report", files={"file": ("notes.txt", b"hello", "text/plain")})
    assert bad.status_code == 415
    # Mobile uploads often say application/octet-stream; type must be inferred from the name.
    res = client.post("/prescription_report", files={"file": ("rx.jpg", b"\xff\xd8\xff fake", "application/octet-stream")})
    assert res.status_code == 200 and res.json()["file"]["mime_type"] == "image/jpeg"
