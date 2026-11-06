"""Dietary-restriction and pregnancy-safety rules, matched against recipe Name + ingredients.

Old behaviour this replaces (bugs):
- matched ingredients only, so "BBQ Chicken Pizza" (no 'chicken' in its ingredient list) passed Vegan;
- `\\bpeanut\\b` missed plurals ("peanuts", "almonds", "eggs") -> Nut-free / Egg-free leaked;
- Egg-free and Soy-free were sent by the frontend but ignored;
- if a filter left < 10 recipes it silently returned the UNFILTERED dataset (dangerous for allergies);
- nothing excluded pregnancy-unsafe dishes (alcohol, raw fish, high-mercury fish, liver/pâté).
"""

import re
from typing import Dict, Iterable, List

# Terms whose plain whole-word match would be wrong get an explicit regex.
_CUSTOM: Dict[str, str] = {
    # dairy look-alikes that are actually plant-based / not dairy
    "milk": r"(?<!coconut )(?<!almond )(?<!soy )(?<!oat )(?<!rice )(?<!cashew )\bmilks?\b",
    "butter": r"(?<!peanut )(?<!almond )(?<!cocoa )(?<!apple )(?<!cashew )(?<!sunflower )(?<!nut )\bbutters?\b",
    "cream": r"(?<!coconut )\bcreams?\b(?! of tartar)",
    # gluten-free flours / noodles / tortillas
    "flour": r"(?<!rice )(?<!almond )(?<!coconut )(?<!chickpea )(?<!corn )(?<!potato )(?<!tapioca )(?<!oat )(?<!buckwheat )\bflours?\b",
    "noodle": r"(?<!rice )\bnoodles?\b",
    "tortilla": r"(?<!corn )\btortillas?\b",
    # alcohol, but not vinegars / extracts / non-alcoholic drinks
    "wine": r"\bwines?\b(?!\s*vinegar)",
    "sherry": r"\bsherry\b(?!\s*vinegar)",
    "champagne": r"\bchampagne\b(?!\s*vinegar)",
    "rum": r"\brum\b(?!\s*(?:extract|flavou?ring))",
    "brandy": r"\bbrandy\b(?!\s*(?:extract|flavou?ring))",
    # usually gluten-free dishes that share a word with gluten ones
    "pie": r"(?<!shepherd's )(?<!shepherds )(?<!cottage )\bpies?\b",
    "cake": r"(?<!rice )\bcakes?\b",
}


def term_pattern(term: str) -> str:
    return _CUSTOM.get(term, r"\b" + re.escape(term) + r"(?:e?s)?\b")


def compile_terms(terms: Iterable[str]) -> str:
    """One regex for many terms. Plain terms share a single alternation (2-3x faster than one
    group per term on 340k recipes); terms with special rules keep their own pattern."""
    unique = list(dict.fromkeys(terms))
    plain = sorted((t for t in unique if t not in _CUSTOM), key=len, reverse=True)
    parts = []
    if plain:
        parts.append(r"\b(?:" + "|".join(re.escape(t) for t in plain) + r")(?:e?s)?\b")
    parts += [f"(?:{_CUSTOM[t]})" for t in unique if t in _CUSTOM]
    return "|".join(parts)


MEAT_AND_SEAFOOD = [
    "chicken", "beef", "pork", "lamb", "mutton", "veal", "venison", "turkey", "duck", "goose", "rabbit",
    "bacon", "ham", "hamburger", "prosciutto", "pancetta", "salami", "pepperoni", "sausage", "chorizo",
    "kielbasa", "steak", "meat", "meatball", "hot dog", "gelatin", "lard", "fish", "salmon", "tuna", "cod",
    "tilapia", "halibut", "trout", "sardine", "anchovy", "anchovies", "mackerel", "shrimp", "prawn", "crab",
    "lobster", "oyster", "mussel", "clam", "scallop", "squid", "calamari", "octopus", "fish sauce",
    "oyster sauce", "worcestershire sauce", "chicken broth", "beef broth", "chicken stock", "beef stock",
]
EGG = ["egg", "mayonnaise", "mayo", "meringue", "eggnog"]
DAIRY = [
    "milk", "cheese", "butter", "ghee", "paneer", "yogurt", "yoghurt", "curd", "cream", "whey", "casein",
    "buttermilk", "ricotta", "mozzarella", "parmesan", "cheddar", "feta", "gouda", "brie", "mascarpone",
    "half-and-half", "custard", "dairy",
]
GLUTEN = [
    "wheat", "flour", "bread", "breadcrumb", "panko", "pasta", "spaghetti", "macaroni", "lasagna", "noodle",
    "barley", "rye", "couscous", "bulgur", "semolina", "seitan", "cracker", "tortilla", "soy sauce", "beer",
    "malt", "farro", "spelt", "orzo", "crouton", "pie crust", "puff pastry", "pita", "bagel", "biscuit", "gluten",
    # Dish words: the dataset's ingredient lists often omit the crust/dough, which only shows in the name.
    "pie", "pastry", "pie shell", "bisquick", "crescent roll", "phyllo", "filo", "dumpling", "pizza", "calzone",
    "quiche", "empanada", "pierogi", "ravioli", "tortellini", "gnocchi", "waffle", "pancake", "muffin",
    "croissant", "pretzel", "stuffing", "cake", "cookie", "brownie", "cream of wheat",
]
NUTS = [
    "nut", "peanut", "almond", "walnut", "cashew", "pecan", "pistachio", "hazelnut", "macadamia",
    "brazil nut", "pine nut", "praline", "marzipan", "nutella",
    # nut-based products whose names hide the nut
    "amaretti", "pesto", "frangipane", "nougat", "baklava", "gianduja",
]
SOY = ["soy", "soya", "soybean", "tofu", "tempeh", "edamame", "miso", "tamari", "soy sauce"]

