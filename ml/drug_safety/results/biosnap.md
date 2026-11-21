# Benchmark: biosnap

1514 drugs, 48514 interacting pairs, 2 relation types, 3 seeds.

## Drug-drug interaction (link prediction, held-out pairs)

*random* = held-out pairs; *cold* = every test pair involves a drug never seen in training.

| Split | Model | AUROC | AUPRC |
|---|---|---|---|
| cold | fp_mlp | 0.765 ± 0.034 | 0.775 ± 0.029 |
| cold | rgcn | 0.649 ± 0.051 | 0.657 ± 0.053 |
| cold | sage | 0.542 ± 0.109 | 0.569 ± 0.095 |
| random | fp_mlp | 0.956 ± 0.003 | 0.959 ± 0.003 |
| random | rgcn | 0.947 ± 0.008 | 0.943 ± 0.009 |
| random | sage | 0.954 ± 0.003 | 0.951 ± 0.005 |

## Pregnancy risk tier (node classification)

368 labelled drugs.

| Model | MACRO AUROC | MACRO F1 | ACCURACY |
|---|---|---|---|
| fp_mlp | 0.692 ± 0.048 | 0.524 ± 0.047 | 0.533 ± 0.056 |
| rgcn | 0.710 ± 0.055 | 0.520 ± 0.036 | 0.527 ± 0.036 |
| sage | 0.719 ± 0.040 | 0.526 ± 0.077 | 0.533 ± 0.076 |
