# Pregnancy day plans from a recipe collection without micronutrient data

Research behind the app's **Day plan** (Diet Plan → Day plan, on the website and in the app).

**Question.** Can we build a day of meals (breakfast, lunch, dinner, two snacks) that meets trimester targets from a
375,703-recipe collection that lists calories and macronutrients but **no iron, folate or calcium and no ingredient
quantities**, and how much better is that than recommending "similar recipes"?

## Pipeline

| Step | Script | What it does |
|---|---|---|
| 1 | `ingredients.py` | USDA FoodData Central SR Legacy (public domain, 7,793 foods, per 100 g) + matching of recipe ingredient names to USDA foods |
| 2 | `estimate.py` | Learns typical ingredient amounts from the nutrients recipes *do* list, estimates iron/folate/calcium, validates on held-out recipes and against USDA prepared dishes |
| 2b | `calibrate.py` | Calibrates those estimates against USDA prepared dishes (fitted on half the dishes, tested on the other half) |
| 3 | `benchmark.py` | 200 synthetic pregnancy profiles × 4 planning methods, plus 7-day plans |
| app | `FastAPI_Backend/meal_plan/` | targets, meal slots, MILP optimiser, vitals/medicine context, Gemini review; `POST /meal-plan`, `/swap`, `/adjust`, `/review` |

```bash
# data (git-ignored): USDA SR Legacy CSV zip, ~6 MB
mkdir -p data && curl -o data/sr.zip https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip && unzip -q data/sr.zip -d data/usda_raw
python ingredients.py && python estimate.py && python calibrate.py && python benchmark.py   # estimate.py needs torch
```

## 1. Matching ingredients to USDA foods

TF-IDF over word tokens, plus rules: the ingredient's main noun must name the USDA food (so "chicken" is not "Fat,
chicken"), by-product forms (oil, soup, "vegetarian …") are penalised unless asked for, and ~200 frequent ingredients
are fixed by hand. **2,229 of the 2,774 ingredients used in ≥20 recipes are matched, covering 95.6% of all ingredient
mentions.** Hand check of usage-weighted random samples of 60: before the last round of fixes 49 exact, 4 close, 7 wrong
(88% correct or close); after the fixes, on a *new* sample, 53 exact, 4 close, 3 wrong (95% correct or close).

## 2. Estimating iron, folate and calcium

Model: a recipe's serving is a mix of its ingredients with mass shares `softmax(w)` (one weight per ingredient); the
serving mass is pinned by the listed calories, so `N = calories × Σ share·nutrient_per_g / Σ share·kcal_per_g`. The
weights are fitted on the 8 nutrients the recipes list (341,128 usable recipes, 80/20 split). The learned amounts are
sensible: salt, baking soda, baking powder, cinnamon, pepper and paprika get the smallest; chicken, potato and milk
the largest.

**Held-out recipes, nutrients the model was fitted on** (Spearman): learned beats both baselines, e.g. sodium 0.65 vs
0.44 (equal mass) and 0.52 (equal calories per ingredient); 34% vs 20–24% within ±30%.

**Proxy test for unlabelled nutrients** (fit without fibre and sodium, score on them): *no* gain: fibre 0.52 and sodium
0.43 vs 0.55 / 0.52 for "equal calories". By this test alone, the simple baseline would be chosen.

**Independent test on the nutrients that matter.** 13,707 recipes whose names match one of 217 USDA prepared dishes
(cookies, breads, soups, pizza…), nutrient per kcal vs USDA, share within a factor of 2:

| Method | Iron | Folate | Calcium | Mean |
|---|---|---|---|---|
| Learned amounts | **62%** | 48% | **41%** | **51%** |
| Equal mass | 52% | 57% | 34% | 48% |
| Learned without fibre/sodium | 46% | 55% | 33% | 45% |
| Equal calories per ingredient | 38% | 59% | 26% | 41% |

The method that won the proxy test is the **worst** here: giving every ingredient equal calories turns a pinch of
iron-dense spices or calcium-rich baking powder into a large share (sugar cookies came out at 814 mg calcium).
**Lesson: validating on substitute nutrients can pick the wrong model; we changed the selection rule to this
external check after seeing that, and say so.** The learned model is used.

## 2b. Calibration and the optimiser's curse

