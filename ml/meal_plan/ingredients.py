"""Step 1: USDA food table + matching of recipe ingredient names to USDA foods.

    python ingredients.py            # writes data/usda_foods.csv and data/ingredient_matches.csv

USDA FoodData Central SR Legacy (public domain): 7,793 foods, nutrients per 100 g. Recipe ingredients
("all-purpose flour", "eggs", "fresh spinach") are matched to a food by TF-IDF similarity over word tokens,
with a small bonus for plain forms (raw, whole, dry) and a hand-checked override list for the most common
ingredients, where a wrong match would move many recipes.
"""

from __future__ import annotations

import collections
import csv
import re
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer

HERE = Path(__file__).parent
DATA = HERE / "data"
USDA_DIR = next((DATA / "usda_raw").glob("FoodData_Central_sr_legacy*"), None)
RECIPES = HERE.parent.parent / "Data" / "dataset1.csv"

# USDA nutrient id -> our column (all per 100 g)
NUTRIENTS = {
    1008: "energy_kcal", 1003: "protein_g", 1004: "fat_g", 1005: "carbs_g", 1079: "fiber_g", 2000: "sugar_g",
    1093: "sodium_mg", 1258: "satfat_g", 1253: "cholesterol_mg", 1087: "calcium_mg", 1089: "iron_mg",
    1190: "folate_ug", 1177: "folate_total_ug",
}
# Categories that are prepared dishes or brands, not ingredients.
SKIP_CATEGORIES = {"Fast Foods", "Restaurant Foods", "Baby Foods", "Meals, Entrees, and Side Dishes", "American Indian/Alaska Native Foods"}

