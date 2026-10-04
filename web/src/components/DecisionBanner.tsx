import type { Replay } from '../types'

interface Props {
  replay: Replay
  k: number
  prior: 'complete' | 'stale'
  detector: boolean
}

export default function DecisionBanner({ replay, k, prior, detector }: Props) {
  const d = replay.decision
  const last = k === replay.frames.length - 1
  const key = `${prior}_${detector ? 'nn' : 'baseline'}`
  const abort = d.abort[key]
  const p = d.p_hazard[key]
  if (!last) {
    const f = replay.frames[k]
    return (
      <div className="banner pending">
        <div className="banner-main">DESCENDING</div>
        <div className="muted">{f.alt.toFixed(1)} m · decision at about 5 m</div>
      </div>
    )
  }
  if (abort === undefined) {
    return (
      <div className="banner pending">
        <div className="banner-main">NO DATA</div>
        <div className="muted">this replay has no {detector ? 'detector' : 'baseline'} verdict</div>
      </div>
    )
  }
  const verdict = abort ? 'BACK AWAY' : 'TOUCH DOWN'
  const outcome = abort
    ? d.unsafe_contact
      ? 'Correct: contact would have hit a hazard.'
      : 'Cautious: contact would have been safe.'
    : d.unsafe_contact
      ? 'Missed: the spacecraft touched down on a hazard.'
      : 'Safe touchdown.'
  const good = abort ? d.unsafe_contact : !d.unsafe_contact
  return (
    <div className={`banner ${abort ? 'abort' : 'land'}`}>
      <div className="banner-main">{verdict}</div>
      <div className="banner-sub">
        <span>Hazard probability at predicted contact: <b>{(p * 100).toFixed(0)}%</b></span>
        <span className={good ? 'ok' : 'bad'}>{outcome}</span>
        <span className="muted">
          landed {d.delivery_error_m.toFixed(2)} m from target · prediction off by {(d.pred_vs_actual_m * 100).toFixed(0)} cm
        </span>
      </div>
    </div>
  )
}
