"""Which meal of the day a recipe suits, from its name. The recipe data has no meal type, so this is a rule
set: clear keyword lists plus calorie ranges, with non-meals (sauces, drinks, spice mixes, desserts) left out."""

from __future__ import annotations

import re

import numpy as np
import pandas as pd

SLOTS = ["breakfast", "lunch", "dinner", "snack_am", "snack_pm"]
SLOT_LABEL = {"breakfast": "Breakfast", "lunch": "Lunch", "dinner": "Dinner", "snack_am": "Morning snack", "snack_pm": "Evening snack"}
SLOT_SHARE = {"breakfast": 0.25, "lunch": 0.30, "dinner": 0.30, "snack_am": 0.075, "snack_pm": 0.075}


def _words(terms):
    return re.compile(r"\b(?:" + "|".join(terms) + r")\b")


NOT_A_MEAL = _words([
    r"sauce", r"dressing", r"marinade", r"vinaigrette", r"rub", r"seasoning", r"spice mix", r"gravy", r"glaze", r"frosting",
    r"icing", r"syrup", r"jam", r"jelly", r"preserves", r"chutney", r"relish", r"pickles?", r"stock", r"broth",
    r"crust", r"dough", r"batter", r"cocktail", r"martini", r"margarita", r"punch", r"liqueur", r"wine", r"beer", r"vodka",
    r"rum", r"sangria", r"mojito", r"shots?", r"lemonade", r"tea", r"coffee", r"latte", r"cocoa", r"butter",
    r"mayonnaise", r"ketchup", r"mustard", r"salsa", r"pesto", r"croutons?", r"for dogs?", r"dog", r"cat",
])
DESSERT = _words([
    r"cakes?", r"cupcakes?", r"cookies?", r"brownies?", r"blondies?", r"fudge", r"candy", r"candies", r"toffee", r"truffles?",
    r"cheesecake", r"pudding", r"ice cream", r"sorbet", r"sherbet", r"pie", r"tarts?", r"cobbler", r"crisp", r"crumble",
    r"frosted", r"meringues?", r"macaroons?", r"doughnuts?", r"donuts?", r"dessert", r"sundae", r"mousse", r"custard",
    r"caramel", r"marshmallows?", r"pralines?", r"biscotti", r"shortbread", r"eclairs?", r"cinnamon rolls?",
])
BREAKFAST = _words([
    r"breakfast", r"brunch", r"pancakes?", r"waffles?", r"oats?", r"oatmeal", r"porridge", r"granola", r"muesli",
    r"omelet+e?s?", r"frittata", r"scrambled", r"eggs? (?:bake|cups?|muffins?)", r"french toast", r"smoothie", r"parfait",
    r"crepes?", r"upma", r"poha", r"idli", r"dosa", r"parathas?", r"chilla", r"cheela", r"overnight", r"chia", r"bagels?",
    r"hash browns?", r"breakfast burrito", r"huevos", r"shakshuka", r"quiche", r"muffins?", r"toast",
])
SNACK = _words([
    r"snacks?", r"bars?", r"bites", r"energy balls?", r"trail mix", r"hummus", r"dip", r"roasted chickpeas", r"popcorn",
    r"fruit salad", r"smoothie", r"yogh?urt", r"muffins?", r"crackers?", r"toast", r"nuts?", r"edamame", r"guacamole",
    r"apple", r"banana", r"berries", r"salad", r"soup", r"sprouts", r"chaat", r"dhokla", r"makhana", r"lassi", r"raita",
])
SPICY = _words([r"chil[ei]s?", r"chilli", r"cayenne", r"jalapenos?", r"habanero", r"sriracha", r"hot sauce", r"vindaloo", r"buffalo", r"spicy", r"fiery"])


def recipe_names(search_text: pd.Series) -> pd.Series:
    """The backend keeps lower-cased 'Name c("ingredient", ...)'; the name is the part before the ingredient list."""
    return search_text.str.split(' c\\("', n=1, regex=True).str[0].str.strip()


def classify(names: pd.Series, calories: np.ndarray) -> dict:
    """Boolean masks per slot family. Mains are 250-1000 kcal, breakfasts 200-700, snacks 60-300."""
    n = names.fillna("").to_numpy()
    meal = np.array([not NOT_A_MEAL.search(x) and not DESSERT.search(x) for x in n])
    breakfast_word = np.array([bool(BREAKFAST.search(x)) for x in n])
    snack_word = np.array([bool(SNACK.search(x)) for x in n])
    cal = np.asarray(calories, dtype=float)
    breakfast = meal & breakfast_word & (cal >= 200) & (cal <= 700)
    main = meal & ~breakfast_word & (cal >= 250) & (cal <= 1000)
    snack = meal & (snack_word | breakfast_word) & (cal >= 60) & (cal <= 300)
    spicy = np.array([bool(SPICY.search(x)) for x in n])
    return {"breakfast": breakfast, "main": main, "snack": snack, "spicy": spicy}