# Most frequent ingredients, matched by hand (USDA description, exact). A wrong automatic match here would
# move thousands of recipes, so these are fixed.
OVERRIDES: Dict[str, str] = {
    "salt": "Salt, table",
    "butter": "Butter, salted",
    "sugar": "Sugars, granulated",
    "granulated sugar": "Sugars, granulated",
    "white sugar": "Sugars, granulated",
    "onion": "Onions, raw",
    "water": "Beverages, water, tap, drinking",
    "olive oil": "Oil, olive, salad or cooking",
    "garlic": "Garlic, raw",
    "garlic clove": "Garlic, raw",
    "egg": "Egg, whole, raw, fresh",
    "flour": "Wheat flour, white, all-purpose, enriched, bleached",
    "all-purpose flour": "Wheat flour, white, all-purpose, enriched, bleached",
    "milk": "Milk, whole, 3.25% milkfat, with added vitamin D",
    "pepper": "Spices, pepper, black",
    "black pepper": "Spices, pepper, black",
    "brown sugar": "Sugars, brown",
    "baking powder": "Leavening agents, baking powder, double-acting, sodium aluminum sulfate",
    "baking soda": "Leavening agents, baking soda",
    "vanilla": "Vanilla extract",
    "vanilla extract": "Vanilla extract",
    "vegetable oil": "Oil, vegetable, soybean, refined",
    "oil": "Oil, vegetable, soybean, refined",
    "lemon juice": "Lemon juice, raw",
    "cinnamon": "Spices, cinnamon, ground",
    "parmesan cheese": "Cheese, parmesan, grated",
    "sour cream": "Cream, sour, cultured",
    "cream cheese": "Cheese, cream",
    "honey": "Honey",
    "carrot": "Carrots, raw",
    "celery": "Celery, raw",
    "tomato": "Tomatoes, red, ripe, raw, year round average",
    "potato": "Potatoes, flesh and skin, raw",
    "unsalted butter": "Butter, without salt",
    "heavy cream": "Cream, fluid, heavy whipping",
    "cheddar cheese": "Cheese, cheddar",
    "mayonnaise": "Salad dressing, mayonnaise, regular",
    "soy sauce": "Soy sauce made from soy (tamari)",
    "chicken broth": "Soup, chicken broth, ready-to-serve",
    "green onion": "Onions, spring or scallions (includes tops and bulb), raw",
    "spinach": "Spinach, raw",
    "fresh spinach": "Spinach, raw",
    "rice": "Rice, white, long-grain, regular, raw, enriched",
    "long grain rice": "Rice, white, long-grain, regular, raw, enriched",
    "brown rice": "Rice, brown, long-grain, raw",
    "lentil": "Lentils, raw",
    "red lentil": "Lentils, pink or red, raw",
    "chickpea": "Chickpeas (garbanzo beans, bengal gram), mature seeds, raw",
    "oat": "Cereals, oats, regular and quick, not fortified, dry",
    "rolled oat": "Cereals, oats, regular and quick, not fortified, dry",
    "banana": "Bananas, raw",
    "lemon": "Lemons, raw, without peel",
    "lime juice": "Lime juice, raw",
    "ginger": "Ginger root, raw",
    "fresh ginger": "Ginger root, raw",
    "cumin": "Spices, cumin seed",
    "ground cumin": "Spices, cumin seed",
    "turmeric": "Spices, turmeric, ground",
    "paprika": "Spices, paprika",
    "chili powder": "Spices, chili powder",
    "cayenne pepper": "Spices, pepper, red or cayenne",
    "nutmeg": "Spices, nutmeg, ground",
    "oregano": "Spices, oregano, dried",
    "basil": "Basil, fresh",
    "parsley": "Parsley, fresh",
    "cilantro": "Coriander (cilantro) leaves, raw",
    "yogurt": "Yogurt, plain, whole milk",
    "plain yogurt": "Yogurt, plain, whole milk",
    "chicken breast": "Chicken, broilers or fryers, breast, meat only, raw",
    "boneless skinless chicken breast": "Chicken, broilers or fryers, breast, meat only, raw",
    "ground beef": "Beef, ground, 80% lean meat / 20% fat, raw",
    "walnut": "Nuts, walnuts, english",
    "pecan": "Nuts, pecans",
    "almond": "Nuts, almonds",
    "raisin": "Raisins, seedless",
    "cornstarch": "Cornstarch",
    "powdered sugar": "Sugars, powdered",
    "confectioners' sugar": "Sugars, powdered",
    "semi-sweet chocolate chips": "Candies, semisweet chocolate",
    "cocoa": "Cocoa, dry powder, unsweetened",
    "mushroom": "Mushrooms, white, raw",
    "zucchini": "Squash, summer, zucchini, includes skin, raw",
    "bell pepper": "Peppers, sweet, green, raw",
    "green bell pepper": "Peppers, sweet, green, raw",
    "red bell pepper": "Peppers, sweet, red, raw",
    "broccoli": "Broccoli, raw",
    "cabbage": "Cabbage, raw",
    "kale": "Kale, raw",
    "pea": "Peas, green, raw",
    "frozen pea": "Peas, green, frozen, unprepared",
    "corn": "Corn, sweet, yellow, raw",
    "mozzarella cheese": "Cheese, mozzarella, whole milk",
    "feta cheese": "Cheese, feta",
    "tofu": "Tofu, raw, firm, prepared with calcium sulfate",
    "black bean": "Beans, black, mature seeds, canned, low sodium",
    "kidney bean": "Beans, kidney, red, mature seeds, canned, drained solids",
    "pasta": "Pasta, dry, enriched",
    "spaghetti": "Pasta, dry, enriched",
    "bread": "Bread, wheat",
    "whole wheat flour": "Flour, whole wheat, unenriched",
    "salmon": "Fish, salmon, Atlantic, farmed, raw",
    "shrimp": "Crustaceans, shrimp, raw (not previously frozen)",
    "bacon": "Pork, cured, bacon, unprepared",
    "maple syrup": "Syrups, maple",
    "apple": "Apples, raw, with skin (Includes foods for USDA's Food Distribution Program)",
    "orange juice": "Orange juice, raw",
    "coconut milk": "Nuts, coconut milk, raw (liquid expressed from grated meat and water)",
    "peanut butter": "Peanut butter, smooth style, with salt",
    "dijon mustard": "Mustard, prepared, yellow",
    "worcestershire sauce": "Sauce, worcestershire",
    "tomato paste": "Tomato products, canned, paste, without salt added",
    "tomato sauce": "Tomato products, canned, sauce",
    "dried thyme": "Spices, thyme, dried",
    "thyme": "Spices, thyme, dried",
    "bay leaf": "Spices, bay leaf",
    "red pepper flakes": "Spices, pepper, red or cayenne",
    "shortening": "Shortening, vegetable, household, composite",
    "margarine": "Margarine, regular, 80% fat, composite, stick, with salt",
    "buttermilk": "Milk, buttermilk, fluid, cultured, lowfat",
    "egg white": "Egg, white, raw, fresh",
    "egg yolk": "Egg, yolk, raw, fresh",
    "sesame oil": "Oil, sesame, salad or cooking",
    "white wine vinegar": "Vinegar, distilled",
    "vinegar": "Vinegar, distilled",
    "cider vinegar": "Vinegar, cider",
    "red wine vinegar": "Vinegar, red wine",
    "balsamic vinegar": "Vinegar, balsamic",
    "avocado": "Avocados, raw, all commercial varieties",
    "cucumber": "Cucumber, with peel, raw",
    "chicken": "Chicken, broilers or fryers, meat and skin, raw",
    "whole chicken": "Chicken, broilers or fryers, meat and skin, raw",
    "boneless chicken breast": "Chicken, broilers or fryers, breast, meat only, raw",
    "chicken thigh": "Chicken, broilers or fryers, thigh, meat and skin, raw",
    "cheese": "Cheese, cheddar",
    "cream": "Cream, fluid, light (coffee cream or table cream)",
    "whipping cream": "Cream, fluid, heavy whipping",
    "half-and-half": "Cream, fluid, half and half",
    "kosher salt": "Salt, table",
    "sea salt": "Salt, table",
    "quinoa": "Quinoa, uncooked",
    "sweet potato": "Sweet potato, raw, unprepared (Includes foods for USDA's Food Distribution Program)",
    "chicken stock": "Soup, stock, chicken, home-prepared",
    "beef broth": "Soup, beef broth or bouillon, canned, ready-to-serve",
    "vegetable broth": "Soup, vegetable broth, ready to serve",
    "ketchup": "Catsup",
    "diced tomato": "Tomatoes, red, ripe, canned, packed in tomato juice",
    "canned tomato": "Tomatoes, red, ripe, canned, packed in tomato juice",
    "gingerroot": "Ginger root, raw",
    "bay leave": "Spices, bay leaf",
    "chocolate chip": "Candies, semisweet chocolate",
    "radish": "Radishes, raw",
    "roma tomato": "Tomatoes, red, ripe, raw, year round average",
    "cherry tomato": "Tomatoes, red, ripe, raw, year round average",
    "panko breadcrumb": "Bread, crumbs, dry, grated, plain",
    "breadcrumb": "Bread, crumbs, dry, grated, plain",
    "tahini": "Seeds, sesame butter, tahini, from roasted and toasted kernels (most common type)",
    "cornflour": "Cornstarch",
    "garam masala": "Spices, coriander seed",
    "coriander": "Spices, coriander seed",
    "ground coriander": "Spices, coriander seed",
    "paneer": "Cheese, ricotta, whole milk",
    "cottage cheese": "Cheese, cottage, creamed, large or small curd",
    "ricotta cheese": "Cheese, ricotta, whole milk",
    "green chili": "Peppers, hot chili, green, raw",
    "green chilies": "Peppers, hot chili, green, raw",
    "jalapeno": "Peppers, jalapeno, raw",
    "jalapeno pepper": "Peppers, jalapeno, raw",
    "mint": "Spearmint, fresh",
    "mint leave": "Spearmint, fresh",
    "black peppercorn": "Spices, pepper, black",
    "peppercorn": "Spices, pepper, black",
    "chickpea flour": "Chickpea flour (besan)",
    "besan": "Chickpea flour (besan)",
    "split pea": "Peas, split, mature seeds, raw",
    "linguine": "Pasta, dry, enriched",
    "noodle": "Noodles, egg, dry, enriched",
    "egg noodle": "Noodles, egg, dry, enriched",
    "macaroni": "Pasta, dry, enriched",
    "penne pasta": "Pasta, dry, enriched",
    "lasagna noodle": "Pasta, dry, enriched",
    "tortilla": "Tortillas, ready-to-bake or -fry, flour, refrigerated",
    "flour tortilla": "Tortillas, ready-to-bake or -fry, flour, refrigerated",
    "corn tortilla": "Tortillas, ready-to-bake or -fry, corn",
    "strawberry": "Strawberries, raw",
    "blueberry": "Blueberries, raw",
    "orange": "Oranges, raw, all commercial varieties",
    "peanut": "Peanuts, all types, raw",
    "cashew": "Nuts, cashew nuts, raw",
    "pumpkin": "Pumpkin, raw",
    "canned pumpkin": "Pumpkin, canned, without salt",
    "beef": "Beef, ground, 85% lean meat / 15% fat, raw",
    "pork": "Pork, fresh, loin, whole, separable lean and fat, raw",
    "lamb": "Lamb, domestic, composite of trimmed retail cuts, separable lean and fat, trimmed to 1/4\" fat, choice, raw",
    "fish": "Fish, cod, Atlantic, raw",
    "tuna": "Fish, tuna, light, canned in water, drained solids",
    "red pepper flake": "Spices, pepper, red or cayenne",
    "crushed red pepper flake": "Spices, pepper, red or cayenne",
    "salsa": "Sauce, salsa, ready-to-serve",
    "low-fat milk": "Milk, lowfat, fluid, 1% milkfat, with added vitamin A and vitamin D",
    "plum tomato": "Tomatoes, red, ripe, raw, year round average",
    "cocoa powder": "Cocoa, dry powder, unsweetened",
    "salmon fillet": "Fish, salmon, Atlantic, farmed, raw",
    "icing sugar": "Sugars, powdered",
    "seasoning salt": "Salt, table",
    "broth": "Soup, chicken broth, ready-to-serve",
    "turkey broth": "Soup, chicken broth, ready-to-serve",
    "low sodium chicken broth": "Soup, chicken broth, low sodium, canned",
    "marshmallow": "Candies, marshmallows",
    "miniature marshmallow": "Candies, marshmallows",
    "coconut": "Nuts, coconut meat, raw",
    "lemon rind": "Lemon peel, raw",
    "lemon zest": "Lemon peel, raw",
    "lemon rind of": "Lemon peel, raw",
    "orange zest": "Orange peel, raw",
    "orange rind": "Orange peel, raw",
    "tomato puree": "Tomato products, canned, puree, without salt added",
    "creole mustard": "Mustard, prepared, yellow",
    "quick-cooking oat": "Cereals, oats, regular and quick, not fortified, dry",
    "old-fashioned oat": "Cereals, oats, regular and quick, not fortified, dry",
    "dill": "Dill weed, fresh",
    "fresh dill": "Dill weed, fresh",
    "powdered ginger": "Spices, ginger, ground",
    "ground ginger": "Spices, ginger, ground",
}

