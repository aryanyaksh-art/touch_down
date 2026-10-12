// DEV ONLY (break-ui skill). Open the dev server with ?data=worst | empty | one | huge to swap the real data for
// plausible worst cases at the loading boundary (data.ts), without touching any component. Never bundled in production:
// data.ts imports this behind `import.meta.env.DEV`.
//
//   worst  extreme but possible tails (a 12.7 m miss, a 0 m miss, the real 3.93 m maximum, 40 identical errors),
//          landings with no verdicts or no contact point, replay titles and blurbs several times longer than the
//          real ones, a summary with no intervals and no detector rows, and replays with no hazard probabilities
//   empty  nothing at all (the page falls back to its labelled sample data)
//   one    a single landing and a single replay with a single frame
//   huge   5,000 landings, to look at galaxy performance
//   broken every replay has one frame with its fields missing (exercises the error boundary)

export type Fixture = 'worst' | 'empty' | 'one' | 'huge' | 'broken'

export function currentFixture(): Fixture | null {
  const v = new URLSearchParams(location.search).get('data')
  return v === 'worst' || v === 'empty' || v === 'one' || v === 'huge' || v === 'broken' ? v : null
}

const LONG_TITLE = 'Detector catches a missed boulder that the old ground map had never shown, in the last five metres of the descent'
const LONG_BLURB =
  'The spacecraft aimed at a spot that was safe on the true map but only just: the nearest rock was 41 cm from the aim point, well inside the sampler head plus the navigation uncertainty. The ground map the spacecraft carries was built before the small boulders were counted, so it showed nothing there. The neural detector looked at the camera frames during the last 22 m and flagged the rock, which is why the decision at 5 m was to back away instead of touching down.'

/* eslint-disable @typescript-eslint/no-explicit-any */
export function applyFixture(path: string, json: any, fx: Fixture): any {
  if (path === 'landings.json' && Array.isArray(json)) {
    if (fx === 'empty') return []
    if (fx === 'one') return json.slice(0, 1)
    if (fx === 'huge') {
      const n = json.length
      return Array.from({ length: 5000 }, (_, i) => ({ ...json[i % n], seed: i, delivery_error_m: json[i % n].delivery_error_m * (1 + Math.floor(i / n) * 0.03) }))
    }
    const out = json.map((p: any) => ({ ...p }))
    out[0].delivery_error_m = 12.7 // a burn that went badly wrong: far past the 3 m ruler and the 2 m histogram
    out[1].delivery_error_m = 0 // a perfect landing
    out[2].delivery_error_m = 3.93 // the real maximum of the 1,000-landing run
    out[3].delivery_error_m = 0.0004
    out[4].abort = {} // a landing with no verdicts at all
    out[5].contact_true = [] // no contact point
    for (let i = 10; i < 50; i++) out[i].delivery_error_m = 0.5 // forty identical errors: ties in the rank that places stars
    return out
  }
  if (path === 'index.json' && Array.isArray(json)) {
    if (fx === 'empty') return []
    if (fx === 'one') return json.slice(0, 1)
    if (fx === 'worst') return json.map((e: any) => ({ ...e, title: LONG_TITLE, blurb: LONG_BLURB }))
  }
  if (path === 'summary.json' && json) {
    if (fx === 'empty') return null
    if (fx === 'worst') {
      const s = JSON.parse(JSON.stringify(json))
      delete s.delivery_error_m.median_ci95
      delete s.delivery_error_m.p95_ci95
      delete s.pred_vs_actual_cm.median_ci95
      delete s.scenarios.stale_nn
      delete s.detector_effect
      return s
    }
  }
  if (path === 'pictures.json' && (fx === 'empty' || fx === 'one')) return { seeds: [], detector: false }
  if (path.startsWith('replays/') && json && Array.isArray(json.frames)) {
    if (fx === 'broken') return { ...json, frames: [{ t: 0 }] }
    if (fx === 'one') return { ...json, frames: json.frames.slice(0, 1) }
    if (fx === 'worst') return { ...json, title: LONG_TITLE, blurb: LONG_BLURB, decision: { ...json.decision, p_hazard: {} } }
  }
  return json
}
