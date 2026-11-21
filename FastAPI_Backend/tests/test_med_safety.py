"""Medicine safety checker: matching, pregnancy tiers, interactions, timing plan, API, and the model hook."""

import json
import os
import sys
import tempfile
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from med_safety.catalog import get_catalog  # noqa: E402
from med_safety.checker import check_medicines  # noqa: E402
from med_safety.model_layer import ModelLayer  # noqa: E402
from med_safety.schedule import parse_frequency  # noqa: E402

CAT = get_catalog()
NO_MODEL = ModelLayer(directory=Path(tempfile.mkdtemp()))  # hand-checked knowledge only


def tier(name, month, **kw):
    r = check_medicines([{"name": name, **kw}], month, model=NO_MODEL)
    return r["medicines"][0]["tier"]


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient

    import main

    with TestClient(main.app) as c:
        yield c


def test_knowledge_base_is_consistent():
    ids = set(CAT.ingredients)
    for p in CAT.products:
        assert p.ingredients and set(p.ingredients) <= ids, p.name
    for g in CAT.ingredients.values():
        assert set(g.pregnancy) == {"t1", "t2", "t3"}, g.id
        assert all(v in ("generally_used", "caution", "avoid") for v in g.pregnancy.values()), g.id
        assert g.source, f"{g.id} needs a source"
    classes = {c for g in CAT.ingredients.values() for c in g.classes}
    for rule in CAT.interactions:
        for side in (rule["a"], rule["b"]):
            assert (side[6:] in classes) if side.startswith("class:") else (side in ids), side
        assert rule["severity"] in ("timing", "caution", "avoid")
        assert rule["severity"] != "timing" or rule.get("gap_hours"), rule


@pytest.mark.parametrize("text,expected", [
    ("Tab. Thyronorm 50 mcg OD", "levothyroxine"),
    ("Orofer-XT", "iron"),
    ("DOLO 650", "paracetamol"),
    ("paracetmol", "paracetamol"),          # typo
    ("Inj Clexane 40", "enoxaparin"),
    ("amoxicillin + clavulanic acid", "amoxicillin"),
    ("Folitrax 7.5", "methotrexate"),       # a methotrexate brand, not folic acid
    ("Obimet SR 500", "metformin"),
])
def test_name_matching(text, expected):
    m = CAT.resolve(text)
    assert m is not None and expected in m.ingredient_ids, (text, m)


def test_unknown_name_is_not_guessed():
    assert CAT.resolve("zzqx tablet") is None
    assert CAT.resolve("pan") is not None  # short brand names match exactly only
    assert CAT.resolve("pain relief") is None


def test_known_teratogens_are_never_commonly_used():
    for name in ["isotretinoin", "valproate", "warfarin", "methotrexate", "enalapril", "losartan", "misoprostol", "thalidomide"]:
        for month in range(1, 10):
            assert tier(name, month) == "avoid", (name, month)


def test_nsaids_from_20_weeks_and_low_dose_aspirin():
    assert tier("ibuprofen", 3) == "caution"
    assert tier("ibuprofen", 5) == "avoid"
    assert tier("Brufen 400", 8) == "avoid"
    assert tier("Ecosprin 75", 8) == "generally_used"   # low-dose aspirin prescribed for pre-eclampsia
    assert tier("Disprin", 8) == "avoid"                # pain-relief dose
    assert tier("nitrofurantoin", 9) == "avoid"         # near term
    assert tier("doxycycline", 4) == "avoid"


def test_interactions_and_timing_plan():
    r = check_medicines([
        {"name": "Thyronorm 50 mcg", "frequency": "OD"},
        {"name": "Orofer XT", "frequency": "1-0-1"},
        {"name": "Shelcal 500", "frequency": "BD"},
    ], 6, model=NO_MODEL)
    pairs = {(x["a"], x["b"]): x for x in r["interactions"]}
    assert pairs[(0, 1)]["gap_hours"] == 4 and pairs[(0, 2)]["gap_hours"] == 4 and pairs[(1, 2)]["gap_hours"] == 2
    times = {}
    for slot in r["schedule"]["slots"]:
        hour = int(slot["time"][:2]) + int(slot["time"][3:]) / 60
        for it in slot["items"]:
            times.setdefault(it["index"], []).append(hour)
    assert slot_of(r, 0) == ["wake"], "thyroid tablet on an empty stomach"
    for (a, b), gap in {(0, 1): 4, (0, 2): 4, (1, 2): 2}.items():
        assert min(abs(x - y) for x in times[a] for y in times[b]) >= gap
    assert len(times[1]) == 2 and len(times[2]) == 2
    assert r["status"] == "ok"