# Words about preparation or size, not about the food itself.
STOP_WORDS = {
    "fresh", "frozen", "chopped", "diced", "minced", "sliced", "large", "small", "medium", "warm", "cold", "of", "kosher",
    "boneless", "skinless", "finely", "coarsely", "freshly", "grated", "shredded", "crushed", "packed", "ripe", "organic",
    "light", "lean", "extra", "virgin", "extra-virgin", "unsweetened", "sweetened", "plain", "whole", "softened", "melted",
    "cooked", "uncooked", "boiling", "hot", "lukewarm", "prepared", "jar", "can", "canned", "baby",
}

PLAIN_WORDS = {"raw", "whole", "dry", "fresh", "plain", "regular", "uncooked"}
PENALTY_WORDS = {"ready-to-eat", "babyfood", "imitation", "reduced", "lowfat", "fat-free", "nonfat", "light", "dehydrated", "prepared", "with"}


def singular(word: str) -> str:
    if len(word) > 4 and word.endswith("ies"):
        return word[:-3] + "y"
    if len(word) > 4 and word.endswith("oes"):
        return word[:-2]
    if len(word) > 3 and word.endswith("s") and not word.endswith(("ss", "us", "is")):
        return word[:-1]
    return word


def normalise(name: str) -> str:
    words = re.findall(r"[a-z][a-z'\-]*", name.lower())
    return " ".join(singular(w) for w in words)