Raw estimates run high (iron 1.2×, folate 1.4×, calcium 1.9× the USDA values), and **the highest 20% run ~3× high**:
exactly the recipes an optimiser would choose. Uncalibrated, plans met the iron target on 100% of days, which is not
believable. A log-linear correction fitted on half the reference dishes, tested on the other half:

| Nutrient | Within 2× | Top-20% bias |
|---|---|---|
| Iron | 65% → 81% | 3.21× → 0.85× |
| Folate | 49% → 73% | 2.87× → 1.13× |
| Calcium | 42% → 52% | 3.36× → 0.55× (now low) |

The fitted slopes are small (0.16–0.32): after calibration a recipe's estimate follows its calories more than its
ingredients. **Ingredient lists without quantities carry only weak micronutrient information**; the app labels these
values "estimated".

## 3. Day plans

Optimiser: a mixed-integer programme (HiGHS via `scipy.optimize.milp`) choosing one recipe per meal from a
140-recipe shortlist per meal, minimising weighted shortfalls on protein, fibre, iron, folate and calcium, excess over
sodium, saturated fat, sugar and a 50 g fibre cap, and energy outside ±5%. Restrictions (vegan, gluten-free…) and
pregnancy food safety are applied before planning.

200 synthetic profiles (all trimesters, 35% vegetarian, diabetes / anaemia / constipation / heartburn at realistic
rates). A target is met when energy is within 10%, a minimum reaches 90%, a limit is respected:

| Method | Targets met | Energy error | Limits broken / day | Time |
|---|---|---|---|---|
| Similar recipes (the app before) | 35.2% | 44.7% | 2.87 | 574 ms |
| Random meals | 41.4% | 23.9% | 1.08 | 23 ms |
| Greedy, meal by meal | 62.3% | 9.6% | 0.32 | 17 ms |
| **Optimiser (MILP)** | **70.1%** | **4.9%** | **0.02** | 53 ms |

Average day as % of target: the optimiser reaches iron 56%, folate 71%, calcium 57% at 104% of energy with sodium 70%,
saturated fat 56% and sugar 45% of their limits. "Similar recipes" shows slightly higher micronutrients (65/80/58%)
only by overshooting energy (142%), sodium (158%) and saturated fat (148%). **No method reaches the iron, folate and
calcium targets from food alone on any day** after calibration, in line with guidance that these come partly from
prenatal supplements; every plan says so. The "similar recipes" recommender was built to suggest recipes, not to compose
a day: it is included to show the gap the new feature closes.

7-day plans with no recipe repeated: 20/20 complete, 70.1% of targets met, 0.4 s per week.

## In the app

* **Vitals and medicines shape the plan**: the latest reading (≤24 h old) and the patient's medicines adjust targets
  and add advice (fever → fluids; SpO₂ < 95% → iron favoured; resting HR > 100 → less salt; blood-pressure medicine →
  sodium ≤ 1,500 mg; diabetes medicine → sugar/carb caps; iron with calcium → different meals; thyroid tablet timing).
* **Adjust, don't regenerate**: fresh vitals adjust the current week's plan with at most 2 swaps a day (a swap must
  improve the objective by more than 0.05). In a test week, new readings broke the sodium limit on one day: 2 swaps
  fixed it and the other 33 meals stayed. A cost of 0.02 churned 10 meals for no extra benefit; 0.12 fixed nothing.
* **Real time first, Gemini second**: the optimiser answers in ~50 ms; Gemini then reviews the plan for restriction
  breaches word lists miss (anchovy in Caesar dressing, parmesan in pesto…) and pregnancy safety, writes a two-sentence
  summary, and flagged meals are replaced automatically. If the optimiser finds no plan (very narrow restrictions),
  Gemini writes the day, clearly marked as AI-written with approximate nutrients, and its meals still pass the
  restriction rules.
* **Shared with the doctor** like any other record; the doctor sees the day, its coverage and the meals.

## Limitations

Synthetic profiles, not patients. Micronutrients are estimates with modest accuracy (above). USDA prepared dishes are
mostly commercial or American; Indian home cooking is under-represented in the reference set. Meal types come from
recipe names (rules), so a few dishes land in the wrong slot. Nothing here is medical advice.
