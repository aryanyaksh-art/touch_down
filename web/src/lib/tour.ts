import type { Star, View } from './model'
import { outcomeOf, viewKey } from './model'

export interface Example {
  seed: number
  view: View
}

export interface Examples {
  clean: Example | null
  back: Example | null
  old: Example | null
}

const COMPLETE: View = { prior: 'complete', detector: false }
const STALE: View = { prior: 'stale', detector: false }

function pick(stars: Star[], test: (s: Star) => boolean): Star | undefined {
  const matches = stars.filter(test)
  // prefer a landing that has a full camera replay, then one near the middle of the error distribution
  matches.sort((a, b) => Number(!!b.replayId) - Number(!!a.replayId) || Math.abs(a.rank - 0.45) - Math.abs(b.rank - 0.45))
  return matches[0]
}

/** One real landing for each of the three story scenes, picked from the data so the page never shows something that did not happen. */
export function pickExamples(stars: Star[]): Examples {
  const ck = viewKey(COMPLETE)
  const sk = viewKey(STALE)
  const clean = pick(stars, (s) => outcomeOf(s.point, ck) === 'clean')
  const back = pick(stars, (s) => outcomeOf(s.point, ck) === 'backaway' && s.point.unsafe_contact)
  const old = pick(stars, (s) => outcomeOf(s.point, sk) === 'hazard')
  return {
    clean: clean ? { seed: clean.seed, view: COMPLETE } : null,
    back: back ? { seed: back.seed, view: COMPLETE } : null,
    old: old ? { seed: old.seed, view: STALE } : null,
  }
}
