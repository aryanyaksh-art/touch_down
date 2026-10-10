import type { Star, View } from './model'
import { outcomeOf, viewKey } from './model'

export interface TourStep {
  seed: number
  view: View
  title: string
  text: string
}

const COMPLETE: View = { prior: 'complete', detector: false }
const STALE: View = { prior: 'stale', detector: false }

function pick(stars: Star[], test: (s: Star) => boolean): Star | undefined {
  const matches = stars.filter(test)
  // prefer a landing that has a full camera replay, then one near the middle of the error distribution
  matches.sort((a, b) => Number(!!b.replayId) - Number(!!a.replayId) || Math.abs(a.rank - 0.45) - Math.abs(b.rank - 0.45))
  return matches[0]
}

/** Three landings picked from the actual data, so the tour never describes something that did not happen. */
export function buildTour(stars: Star[]): TourStep[] {
  const steps: TourStep[] = []
  const ck = viewKey(COMPLETE)
  const sk = viewKey(STALE)

  const clean = pick(stars, (s) => outcomeOf(s.point, ck) === 'clean')
  if (clean) {
    steps.push({
      seed: clean.seed,
      view: COMPLETE,
      title: 'A clean touchdown',
      text: 'The camera matches landmarks on the ground, the filter keeps the position error small, and at about 5 m the hazard check says go. The spacecraft touches down on safe ground.',
    })
  }

  const wave = pick(stars, (s) => outcomeOf(s.point, ck) === 'backaway' && s.point.unsafe_contact)
  if (wave) {
    steps.push({
      seed: wave.seed,
      view: COMPLETE,
      title: 'Backing away for a reason',
      text: 'At about 5 m the spacecraft predicts where it will touch. That spot is on a hazard, so it waves off. This is the behaviour the real OSIRIS-REx was built for.',
    })
  }

  const miss = pick(stars, (s) => outcomeOf(s.point, sk) === 'hazard')
  if (miss) {
    const caught = miss.point.abort['stale_nn']
    steps.push({
      seed: miss.seed,
      view: STALE,
      title: 'When the map is out of date',
      text: `The ground map is missing small boulders, so the check says go and the spacecraft touches down on a hazard. ${
        caught === undefined
          ? 'Detector results are not available for this landing.'
          : caught
            ? 'With the neural detector on, the spacecraft sees the boulder in its own images and backs away. The detector is an addition; the real spacecraft had none.'
            : 'The neural detector does not catch this one either.'
      }`,
    })
  } else {
    const careful = pick(stars, (s) => outcomeOf(s.point, ck) === 'backaway' && !s.point.unsafe_contact)
    if (careful) {
      steps.push({
        seed: careful.seed,
        view: COMPLETE,
        title: 'A cautious wave-off',
        text: 'The check predicted a risky contact and the spacecraft backed away, although touching down would have been safe. Being cautious costs a retry, not the mission.',
      })
    }
  }
  return steps
}
