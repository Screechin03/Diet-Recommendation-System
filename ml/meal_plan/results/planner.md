# Day-plan benchmark

200 synthetic pregnancy profiles (all trimesters, 35% vegetarian, common conditions). A target is met when energy is within 10%, a minimum reaches 90% and a limit is respected.

| Method | Targets met | All met | Mean adequacy | Energy error | Limits broken / day | Time |
|---|---|---|---|---|---|---|
| Similar recipes (current app) | 35.2% | 0.0% | 80.0% | 44.7% | 2.87 | 574 ms |
| Random meals | 41.4% | 0.0% | 53.9% | 23.9% | 1.08 | 23 ms |
| Greedy, meal by meal | 62.3% | 0.0% | 74.7% | 9.6% | 0.32 | 17 ms |
| Optimiser (MILP) | 70.1% | 0.0% | 76.9% | 4.9% | 0.02 | 53 ms |

Share of days meeting each target:

| Method | Energy | Protein | Fibre | Iron* | Folate* | Calcium* | Sodium ≤ | Sat. fat ≤ | Sugar ≤ |
|---|---|---|---|---|---|---|---|---|---|
| Similar recipes (current app) | 6% | 96% | 100% | 2% | 27% | 0% | 4% | 18% | 75% |
| Random meals | 13% | 60% | 42% | 0% | 0% | 0% | 50% | 65% | 84% |
| Greedy, meal by meal | 51% | 100% | 100% | 0% | 0% | 0% | 100% | 100% | 100% |
| Optimiser (MILP) | 100% | 100% | 100% | 0% | 0% | 0% | 100% | 100% | 100% |

Average day as % of each target (minimums: higher is better; limits marked ≤: at most 100%):

| Method | Energy | Protein | Fibre | Iron* | Folate* | Calcium* | Sodium ≤ | Sat. fat ≤ | Sugar ≤ |
|---|---|---|---|---|---|---|---|---|---|
| Similar recipes (current app) | 142% | 233% | 214% | 65% | 80% | 58% | 158% | 148% | 79% |
| Random meals | 78% | 104% | 87% | 33% | 40% | 32% | 103% | 90% | 65% |
| Greedy, meal by meal | 109% | 200% | 168% | 54% | 66% | 53% | 55% | 55% | 38% |
| Optimiser (MILP) | 104% | 168% | 145% | 56% | 71% | 57% | 70% | 56% | 45% |

\* estimated from ingredients and calibrated against USDA prepared dishes (see estimator.md, calibration.md).

Week plans (7 days, no recipe repeated, 20 profiles): 100% complete, 70.1% of targets met on average, 70.1% on day 7; 0.4 s per week.