# Food groups are matched once each and cached; restrictions are unions of groups.
FOOD_GROUPS: Dict[str, List[str]] = {
    "meat": MEAT_AND_SEAFOOD,
    "egg": EGG,
    "dairy": DAIRY,
    "honey": ["honey"],
    "gluten": GLUTEN,
    "nuts": NUTS,
    "soy": SOY,
}
RESTRICTION_GROUPS: Dict[str, List[str]] = {
    "vegan": ["meat", "egg", "dairy", "honey"],
    "vegetarian": ["meat"],
    "dairy-free": ["dairy"],
    "egg-free": ["egg"],
    "gluten-free": ["gluten"],
    "nut-free": ["nuts"],
    "soy-free": ["soy"],
}
RESTRICTION_TERMS: Dict[str, List[str]] = {
    key: [term for g in groups for term in FOOD_GROUPS[g]] for key, groups in RESTRICTION_GROUPS.items()
}

# Common pregnancy food-safety guidance (NHS / ACOG): no alcohol, raw or undercooked fish dishes,
# high-mercury fish, liver/pâté (excess vitamin A), raw-egg desserts, unpasteurised milk.
PREGNANCY_UNSAFE = [
    # alcohol
    "wine", "beer", "lager", "stout", "rum", "vodka", "brandy", "cognac", "whiskey", "whisky", "bourbon",
    "tequila", "gin", "liqueur", "kahlua", "amaretto", "schnapps", "champagne", "prosecco", "vermouth",
    "sherry", "marsala", "sake", "grand marnier", "triple sec", "cointreau", "frangelico", "baileys",
    "irish cream", "creme de", "mead",
    # raw / undercooked
    "sushi", "sashimi", "ceviche", "tartare", "carpaccio", "raw egg", "eggnog", "tiramisu",
    # high-mercury fish
    "swordfish", "shark", "king mackerel", "tilefish", "marlin", "orange roughy", "bigeye",
    # liver / pâté
    "liver", "liverwurst", "pate", "pâté", "foie gras",
    # unpasteurised
    "unpasteurized", "unpasteurised", "raw milk",
]

# The Food.com dataset also contains pet-food recipes ("Dog Cookies"); never recommend them.
NOT_HUMAN_FOOD = [
    "dog treat", "dog cookie", "dog biscuit", "doggie", "doggy", "for dogs", "dog food", "for your dog",
    "cat treat", "cat food", "pet treat", "birdseed", "bird seed", "canine",
]

_ALIASES = {
    "plant based": "vegan", "plant-based": "vegan", "lactose free": "dairy-free", "lactose-free": "dairy-free",
    "dairy free": "dairy-free", "gluten free": "gluten-free", "nut free": "nut-free", "egg free": "egg-free",
    "soy free": "soy-free", "veg": "vegetarian",
}


def normalize_restrictions(values: Iterable[str]) -> List[str]:
    """'Vegan', 'gluten free', 'Gluten-free' -> canonical keys; unknown values are dropped."""
    out: List[str] = []
    for v in values or []:
        key = re.sub(r"[_\s]+", " ", str(v).strip().lower())
        key = _ALIASES.get(key, key.replace(" ", "-"))
        if key in RESTRICTION_TERMS and key not in out:
            out.append(key)
    return out