# Last words that name a part or a form, not the food ("anchovy fillet", "basil leave", "walnut piece").
PART_WORDS = {"piece", "halve", "half", "fillet", "leave", "leaf", "clove", "stick", "sprig", "bunch", "cube", "slice", "strip", "wedge", "floret", "head", "breast", "thigh"}
# USDA names that are a by-product or a prepared form; only right when the ingredient says so.
FORM_WORDS = {"oil", "fat", "vegetarian", "soup", "sauce", "candie", "cookie", "snack", "cracker", "jellie", "jelly", "gelatin", "dressing", "drumstick", "babyfood", "yeast"}
# USDA names that start with a family ("Spices, pepper, black"): the food is in the second part.
FAMILY_WORDS = {"spice", "nut", "seed", "fish", "crustacean", "mollusk", "bean", "cheese", "sugar", "syrup", "cereal", "beverage", "alcoholic", "leavening", "salad", "tomato", "pea", "pepper", "rice", "wheat", "flour", "oil", "cream", "milk", "yogurt", "pasta", "bread", "lettuce", "squash", "cabbage", "onion", "egg", "beef", "pork", "chicken", "turkey", "lamb"}


def head_noun(name: str) -> str:
    words = name.split()
    while len(words) > 1 and words[-1] in PART_WORDS:
        words = words[:-1]
    return words[-1] if words else ""


