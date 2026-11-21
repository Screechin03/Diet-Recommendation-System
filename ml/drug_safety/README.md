# Pregnancy drug & supplement safety: graph model

Research part of the medicine checker. The app always answers from **hand-checked knowledge first**
(`FastAPI_Backend/med_safety/knowledge/`); this pipeline adds two things on top:

1. **Label tiers.** A pregnancy tier read from FDA drug labels (pre-2015 A/B/C/D/X category or a clear
   contraindication) for medicines that aren't in the hand-checked list. Shown as "From the drug label".
2. **Graph model.** A biomedical knowledge graph of drugs and their side-effect-typed interactions,
   with an R-GCN or GraphSAGE encoder trained for:
   - **DDI link prediction**: does a pair interact? This is shown in the app only as an unverified signal, and only
     for pairs the hand-checked rules don't cover.
   - **Pregnancy risk tier** (node classification). This is shown as the model's estimate, and it never sets the
     tier the patient sees.

Baseline: Morgan fingerprint (RDKit, radius 2, 1024 bits) + MLP. Metrics: AUROC and AUPRC on held-out pairs,
reported for two splits:
- **random**: held-out pairs.
- **cold**: held-out *drugs*. Every test pair contains a drug never seen in training. This is the honest number
  for new medicines; random splits overstate performance.

## Setup

```bash
cd ml/drug_safety
python -m venv .venv && . .venv/bin/activate        # Python 3.10+
pip install -r requirements.txt
```

## Data

The easiest way is to let the script fetch everything into `data/real/` (git-ignored, all free sources):

```bash
python download.py          # BIOSNAP interactions + drug names/structures (PubChem) + openFDA pregnancy labels
python download.py --biosnap path/to/ChCh-Miner_durgbank-chem-chem.tsv.gz   # reuse a file you already have
python download.py --tdc drugbank        # also TDC's DrugBank DDI (191k typed pairs)
```

The openFDA labels are about 1.8 GB to download in 14 files, and only their pregnancy sections are kept. Around 9 files
(roughly 75,000 labels) are plenty; use `--fda-files 9` to stop there.
Drug names, synonyms and structures come from PubChem, looked up by DrugBank id.

You can also add files by hand. The loaders read the published formats as they are:

| What | File | Formats understood |
|---|---|---|
| Interactions | `TWOSIDES.csv`, `ChCh-Miner_durgbank-chem-chem.tsv`, `*ddi*.csv` | TDC export (`Drug1_ID, Drug1, Drug2_ID, Drug2, Y`); nSIDES TWOSIDES (`drug_1_concept_name, ..., condition_concept_name`); Decagon combo (`STITCH 1, STITCH 2, ...`); BIOSNAP two-column TSV |
| Drug names / structures | `drugs.csv` or DrugBank `*vocabulary*.csv` | `id, name, synonyms (a\|b), smiles`, or DrugBank `DrugBank ID, Common name, Synonyms` |
| Pregnancy labels | `drug-label-*.json` (openFDA bulk download, unzipped) | openFDA drug label JSON (`results[].pregnancy`, `openfda.generic_name`) |

TDC exports already include SMILES. With BIOSNAP or nSIDES, add a `drugs.csv` with a `smiles` column (DrugBank
open structures or PubChem) so the fingerprint baseline and cold split have structures.

Very large files: `--max-rows 2000000` reads the first rows only; `--k-relations` keeps the most frequent side
effects as R-GCN relation types (the rest become "other").

## Run

```bash
python synthetic.py --out data/synthetic                      # optional: try everything on a small fake dataset
python benchmark.py --data data/real --name real --seeds 3    # -> results/real.md (table for the report), .csv, .json
python export.py --data data/real --model rgcn --benchmark results/real.json   # -> FastAPI_Backend/med_safety/model/
```

Then restart the backend. `GET /meds/model` shows the loaded model, its threshold and its test metrics.

The export sets the decision threshold on validation pairs so that about 90 % of pairs the app flags are real
interactions, trading recall for fewer false alarms to patients.

## Notes on the data

- TWOSIDES links come from adverse-event reports and BIOSNAP from literature mining. They are associations, not
  proof that one drug causes harm with another. That's fine for benchmarking, and it's why the app labels model
  output as unverified.
- The FDA dropped the A/B/C/D/X letters in 2015 (PLLR). Newer labels only have narrative text, so many recent drugs
  get no label tier. The free DrugBank subsets have no pregnancy data.
- The hand-checked list is also used as extra training labels for the risk task (`--no-curated-labels` turns that
  off, for example to evaluate on openFDA labels only).
