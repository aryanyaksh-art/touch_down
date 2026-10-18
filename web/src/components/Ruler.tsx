import type { CSSProperties } from 'react'

/** A ruler from the aim point out to 3 m with the landing marked on it. Only the distance is known, so no direction is drawn. */
export function Ruler({ err }: { err: number }) {
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