def resolve(description: str, pool: pd.DataFrame, by_desc: Dict[str, int]) -> int | None:
    """Exact USDA description, else the closest one in the same family (same first part)."""
    i = by_desc.get(description.lower())
    if i is not None:
        return i
    first = description.split(",")[0].strip().lower()
    want = set(re.findall(r"[a-z0-9%]+", description.lower()))
    best, best_score = None, 0.0
    for j, d in enumerate(pool["description"]):
        if d.split(",")[0].strip().lower() != first:
            continue
        have = set(re.findall(r"[a-z0-9%]+", d.lower()))
        odd = {"cooked", "imitation", "low", "lowfat", "reduced", "nonfat", "substitute", "free", "fortified", "native"}
        score = len(want & have) / len(want | have) - 0.2 * len((have & odd) - want)
        if score > best_score:
            best, best_score = j, score
    return best


def core(name: str) -> str:
    """Ingredient without preparation/size words ('fresh chopped spinach' -> 'spinach')."""
    kept = [w for w in name.split() if w not in STOP_WORDS]
    return " ".join(kept) or name


def parse_parts(value) -> List[str]:
    """R-style `c("a", "b")` -> ["a", "b"] (normalised)."""
    if not isinstance(value, str):
        return []
    return [normalise(x) for x in re.findall(r'"([^"]*)"', value) if x.strip()]


def build_usda_table() -> pd.DataFrame:
    if USDA_DIR is None:
        raise SystemExit("USDA data missing: see README (download step).")
    food = pd.read_csv(USDA_DIR / "food.csv", usecols=["fdc_id", "description", "food_category_id"])
    cats = pd.read_csv(USDA_DIR / "food_category.csv").set_index("id")["description"]
    food["category"] = food["food_category_id"].map(cats)
    fn = pd.read_csv(USDA_DIR / "food_nutrient.csv", usecols=["fdc_id", "nutrient_id", "amount"])
    fn = fn[fn["nutrient_id"].isin(NUTRIENTS)]
    wide = fn.pivot_table(index="fdc_id", columns="nutrient_id", values="amount", aggfunc="first").rename(columns=NUTRIENTS)
    out = food.drop(columns="food_category_id").merge(wide, left_on="fdc_id", right_index=True, how="inner")
    # Folate as DFE where reported (accounts for folic acid in fortified foods), else total folate.
    out["folate_ug"] = out["folate_ug"].fillna(out["folate_total_ug"])
    out = out.drop(columns="folate_total_ug")
    nutrient_cols = [c for c in NUTRIENTS.values() if c != "folate_total_ug"]
    out[nutrient_cols] = out[nutrient_cols].fillna(0.0)
    out = out[out["energy_kcal"].notna()].reset_index(drop=True)
    out.to_csv(DATA / "usda_foods.csv", index=False)
    return out


