import type { IndexEntry, LandingPoint } from '../types'

// One star per simulated landing. Where it sits depends on what happened at the 5 m decision:
//   clean     the spacecraft touched down on safe ground
//   backaway  the spacecraft waved off (whether or not contact would have been unsafe)
//   hazard    the spacecraft touched down on a hazard (a miss of the safety check)
export type Outcome = 'clean' | 'backaway' | 'hazard'

export interface View {
  prior: 'complete' | 'stale'
  detector: boolean
}

/** Landings are numbered 1 to N on the page; seeds inside the code start at 0. */
export const landingNo = (seed: number) => seed + 1

export const viewKey = (v: View) => `${v.prior}_${v.detector ? 'nn' : 'baseline'}`

export function outcomeOf(p: LandingPoint, key: string): Outcome {
  const abort = p.abort[key] ?? p.abort['complete_baseline'] ?? false
  if (abort) return 'backaway'
  return p.unsafe_contact ? 'hazard' : 'clean'
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  clean: 'Touched down safely',
  backaway: 'Backed away',
  hazard: 'Touched down on a hazard',
}

// Real stellar colours, hot to cool. Hazard stars are the only orange-red on the page.
export const STAR_COLORS = ['#9db4ff', '#bcd0ff', '#dfe6ff', '#dfe6ff', '#fff1d6', '#fff1d6', '#ffd9a0', '#ffc98a']
export const HAZARD_COLOR = '#ff5a36'

// Arm phase (radians) for each outcome. Three arms of a spiral, 120 degrees apart.
const ARM_PHASE: Record<Outcome, number> = { clean: 0.2, backaway: 0.2 + (2 * Math.PI) / 3, hazard: 0.2 + (4 * Math.PI) / 3 }
export const ARM_TWIST = 4.4
export const ARM_ORDER: Outcome[] = ['clean', 'backaway', 'hazard']
export const armPhase = (o: Outcome) => ARM_PHASE[o]

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function gauss(rng: () => number) {
  let u = 0
  let v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export interface Star {
  seed: number
  point: LandingPoint
  err: number
  color: string
  size: number
  phase: number
  speed: number
  rank: number // 0 = smallest delivery error, 1 = largest
  jitter: number
  replayId: string | null
  /** outcome per view, filled by layoutStars */
  outcome: Outcome
  /** position in the galaxy plane (units of galaxy radius) */
  tx: number
  ty: number
}

export function buildStars(points: LandingPoint[], index: IndexEntry[]): Star[] {
  const byseed = new Map(index.map((e) => [e.seed, e.id]))
  const order = [...points].sort((a, b) => a.delivery_error_m - b.delivery_error_m)
  const rank = new Map(order.map((p, i) => [p.seed, order.length > 1 ? i / (order.length - 1) : 0]))
  return points.map((p) => {
    const rng = mulberry32(p.seed * 2654435761)
    const color = STAR_COLORS[Math.floor(rng() * STAR_COLORS.length)]
    return {
      seed: p.seed,
      point: p,
      err: p.delivery_error_m,
      color,
      size: 1.1 + rng() * 1.5,
      phase: rng() * Math.PI * 2,
      speed: 0.5 + rng() * 1.3,
      rank: rank.get(p.seed) ?? 0,
      jitter: gauss(rng),
      replayId: byseed.get(p.seed) ?? null,
      outcome: 'clean' as Outcome,
      tx: 0,
      ty: 0,
    }
  })
}

/** Place every star on its outcome's spiral arm. Distance from the core is the delivery error rank. */
export function layoutStars(stars: Star[], key: string) {
  for (const s of stars) {
    s.outcome = outcomeOf(s.point, key)
    const r = 0.1 + 0.88 * Math.pow(s.rank, 0.85)
    const spread = 0.17 / (0.35 + r)
    const th = armPhase(s.outcome) + ARM_TWIST * r + s.jitter * spread * 0.7
    const rr = r + s.jitter * 0.012
    s.tx = Math.cos(th) * rr
    s.ty = Math.sin(th) * rr
  }
}

/** Sample data used until the real 1,000 landings are published. Clearly labelled in the UI. */
export function demoLandings(n = 1000): LandingPoint[] {
  const rng = mulberry32(20201020)
  const out: LandingPoint[] = []
  for (let i = 0; i < n; i++) {
    const err = Math.exp(Math.log(0.42) + 0.75 * gauss(rng))
    const ang = rng() * Math.PI * 2
    const hazardNear = rng() < 0.17
    const wouldHit = rng() < 0.07
    const missedByStale = wouldHit && rng() < 0.6
    out.push({
      seed: i,
      delivery_error_m: err,
      unsafe_contact: wouldHit,
      contact_true: [err * Math.cos(ang), err * Math.sin(ang)],
      abort: {
        complete_baseline: wouldHit ? rng() < 0.9 : hazardNear && rng() < 0.2,
        stale_baseline: wouldHit ? !missedByStale && rng() < 0.9 : hazardNear && rng() < 0.15,
        complete_nn: wouldHit ? rng() < 0.97 : hazardNear && rng() < 0.4,
        stale_nn: wouldHit ? rng() < 0.93 : hazardNear && rng() < 0.4,
      },
    })
  }
  return out
}
