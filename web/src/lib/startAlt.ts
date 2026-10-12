// Real results from two separate follow-up experiments, not from landings.json, so they are written down here.
// Source: docs/descent_extension.md ("Paired comparison" and "How much of the delivery error is the assumed burn error?"),
// Kaggle notebooks 16 and 17, computed with scripts/compare_start_alt.py. Medians of the miss distance (delivery error), metres.
// Only change these if those experiments are re-run.

export const START_ALT = {
  // the same seeds 0 to 149 flown from 45 m and from the real Checkpoint height of 125 m
  paired: {
    seeds: 150,
    from45_m: 0.392,
    from125_m: 0.675,
    diff_m: 0.281,
    diff_ci95_m: [0.108, 0.347] as [number, number],
  },
  // from 125 m, seeds 0 to 49, with the assumed engine-burn errors scaled by 0, 1 and 2
  burn: {
    seeds: 50,
    rows: [
      { label: 'Perfect burns', median_m: 0.497, ci95_m: [0.418, 0.633] as [number, number], within1m: 48 },
      { label: 'As assumed', median_m: 0.676, ci95_m: [0.509, 0.861] as [number, number], within1m: 41 },
      { label: 'Errors doubled', median_m: 0.851, ci95_m: [0.641, 1.048] as [number, number], within1m: 29 },
    ],
  },
}