def read_recipes(**kwargs) -> pd.DataFrame:
    """The recipes file is gzip-compressed whatever its extension."""
    with open(RECIPES, "rb") as f:
        gz = f.read(2) == b"\x1f\x8b"
    return pd.read_csv(RECIPES, compression="gzip" if gz else None, **kwargs)


def ingredient_counts(max_rows: int | None = None) -> collections.Counter:
    df = read_recipes(usecols=["RecipeIngredientParts"], nrows=max_rows)
    cnt: collections.Counter = collections.Counter()
    for value in df["RecipeIngredientParts"]:
        cnt.update(set(parse_parts(value)))
    return cnt


def match(names: List[str], usda: pd.DataFrame) -> List[Tuple[str, int | None, str, float]]:
    pool = usda[~usda["category"].isin(SKIP_CATEGORIES)].reset_index(drop=True)
    desc = pool["description"].str.lower()
    docs = [normalise(d.replace(",", " ")) for d in desc]
    vec = TfidfVectorizer(token_pattern=r"[a-z][a-z'\-]+", sublinear_tf=True)
    X = vec.fit_transform(docs)
    bonus = np.array([0.04 * sum(w in PLAIN_WORDS for w in re.findall(r"[a-z]+", d)) - 0.05 * sum(w in PENALTY_WORDS for w in re.findall(r"[a-z\-]+", d)) for d in desc])
    # Prefer foods whose first segment ("Onions" in "Onions, raw") is the ingredient's head noun.
    head_seg = [normalise(d.split(",")[0]) for d in desc]
    by_desc = {d.lower(): i for i, d in enumerate(pool["description"])}
    out = []
    cores = [core(n) for n in names]
    Q = vec.transform(cores)
    sims = (Q @ X.T).toarray()
    segs = [[normalise(p) for p in d.split(",")[:2]] for d in desc]
    first_words = [set(sg[0].split()) for sg in segs]
    near_words = [set(" ".join(sg).split()) if sg[0].split() and sg[0].split()[0] in FAMILY_WORDS else set(sg[0].split()) for sg in segs]
    resolved = {key: resolve(v, pool, by_desc) for key, v in OVERRIDES.items()}
    for k, name in enumerate(names):
        i = None
        for key in (name, cores[k]):
            i = resolved.get(key)
            if i is not None:
                break
        if i is not None:
            out.append((name, int(pool.at[i, "fdc_id"]), pool.at[i, "description"], 1.0))
            continue
        # The ingredient's main noun (last word) must name the food, not a part or by-product of it:
        # "chicken" -> "Chicken, broilers..." rather than "Fat, chicken".
        head = head_noun(cores[k])
        words = set(cores[k].split())
        head_ok = np.array([head in w for w in near_words])
        form_bad = np.array([bool((fw & FORM_WORDS) - words) for fw in first_words])
        score = sims[k] + bonus + np.where(head_ok, 0.3, -0.15) - np.where(form_bad, 0.4, 0.0)
        i = int(score.argmax())
        if sims[k, i] < 0.45:
            out.append((name, None, "", float(sims[k, i])))
        else:
            out.append((name, int(pool.at[i, "fdc_id"]), pool.at[i, "description"], float(sims[k, i])))
    return out


def main() -> None:
    usda = build_usda_table()
    print(f"USDA foods with nutrients: {len(usda)}")
    cnt = ingredient_counts()
    names = [n for n, c in cnt.most_common() if c >= 20 and n]  # ingredients in at least 20 recipes
    total = sum(cnt.values())
    rows = match(names, usda)
    with open(DATA / "ingredient_matches.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["ingredient", "recipes", "fdc_id", "usda_description", "similarity"])
        for name, fdc, d, s in rows:
            w.writerow([name, cnt[name], fdc or "", d, round(s, 3)])
    matched = sum(cnt[n] for n, fdc, _, _ in rows if fdc)
    print(f"{len(names)} ingredients appear in >=20 recipes; {sum(1 for r in rows if r[1])} matched")
    print(f"matched mentions: {matched / total:.1%} of all ingredient mentions")


if __name__ == "__main__":
    main()
