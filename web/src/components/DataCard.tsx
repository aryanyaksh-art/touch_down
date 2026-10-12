import type { CSSProperties } from 'react'
import type { Star } from '../lib/model'
import CountText from './CountText'
import PictureView from './PictureView'

const KEYS: { key: string; label: string }[] = [
  { key: 'complete_baseline', label: 'Complete map, baseline' },
  { key: 'stale_baseline', label: 'Stale map, baseline' },
  { key: 'complete_nn', label: 'Complete map, + detector' },
  { key: 'stale_nn', label: 'Stale map, + detector' },
]

function verdict(star: Star, key: string) {
  const abort = star.point.abort[key]
  if (abort === undefined) return { text: 'not run', tone: 'dim' }
  const unsafe = star.point.unsafe_contact
  if (abort) return { text: unsafe ? 'Backed away. Contact would have hit a hazard.' : 'Backed away. Contact would have been safe.', tone: unsafe ? 'good' : 'warn' }
  return { text: unsafe ? 'Touched down on a hazard.' : 'Touched down safely.', tone: unsafe ? 'bad' : 'good' }
}

/** A ruler from the aim point out to 3 m with the landing marked on it. Only the distance is known, so no direction is drawn. */
function Ruler({ err }: { err: number }) {
  const max = 3
  const w = 560
  const x = (v: number) => 20 + (Math.min(v, max) / max) * (w - 40)
  const off = err > max // past the end of the ruler: say so instead of pretending the dot is at 3 m
  return (
    <svg viewBox={`0 0 ${w} 74`} className="ruler" role="img" aria-label={`The landing ended ${err.toFixed(2)} metres from the aim point`}>
      <line x1={20} x2={w - 20} y1={34} y2={34} className="axis" />
      {[0, 1, 2, 3].map((m) => (
        <g key={m}>
          <line x1={x(m)} x2={x(m)} y1={28} y2={40} className="axis" />
          <text x={x(m)} y={58} textAnchor="middle" className="ring-label">{m} m</text>
        </g>
      ))}
      <line x1={x(1)} x2={x(1)} y1={10} y2={34} className="one-m" />
      <text x={x(1) + 6} y={16} className="ring-label">1 m, the published figure</text>
      {off && <text x={x(max)} y={16} textAnchor="end" className="ring-label">{err.toFixed(1)} m, off the scale</text>}
      <circle cx={x(err)} cy={34} r={6} className={off ? 'ruler-dot off' : 'ruler-dot'} style={{ '--dx': `${x(0) - x(err)}px` } as CSSProperties} />
    </svg>
  )
}

export default function DataCard({ star, picture, detector }: { star: Star; picture: boolean; detector: boolean }) {
  const abortBase = star.point.abort['complete_baseline']
  return (
    <div className="datacard">
      {picture && <PictureView seed={star.seed} detector={detector} />}
      <div className="datacard-nums">
        <div>
          <div className="big"><CountText value={`${star.err.toFixed(2)} m`} duration={0.9} /></div>
          <div className="dim">from the aim point at touchdown</div>
        </div>
        <div>
          <div className="big">{star.point.unsafe_contact ? 'Hazard' : 'Safe'}</div>
          <div className="dim">ground under the contact point</div>
        </div>
        <div>
          <div className="big">{abortBase === undefined ? 'n/a' : abortBase ? 'Back away' : 'Touch down'}</div>
          <div className="dim">decision with the faithful baseline</div>
        </div>
      </div>
      <Ruler err={star.err} />
      <h3>One flight, judged four ways</h3>
      <p className="lede">
        The spacecraft flew once. Each row replays the 5 m decision with a different hazard map, with and without the neural detector.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Setup</th><th>Decision</th></tr>
          </thead>
          <tbody>
            {KEYS.map(({ key, label }) => {
              const v = verdict(star, key)
              return (
                <tr key={key}>
                  <td>{label}</td>
                  <td className={`tone-${v.tone}`}>{v.text}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
