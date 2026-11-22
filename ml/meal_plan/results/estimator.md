# Micronutrient estimator

341,128 recipes usable for fitting (of 375,703); 272,902 train / 68,226 test; 2,229 ingredients.

Spearman correlation between estimated and listed amounts per serving, held-out recipes. **Transfer** never saw fibre or sodium while fitting: those two columns are the test for nutrients without labels.

| Method | Protein | Fat | Carbs | Fiber | Sugar | Sodium | Sat. fat | Cholesterol |
|---|---|---|---|---|---|---|---|---|
| equal-mass | 0.81 | 0.73 | 0.61 | 0.48 | 0.68 | 0.44 | 0.76 | 0.68 |
| equal-energy | 0.84 | 0.77 | 0.65 | 0.55 | 0.60 | 0.52 | 0.78 | 0.68 |
| learned | 0.84 | 0.75 | 0.65 | 0.58 | 0.69 | 0.65 | 0.78 | 0.73 |
| transfer | 0.85 | 0.77 | 0.66 | 0.52* | 0.69 | 0.43* | 0.79 | 0.73 |
| energy-prior | 0.84 | 0.77 | 0.65 | 0.55 | 0.60 | 0.45 | 0.78 | 0.68 |
| anchored-transfer | 0.85 | 0.76 | 0.66 | 0.55 | 0.61 | 0.45 | 0.78 | 0.69 |

\* not used for fitting.

Held-out-nutrient score (mean Spearman on fibre and sodium, methods that never saw them): equal-mass 0.463, equal-energy 0.535, energy-prior 0.500, transfer 0.473, anchored-transfer 0.498.

## Independent check: iron, folate and calcium vs USDA prepared dishes

13,707 held-in recipes whose name matches one of 217 USDA prepared dishes (cookies, breads, soups, pizza…). Nutrient per kcal, estimate vs USDA: share within a factor of 2 (median |log2 ratio|).

| Method | Iron | Folate | Calcium | Mean within 2× |
|---|---|---|---|---|
| equal-mass | 52% (0.96) | 57% (0.82) | 34% (1.68) | 48% |
| equal-energy | 38% (1.50) | 59% (0.79) | 26% (2.01) | 41% |
| learned | 62% (0.68) | 48% (1.04) | 41% (1.28) | 51% |
| transfer | 46% (1.10) | 55% (0.86) | 33% (1.73) | 45% |
| anchored-transfer | 38% (1.49) | 57% (0.82) | 28% (1.98) | 41% |

**Used for iron, folate and calcium in the app: learned** (best on this check).

Share of held-out recipes estimated within ±30%:

| Method | Protein | Fat | Carbohydrate | Fiber | Sugar | Sodium | SaturatedFat | Cholesterol |
|---|---|---|---|---|---|---|---|---|
| equal-mass | 43% | 44% | 44% | 22% | 32% | 20% | 42% | 43% |
| equal-energy | 44% | 42% | 41% | 15% | 24% | 24% | 40% | 38% |
| learned | 50% | 49% | 49% | 29% | 33% | 34% | 46% | 47% |
| transfer | 51% | 51% | 49% | 23% | 34% | 20% | 47% | 47% |
| energy-prior | 44% | 42% | 41% | 15% | 24% | 17% | 40% | 38% |
| anchored-transfer | 47% | 46% | 43% | 16% | 25% | 17% | 43% | 41% |

Smallest typical amounts: salt, baking soda, kosher salt, sea salt, seasoning salt, baking powder, cinnamon, coarse salt, pepper, ground cinnamon, paprika, black pepper
Largest typical amounts: boneless skinless chicken breast, potato, salmon fillet, chicken breast, milk, boneless skinless chicken breast halve, chicken, ground beef, chicken thigh, chicken broth, garlic clove, lean ground beef
