"""Detector false-alarm ablation: how much of the detector's cost (needless back-aways) can be removed without losing
the hazards it prevents?

Input: Monte Carlo landing files flown with `--nn-ablation` (each carries `nn_variants`, the same flight judged under
several evidence rules, see `touchdown.sim.landing.NN_ABLATION`). Because every variant uses the same frames, all
comparisons are paired. The reference rows are the baseline without a detector and the shipped rule `L0`.

Usage: python -m touchdown.analysis.ablation DIR [--out ablation.json]
"""
import argparse
import json
from pathlib import Path

import numpy as np

from touchdown.analysis.compare_published import detector_effect, load_results

PRIORS = ("complete", "stale")


def _paired(R: list[dict], variant: str) -> list[dict]:
    """Results shaped like the main Monte Carlo ones, with this variant standing in as the `_nn` verdict."""
    out = []
    for r in R:
        v = r.get("nn_variants", {}).get(variant)
        if v is None:
            continue
        out.append({
            "unsafe_contact": r["unsafe_contact"],
            "abort": {
                "complete_baseline": r["abort"]["complete_baseline"], "stale_baseline": r["abort"]["stale_baseline"],
                "complete_nn": v["abort"]["complete"], "stale_nn": v["abort"]["stale"],
            },
        })
    return out


def summarize(R: list[dict], n_boot: int = 1000) -> dict:
    R = [r for r in R if "nn_variants" in r]
    if not R:
        return {"n": 0, "variants": {}}
    names = list(R[0]["nn_variants"])
    out: dict = {"n": len(R), "variants": {}}
    for name in names:
        P = _paired(R, name)
        row: dict = {"flagged_cells_median": float(np.median([r["nn_variants"][name]["flagged_cells"] for r in R if name in r["nn_variants"]]))}
        for prior in PRIORS:
            e = detector_effect(P, prior, n_boot=n_boot)
            if e is None:
                continue
            n = e["n"]
            row[prior] = {
                "hazard_contacts_baseline": e["hazard_contacts_baseline"], "hazard_contacts": e["hazard_contacts_with_detector"],
                "needless_baseline": e["needless_baseline"], "needless": e["needless_with_detector"],
                "avoided": e["avoided"], "introduced": e["introduced"], "mcnemar_p": e["mcnemar_p"],
                "needless_rate": e["needless_with_detector"] / n,
                "extra_needless_per_hazard_avoided": e["extra_needless_per_hazard_avoided"],
                "extra_needless_per_hazard_avoided_ci95": e["extra_needless_per_hazard_avoided_ci95"],
            }
        out["variants"][name] = row
    return out


def markdown(s: dict) -> str:
    if not s["n"]:
        return "No landings with ablation variants.\n"
    lines = [f"Detector false-alarm ablation, {s['n']} landings, paired on the same flights.\n"]
    for prior in PRIORS:
        lines.append(f"\n**{prior.capitalize()} ground map**\n")
        lines.append("| Rule | Hazard contacts | Needless back-aways | Hazards avoided | Extra needless per hazard avoided | McNemar p |")
        lines.append("|---|---|---|---|---|---|")
        first = next((v[prior] for v in s["variants"].values() if prior in v), None)
        if first:
            lines.append(f"| no detector | {first['hazard_contacts_baseline']} | {first['needless_baseline']} | | | |")
        for name, v in s["variants"].items():
            if prior not in v:
                continue
            e = v[prior]
            r = e["extra_needless_per_hazard_avoided"]
            ci = e["extra_needless_per_hazard_avoided_ci95"]
            rt = "n/a" if r is None else f"{r:.1f}" + (f" ({ci[0]:.1f} to {ci[1]:.1f})" if ci else "")
            lines.append(f"| {name} | {e['hazard_contacts']} | {e['needless']} | {e['avoided'] - e['introduced']} | {rt} | "
                         f"{'<0.001' if e['mcnemar_p'] < 0.001 else format(e['mcnemar_p'], '.3f')} |")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("dir")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    s = summarize(load_results(a.dir))
    print(markdown(s))
    if a.out:
        json.dump(s, open(a.out, "w"), indent=1)
        Path(a.out).with_suffix(".md").write_text(markdown(s), encoding="utf-8")
