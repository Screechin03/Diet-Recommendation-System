Files written by `ml/drug_safety/export.py` (meta.json, embeddings.npz, label_tiers.json).
Until they exist, the medicine checker runs on the hand-checked knowledge in `../knowledge/` only.
The backend reads them at startup with numpy; PyTorch is not needed here.
