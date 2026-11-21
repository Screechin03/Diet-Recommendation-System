"""The low-memory SQLite recipe store must give exactly the same /predict results as the CSV loader."""

import os
import sys

import pandas as pd
import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from test_backend import PROFILE, RECIPES, _recipe  # noqa: E402

import main  # noqa: E402
import recipe_store  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

REQUESTS = [
    {"pregnancy_info": PROFILE},
    {"pregnancy_info": {**PROFILE, "dietary_restrictions": ["Vegan"]}, "params": {"n_neighbors": 50}},
    {"pregnancy_info": {**PROFILE, "dietary_restrictions": ["Gluten-free", "Egg-free"]}, "params": {"n_neighbors": 20}},
    {"pregnancy_info": {**PROFILE, "food_aversions": ["chicken"]}, "ingredients": ["spinach"], "params": {"n_neighbors": 10}},
    {"pregnancy_info": PROFILE, "ingredients": ["lentils", "tomatoes"], "params": {"n_neighbors": 50}},
]


@pytest.fixture()
def paths(tmp_path):
    rows = [_recipe(i, n, ing, Calories=300.0 + 15 * i) for i, (n, ing) in enumerate(RECIPES)]
    csv = tmp_path / "recipes.csv"
    pd.DataFrame(rows).to_csv(csv, index=False)
    db = tmp_path / "recipes.sqlite"
    recipe_store.build(str(csv), str(db), chunksize=7)  # small chunks: exercise the chunked build
    yield str(csv), str(db)
    main._load_dataset.cache_clear()  # let other tests reload their own dataset
    main._group_masks.clear()


def _predict_all(monkeypatch, path):
    monkeypatch.setenv("DATASET_PATH", path)
    main._load_dataset.cache_clear()
    main._group_masks.clear()
    client = TestClient(main.app)
    out = []
    for body in REQUESTS:
        res = client.post("/predict/", json=body)
        assert res.status_code == 200, res.text
        out.append(res.json())
    return out


def test_store_matches_csv(paths, monkeypatch):
    csv, db = paths
    assert recipe_store.is_store(db) and not recipe_store.is_store(csv)
    from_csv = _predict_all(monkeypatch, csv)
    from_store = _predict_all(monkeypatch, db)
    assert main._store_path == db
    assert from_store == from_csv
    assert all(r["output"] for r in from_store)


def test_store_drops_unsafe_recipes_and_keeps_text(paths):
    _, db = paths
    df = recipe_store.load(db)
    assert recipe_store.ROW_COLUMN in df.columns and "RecipeInstructions" not in df.columns
    full = recipe_store.hydrate(df.iloc[[3, 0]], db)
    assert list(full.columns) == recipe_store.OUTPUT_COLUMNS
    names = set(recipe_store.hydrate(df, db)["Name"])
    assert "Coq au Vin" not in names and "Doggie Cookies" not in names
    assert full["RecipeInstructions"].iloc[0] == 'c("Cook it.", "Serve.")'
