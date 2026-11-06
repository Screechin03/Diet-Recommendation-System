"""Content-based recipe recommender: ingredient pre-filter + KNN (cosine) over 9 nutrition values."""

import html
import re
from typing import Dict, List, Optional, Sequence

import numpy as np
import pandas as pd
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import StandardScaler

# Order must match calculate_pregnancy_nutrition() in main.py.
NUTRITION_COLUMNS = [
    "Calories",
    "FatContent",
    "SaturatedFatContent",
    "CholesterolContent",
    "SodiumContent",
    "CarbohydrateContent",
    "FiberContent",
    "SugarContent",
    "ProteinContent",
]

SEARCH_COLUMN = "_search"  # lower-cased "Name + ingredients", precomputed once at dataset load


def build_search_text(df: pd.DataFrame) -> pd.Series:
    return (df["Name"].fillna("").astype(str) + " " + df["RecipeIngredientParts"].fillna("").astype(str)).str.lower()


def _search_text(df: pd.DataFrame) -> pd.Series:
    return df[SEARCH_COLUMN] if SEARCH_COLUMN in df.columns else build_search_text(df)


def ingredient_pattern(term: str) -> str:
    """Whole-word match that also accepts simple plurals (egg/eggs, tomato/tomatoes)."""
    return r"\b" + re.escape(term) + r"(?:e?s)?\b"


def extract_ingredient_filtered_data(dataframe: pd.DataFrame, ingredients: Sequence[str], min_results: int = 5) -> pd.DataFrame:
    """Keep recipes that contain the requested ingredients, preferring recipes that contain MORE of them.

    Falls back step by step (all ingredients -> fewer -> any -> partial word) and finally to the whole
    set, so results are deterministic (the old code returned a random sample when nothing matched).
    """
    terms: List[str] = []
    for ing in ingredients:
        t = str(ing).strip().lower()
        if t and t not in terms:
            terms.append(t)
    terms = terms[:6]
    if not terms or dataframe.empty:
        return dataframe

    text = _search_text(dataframe)
    counts = np.zeros(len(dataframe), dtype=int)
    for term in terms:
        counts += text.str.contains(ingredient_pattern(term), regex=True, na=False).to_numpy()

    for k in range(len(terms), 0, -1):
        mask = counts >= k
        if mask.sum() >= min_results:
            return dataframe[mask]
    if (counts > 0).any():
        return dataframe[counts > 0]  # fewer than requested, but all relevant

    partial = np.zeros(len(dataframe), dtype=bool)
    for term in terms:
        partial |= text.str.contains(re.escape(term), regex=True, na=False).to_numpy()
    if partial.any():
        return dataframe[partial]

    return dataframe  # nothing matches: rank the whole set by nutrition only


def recommend(
    dataframe: pd.DataFrame,
    _input: Sequence[float],
    ingredients: Sequence[str] = (),
    params: Optional[Dict] = None,
) -> Optional[pd.DataFrame]:
    params = params or {}
    n_neighbors = max(1, int(params.get("n_neighbors", 5)))

    data = extract_ingredient_filtered_data(dataframe, ingredients, min_results=n_neighbors)
    if data.empty:
        return None
    n_neighbors = min(n_neighbors, len(data))

    features = data[NUTRITION_COLUMNS].to_numpy(dtype=float)
    scaler = StandardScaler().fit(features)
    neigh = NearestNeighbors(metric="cosine", algorithm="brute").fit(scaler.transform(features))
    target = scaler.transform(np.asarray(_input, dtype=float).reshape(1, -1))
    # Always request indices only: the old pipeline crashed (500) when return_distance=true,
    # because it used the distance array as row indices.
    indices = neigh.kneighbors(target, n_neighbors=n_neighbors, return_distance=False)[0]
    return data.iloc[indices]


def extract_quoted_strings(s) -> List[str]:
    """Parse the dataset's R-style c("a", "b") lists."""
    return [html.unescape(x) for x in re.findall(r'"([^"]*)"', str(s or ""))]


def output_recommended_recipes(dataframe: Optional[pd.DataFrame]) -> Optional[List[Dict]]:
    if dataframe is None:
        return None
    output = dataframe.drop(columns=[SEARCH_COLUMN], errors="ignore").to_dict("records")
    for recipe in output:
        recipe["Name"] = html.unescape(str(recipe.get("Name", "")))
        recipe["RecipeIngredientParts"] = extract_quoted_strings(recipe.get("RecipeIngredientParts"))
        recipe["RecipeInstructions"] = extract_quoted_strings(recipe.get("RecipeInstructions"))
    return output
