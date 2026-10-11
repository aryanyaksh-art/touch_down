"""Compare detectors at matched hazard recall (NumPy only; reads `touchdown.vision.evaluate --out` JSON files).

Two detectors cannot be compared fairly at one fixed threshold (a different training run shifts its probabilities), so
this reads each detector's threshold sweep and reports the false-hazard rate (safe pixels called hazard, the cost that
turns into needless back-aways) at the same pixel hazard recall (the benefit). Interpolation is linear between sweep
points; recalls outside a detector's range are reported as n/a.

Run: python -m touchdown.vision.compare NAME=eval.json NAME=eval.json ... [--bins 0-10 m "10-22 m"] [--out compare.md]
"""
import argparse
import json

RECALLS = (0.6, 0.7, 0.8, 0.9)


def false_hazard_at_recall(sweep: list[dict], recall: float) -> float | None:
    """sweep: [{hazard_recall, false_hazard_rate, ...}] over thresholds. Linear interpolation of the false-hazard rate at `recall`."""
    pts = sorted(((s["hazard_recall"], s["false_hazard_rate"]) for s in sweep))
    if not pts or recall < pts[0][0] or recall > pts[-1][0]:
        return None
    for (r0, f0), (r1, f1) in zip(pts, pts[1:]):
        if r0 <= recall <= r1:
            return f0 if r1 == r0 else f0 + (f1 - f0) * (recall - r0) / (r1 - r0)
    return pts[-1][1]


def table(evals: dict[str, dict], bin_name: str, recalls=RECALLS) -> str:
    names = [n for n in evals if bin_name in evals[n]]
    lines = [f"**{bin_name}: false-hazard rate (safe ground called hazard) at matched hazard recall**", "",
             "| Detector | " + " | ".join(f"recall {r:.0%}" for r in recalls) + " | mIoU | boulder IoU |",
             "|---|" + "---|" * (len(recalls) + 2)]
    for n in names:
        b = evals[n][bin_name]
        cells = []
        for r in recalls:
            v = false_hazard_at_recall(b["sweep"], r)
            cells.append("n/a" if v is None else f"{v:.1%}")
        lines.append(f"| {n} | " + " | ".join(cells) + f" | {b['miou']:.2f} | {b['iou']['boulder']:.2f} |")
    return "\n".join(lines)


def markdown(evals: dict[str, dict], bins=("0-10 m", "10-22 m")) -> str:
    return "\n\n".join(table(evals, b) for b in bins if any(b in e for e in evals.values())) + "\n"


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("evals", nargs="+", help="NAME=path/to/eval.json")
    ap.add_argument("--bins", nargs="+", default=["0-10 m", "10-22 m"])
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    evals = {}
    for item in a.evals:
        name, path = item.split("=", 1)
        evals[name] = json.load(open(path))
    md = markdown(evals, tuple(a.bins))
    print(md)
    if a.out:
        open(a.out, "w", encoding="utf-8").write(md)
