import type { Replay } from '../types'

interface Props {
  replay: Replay
  k: number
  setK: (k: number) => void
  playing: boolean
  setPlaying: (p: boolean) => void
}

function Spark({ xs, ys, k, label, unit, fmt }: { xs: number[]; ys: number[]; k: number; label: string; unit: string; fmt: (v: number) => string }) {
  const w = 220
  const h = 56
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const y1 = Math.max(...ys) * 1.1 || 1
  const px = (x: number) => 4 + ((x - x0) / (x1 - x0 || 1)) * (w - 8)
  const py = (y: number) => h - 4 - (y / y1) * (h - 8)
  const pts = xs.map((x, i) => `${px(x)},${py(ys[i])}`).join(' ')
  return (
    <div className="spark">
      <div className="spark-head">
        <span className="muted">{label}</span>
        <b>{fmt(ys[k])} <span className="muted">{unit}</span></b>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <polyline points={pts} className="spark-line" />
        <circle cx={px(xs[k])} cy={py(ys[k])} r={3} className="spark-dot" />
      </svg>
    </div>
  )
}

export default function Timeline({ replay, k, setK, playing, setPlaying }: Props) {
  const n = replay.frames.length
  const t = replay.frames.map((f) => f.t)
  return (
    <div className="panel timeline">
      <div className="controls">
        <button onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <button onClick={() => { setPlaying(false); setK(Math.max(0, k - 1)) }} aria-label="Previous frame">‹</button>
        <input
          type="range"
          min={0}
          max={n - 1}
          value={k}
          onChange={(e) => { setPlaying(false); setK(Number(e.target.value)) }}
          aria-label="Frame"
        />
        <button onClick={() => { setPlaying(false); setK(Math.min(n - 1, k + 1)) }} aria-label="Next frame">›</button>
      </div>
      <div className="sparks">
        <Spark xs={t} ys={replay.frames.map((f) => f.alt)} k={k} label="Altitude" unit="m" fmt={(v) => v.toFixed(1)} />
        <Spark xs={t} ys={replay.frames.map((f) => f.err * 100)} k={k} label="Position error" unit="cm" fmt={(v) => v.toFixed(0)} />
        <Spark xs={t} ys={replay.frames.map((f) => f.used)} k={k} label="Landmarks matched" unit="" fmt={(v) => v.toFixed(0)} />
      </div>
      {replay.matchpoint_t != null && (
        <div className="muted small">
          Matchpoint-style burn at T+{replay.matchpoint_t.toFixed(0)} s ({((replay.burn_dv ?? 0) * 1000).toFixed(1)} mm/s)
        </div>
      )}
    </div>
  )
}
