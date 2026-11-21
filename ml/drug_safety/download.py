"""Fetches everything the benchmark needs into data/real/ (git-ignored). Free sources only:

  interactions   BIOSNAP ChCh-Miner (Stanford SNAP), 48,514 DrugBank drug-drug pairs         [default]
                 TDC DrugBank DDI (191,808 typed pairs) and TWOSIDES (4.6M rows), via Harvard Dataverse  [--tdc]
  drugs.csv      DrugBank id -> name, synonyms, SMILES, from PubChem (public domain)
  labels         openFDA drug labels, trimmed to the pregnancy sections + drug names            [default]

    python download.py                         # BIOSNAP + names/structures + openFDA labels
    python download.py --biosnap ../ChCh-Miner_durgbank-chem-chem.tsv.gz   # use a file you already have
    python download.py --tdc drugbank          # also TDC's DrugBank DDI (non-commercial licence)
    python download.py --fda-files 3           # only the first 3 of ~14 label files (quicker try)

Licences: BIOSNAP and TDC DrugBank data derive from DrugBank (academic / non-commercial use); PubChem is public domain;
openFDA is public domain. Check them before any commercial use.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import shutil
import sys
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path
from typing import Dict, Iterator, List, Optional

HERE = Path(__file__).parent
OUT = HERE / "data" / "real"
UA = {"User-Agent": "MamaCare-research-dataset-script/1.0 (academic project)"}

BIOSNAP_URL = "https://snap.stanford.edu/biodata/datasets/10001/files/ChCh-Miner_durgbank-chem-chem.tsv.gz"
TDC_FILES = {  # Harvard Dataverse file ids used by PyTDC 1.1 (tdc/metadata.py)
    "drugbank": (4139573, "tdc_drugbank_ddi.tsv"),
    "twosides": (4139574, "tdc_twosides.csv"),
}
FDA_INDEX = "https://api.fda.gov/download.json"
LABEL_FIELDS = ("pregnancy", "teratogenic_effects", "pregnancy_or_breast_feeding", "use_in_specific_populations")


def fetch(url: str, dest: Path, what: str) -> Path:
    if dest.exists() and dest.stat().st_size > 0:
        print(f"  {what}: already downloaded ({dest.name})")
        return dest
    print(f"  {what}: downloading {url.split('?')[0]}")
    req = urllib.request.Request(url, headers=UA)
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(req, timeout=120) as r, open(tmp, "wb") as f:
        total = int(r.headers.get("content-length") or 0)
        done, last = 0, time.time()
        while chunk := r.read(1 << 20):
            f.write(chunk)
            done += len(chunk)
            if time.time() - last > 5:
                print(f"    {done / 1e6:.0f} MB" + (f" of {total / 1e6:.0f} MB" if total else ""), flush=True)
                last = time.time()
    tmp.rename(dest)
    print(f"    saved {dest.name} ({dest.stat().st_size / 1e6:.1f} MB)")
    return dest


PUBCHEM = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"


def pubchem(path: str) -> Optional[dict]:
    """PubChem PUG REST, ~4 requests a second (their limit is 5). None = PubChem rejected the request."""
    for attempt in range(4):
        time.sleep(0.25)
        try:
            with urllib.request.urlopen(urllib.request.Request(f"{PUBCHEM}/{path}", headers=UA), timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (400, 404):  # bad or unknown id in the request: retrying won't help
                return None if e.code == 400 else {}
            time.sleep(3 * (attempt + 1))  # busy / rate limited
        except Exception:
            time.sleep(3 * (attempt + 1))
    return None


def pubchem_batched(template: str, items: List[str], key: str, size: int = 100) -> List[dict]:
    """Runs template.format(ids=...) over batches; a rejected batch is split until the bad ids are isolated."""
    out: List[dict] = []
    for k in range(0, len(items), size):
        chunk = items[k:k + size]
        res = pubchem(template.format(ids=",".join(chunk)))
        if res is None:
            if len(chunk) > 1:
                out += pubchem_batched(template, chunk, key, max(1, len(chunk) // 4))
            continue
        out += res.get(key[0], {}).get(key[1], [])
    return out


def drugbank_ids_in(directory: Path) -> List[str]:
    ids = set()
    for path in directory.iterdir():
        if path.name.startswith("ChCh") or path.suffix in (".tsv", ".tab") or path.name.endswith(".tsv.gz"):
            opener = __import__("gzip").open if path.suffix == ".gz" else open
            with opener(path, "rt") as f:
                for line in f:
                    for tok in line.replace(",", "\t").split("\t")[:4]:
                        tok = tok.strip()
                        if tok.startswith("DB") and tok[2:].isdigit():
                            ids.add(tok)
    return sorted(ids)


def build_drug_table(dest: Path) -> None:
    """drugs.csv for every DrugBank id in the interaction files: name, synonyms, SMILES (PubChem)."""
    if dest.exists():
        print(f"  drug names & structures: already built ({dest.name})")
        return
    ids = drugbank_ids_in(OUT)
    if not ids:
        print("  drug names & structures: no DrugBank ids found in data/real; skipped")
        return
    print(f"  drug names & structures: looking up {len(ids)} DrugBank ids on PubChem")
    cid_of: Dict[str, int] = {}
    regs = pubchem_batched("substance/sourceid/DrugBank/{ids}/xrefs/RegistryID/JSON", ids, ("InformationList", "Information"))
    reg_by_sid = {i["SID"]: (i.get("RegistryID") or [None])[0] for i in regs}
    for i in pubchem_batched("substance/sourceid/DrugBank/{ids}/cids/JSON", ids, ("InformationList", "Information")):
        db = reg_by_sid.get(i["SID"])
        if db and i.get("CID"):
            cid_of.setdefault(db, i["CID"][0])
    print(f"    {len(cid_of)} matched to PubChem compounds", flush=True)
    cids = sorted({str(c) for c in cid_of.values()})
    props = {p["CID"]: p for p in pubchem_batched("compound/cid/{ids}/property/Title,IsomericSMILES/JSON", cids, ("PropertyTable", "Properties"))}
    syns: Dict[int, List[str]] = {}
    for s_ in pubchem_batched("compound/cid/{ids}/synonyms/JSON", cids, ("InformationList", "Information"), size=50):
        # Short, word-like synonyms only (names and brands, not registry numbers).
        keep = [x for x in s_.get("Synonym", []) if 3 <= len(x) <= 40 and not any(c.isdigit() for c in x[:3]) and "-" not in x[:4]]
        syns[s_["CID"]] = keep[:20]
    with open(dest, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "name", "synonyms", "smiles"])
        for db in ids:
            cid = cid_of.get(db)
            p = props.get(cid, {})
            w.writerow([db, p.get("Title", db), "|".join(syns.get(cid, [])), p.get("SMILES") or p.get("IsomericSMILES") or ""])
    n_smiles = sum(1 for db in ids if props.get(cid_of.get(db), {}).get("SMILES") or props.get(cid_of.get(db), {}).get("IsomericSMILES"))
    print(f"    {len(ids)} drugs: {len(cid_of)} found on PubChem, {n_smiles} with structures -> {dest.name}")


def iter_results(stream: io.TextIOBase) -> Iterator[dict]:
    """Streams the records of an openFDA {"meta":..., "results":[...]} file without loading it all."""
    dec = json.JSONDecoder()
    buf, pos = "", 0
    while True:  # find the results array
        chunk = stream.read(1 << 20)
        if not chunk:
            return
        buf += chunk
        i = buf.find('"results"')
        if i >= 0 and buf.find("[", i) >= 0:
            pos = buf.find("[", i) + 1
            break
        buf = buf[-32:]
    while True:
        while pos < len(buf) and buf[pos] in " \n\r\t,":
            pos += 1
        if pos < len(buf) and buf[pos] == "]":
            return
        try:
            obj, end = dec.raw_decode(buf, pos)
            yield obj
            pos = end
        except json.JSONDecodeError:
            chunk = stream.read(1 << 22)
            if not chunk:
                return
            buf, pos = buf[pos:] + chunk, 0


def fetch_fda_labels(n_files: int | None) -> None:
    with urllib.request.urlopen(urllib.request.Request(FDA_INDEX, headers=UA), timeout=60) as r:
        parts = json.load(r)["results"]["drug"]["label"]["partitions"]
    parts = parts[:n_files] if n_files else parts
    print(f"  openFDA labels: {len(parts)} file(s), {sum(float(p['size_mb']) for p in parts):.0f} MB to download (kept: pregnancy sections only)")
    for p in parts:
        name = Path(p["file"]).name.replace(".json.zip", "")
        out = OUT / f"openfda_{name}.json"
        if out.exists():
            print(f"    {out.name}: already done")
            continue
        zpath = fetch(p["file"], OUT / Path(p["file"]).name, name)
        kept = []
        with zipfile.ZipFile(zpath) as z:
            member = z.namelist()[0]
            with z.open(member) as raw:
                for rec in iter_results(io.TextIOWrapper(raw, encoding="utf-8")):
                    if not any(rec.get(k) for k in LABEL_FIELDS):
                        continue
                    ofda = rec.get("openfda", {})
                    kept.append({
                        "openfda": {k: ofda.get(k, []) for k in ("generic_name", "substance_name", "brand_name")},
                        **{k: [" ".join(rec[k])[:3000]] for k in LABEL_FIELDS if rec.get(k)},
                    })
        out.write_text(json.dumps({"results": kept}))
        zpath.unlink()
        print(f"    {out.name}: {len(kept)} labels with pregnancy sections ({out.stat().st_size / 1e6:.1f} MB)")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--biosnap", type=Path, help="use this ChCh-Miner .tsv(.gz) instead of downloading it")
    ap.add_argument("--no-biosnap", action="store_true")
    ap.add_argument("--tdc", choices=["drugbank", "twosides", "both"], help="also fetch TDC interaction sets")
    ap.add_argument("--fda-files", type=int, default=None, help="only the first N openFDA label files")
    ap.add_argument("--no-labels", action="store_true")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    print(f"Saving to {OUT}")

    if not args.no_biosnap:
        dest = OUT / "ChCh-Miner_durgbank-chem-chem.tsv.gz"
        if args.biosnap:
            if args.biosnap.resolve() != dest.resolve():
                shutil.copy(args.biosnap, dest)
            print(f"  BIOSNAP: using {args.biosnap}")
        else:
            fetch(BIOSNAP_URL, dest, "BIOSNAP interactions")
    if args.tdc:
        for key in (["drugbank", "twosides"] if args.tdc == "both" else [args.tdc]):
            fid, fname = TDC_FILES[key]
            fetch(f"https://dataverse.harvard.edu/api/access/datafile/{fid}", OUT / fname, f"TDC {key}")
    if not args.no_labels:
        fetch_fda_labels(args.fda_files)
    build_drug_table(OUT / "drugs.csv")
    print("\nDone. Next:\n  python benchmark.py --data data/real --name real\n  python export.py --data data/real --benchmark results/real.json")
    if args.tdc:
        print("  (several interaction files are in data/real: choose one with --pairs data/real/<file>)")


if __name__ == "__main__":
    sys.exit(main())