def slot_of(result, index):
    return [s["slot"] for s in result["schedule"]["slots"] if any(i["index"] == index for i in s["items"])]


def test_duplicates_and_dont_stop():
    r = check_medicines([{"name": "Dolo 650"}, {"name": "Combiflam"}, {"name": "Valparin 200"}], 2, model=NO_MODEL)
    assert any(x["origin"] == "duplicate" and "paracetamol" in x["effect"] for x in r["interactions"])
    assert r["status"] == "avoid"
    assert "Valparin" in r["dont_stop"]
    assert r["medicines"][2]["ingredients"][0]["dont_stop"] is True


def test_unknown_medicine_needs_checking():
    r = check_medicines([{"name": "Folvite"}, {"name": "Totally Unknown 10mg"}], 4, model=NO_MODEL)
    assert r["medicines"][1]["tier"] == "unknown" and r["status"] == "caution"


def test_frequency_parsing():
    assert parse_frequency("1-0-1")["pattern"] == ["breakfast", "dinner"]
    assert parse_frequency("BD")["per_day"] == 2
    assert parse_frequency("TDS after food")["per_day"] == 3
    assert parse_frequency("HS")["pattern"] == ["bedtime"]
    assert parse_frequency("SOS")["as_needed"] is True
    assert parse_frequency("once a week")["weekly"] is True


def _write_model(dirpath, drugs, emb, rel, risk=None, threshold=0.7, labels=None):
    (dirpath / "meta.json").write_text(json.dumps({"version": "test", "model": "rgcn", "threshold": threshold, "drugs": drugs, "metrics": {"auroc": 0.9}}))
    arrays = {"embeddings": np.array(emb, dtype=np.float32), "relation": np.array(rel, dtype=np.float32), "bias": np.array(0.0)}
    if risk is not None:
        arrays["risk_probs"] = np.array(risk, dtype=np.float32)
    np.savez(dirpath / "embeddings.npz", **arrays)
    if labels:
        (dirpath / "label_tiers.json").write_text(json.dumps(labels))


def test_model_signals_are_labelled_and_never_override_checked_facts(tmp_path):
    drugs = [{"name": "paracetamol"}, {"name": "levothyroxine"}, {"name": "zolmitriptan"}, {"name": "rizatriptan"}]
    emb = [[3, 0], [0, 3], [3, 0], [3, 0]]
    _write_model(tmp_path, drugs, emb, [1, 1], risk=[[0.9, 0.08, 0.02]] * 4,
                 labels={"zolmitriptan": {"tier": "caution", "category": "C", "source": "FDA label (pre-2015 category C)"}})
    model = ModelLayer(directory=tmp_path)
    assert model.available
    r = check_medicines([{"name": "zolmitriptan"}, {"name": "rizatriptan"}, {"name": "Dolo 650"}], 6, model=model)
    zol = r["medicines"][0]
    assert zol["matched"] is False and zol["tier"] == "caution" and zol["label_info"]["category"] == "C"
    assert zol["model"]["risk"]["generally_used"] == 0.9            # shown, but it doesn't set the tier
    model_pairs = [x for x in r["interactions"] if x["origin"] == "model"]
    assert model_pairs and all("not been checked" in x["effect"] for x in model_pairs)
    # The hand-checked medicine keeps its checked tier whatever the model says.
    assert r["medicines"][2]["tier"] == "generally_used"


def test_api(client):
    res = client.get("/meds/search", params={"q": "shel"})
    assert res.status_code == 200 and res.json()["results"][0]["name"] == "Shelcal"
    res = client.post("/meds/check", json={"medicines": [{"name": "Isotroin 20"}], "pregnancy_month": 2})
    assert res.status_code == 200 and res.json()["status"] == "avoid"
    assert client.post("/meds/check", json={"medicines": []}).status_code == 422
    assert client.post("/meds/check", json={"medicines": [{"name": "x"}], "pregnancy_month": 12}).status_code == 422
    assert client.get("/meds/model").status_code == 200
