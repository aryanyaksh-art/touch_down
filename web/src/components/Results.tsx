import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useInView } from 'motion/react'
import { Info } from '@phosphor-icons/react'
import CountText from './CountText'
import StartAlt from './StartAlt'
import type { LandingPoint, Summary } from '../types'

// Four plain-English tiles. Numbers count up and each tile has a small animation that plays when it arrives.
// Precise figures (intervals, percentiles) sit behind the small "i" button.

const BINS = 12
const BIN_MAX_M = 2

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}

function Tile({ value, line, info, go, children }: { value: string; line: string; info: ReactNode; go: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [open])
  return (
    <div className={go ? 'tile go' : 'tile'} ref={ref}>
      <div className="tile-value">
        <CountText value={value} />
      </div>
      <p className="tile-line">{line}</p>
      <div className="tile-mini">{children}</div>
      <button type="button" className="tile-info" aria-label="The precise numbers" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Info size={18} />
      </button>
      {open && <div className="tile-pop" role="note">{info}</div>}
    </div>
  )
}

function MiniBars({ points }: { points: LandingPoint[] }) {
  const bins = new Array(BINS).fill(0)
  for (const p of points) bins[Math.min(BINS - 1, Math.floor((p.delivery_error_m / BIN_MAX_M) * BINS))]++
  const top = Math.max(...bins, 1)
  const w = 200
  return (
    <svg viewBox={`0 0 ${w} 64`} className="mini" role="img" aria-label="How far landings ended from the aim point, as bars">
      {bins.map((v, i) => {
        const h = (v / top) * 54
        return <rect key={i} className="a bar-grow" style={{ animationDelay: `${i * 0.05}s` }} x={4 + i * 16} y={60 - h} width={12} height={h} rx={2} fill="var(--amber)" />
      })}
      <line x1={4 + (1 / BIN_MAX_M) * BINS * 16} x2={4 + (1 / BIN_MAX_M) * BINS * 16} y1={2} y2={60} stroke="var(--ink)" strokeWidth={1} strokeDasharray="3 3" />
    </svg>
  )
}

function MiniRing({ frac }: { frac: number }) {
  return (
    <svg viewBox="0 0 64 64" className="mini ring-mini" role="img" aria-label="A ring filled to the share of landings within a metre">
      <circle cx={32} cy={32} r={24} fill="none" stroke="var(--line)" strokeWidth={6} />
      <circle
        className="a ring-fill"
        cx={32}
        cy={32}
        r={24}
        fill="none"
        stroke="var(--hot-star)"
        strokeWidth={6}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={`${frac} 1`}
        transform="rotate(-90 32 32)"
      />
    </svg>
  )
}

function MiniGuess() {
  return (
    <svg viewBox="0 0 200 64" className="mini" role="img" aria-label="A guessed touchdown spot and the real one, very close together">
      <circle cx={100} cy={32} r={16} fill="none" stroke="var(--dim)" strokeWidth={2} strokeDasharray="4 4" />
      <circle className="a slide-near" cx={100} cy={32} r={6} fill="var(--amber)" />
    </svg>
  )
}

function MiniDots({ k }: { k: number }) {
  const dots = []
  for (let i = 0; i < 100; i++) {
    const lit = i < k
    dots.push(
      <circle
        key={i}
        className={lit ? 'a dot-on' : undefined}
        style={lit ? { animationDelay: `${i * 0.012}s` } : undefined}
        cx={6 + (i % 25) * 8}
        cy={8 + Math.floor(i / 25) * 12}
        r={2.8}
        fill={lit ? 'var(--amber)' : 'var(--line)'}
      />,
    )
  }
  return (
    <svg viewBox="0 0 204 56" className="mini" role="img" aria-label={`${k} of 100 dots lit`}>
      {dots}
    </svg>
  )
}

export default function Results({ summary, points, sample }: { summary: Summary | null; points: LandingPoint[]; sample: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const go = useInView(ref, { once: true, amount: 0.4 })
  const n = points.length
  const errs = points.map((p) => p.delivery_error_m)
  const d = summary?.delivery_error_m
  const med = d?.median ?? median(errs)
  const within = d?.within_1m.rate ?? (n ? errs.filter((e) => e <= 1).length / n : 0)
  const back = summary?.scenarios.complete_baseline.abort.rate ?? (n ? points.filter((p) => p.abort['complete_baseline']).length / n : 0)
  const pred = summary?.pred_vs_actual_cm.median ?? null
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`

  return (
    <section className="block results" id="results">
      <h2>How the landings turned out</h2>
      <p className="lede">
        Based on {n.toLocaleString()} simulated landings{sample ? ' (sample data for now)' : ''}. Tap the i on a tile for the precise numbers.
      </p>
      <div className="tiles" ref={ref}>
        <Tile
          go={go}
          value={`${Math.round(med * 100)} cm`}
          line="A typical landing ends this far from the spot it aimed at."
          info={
            <>
              Median delivery error {med.toFixed(2)} m
              {d?.median_ci95 ? ` (95% interval ${d.median_ci95[0].toFixed(2)} to ${d.median_ci95[1].toFixed(2)} m)` : ''}.
              {d ? ` 95th percentile ${d.p95.toFixed(2)} m, worst ${d.max.toFixed(2)} m.` : ''} Bars show landings by miss distance from 0 to 2 m; the dashed line is 1 m.
            </>
          }
        >
          <MiniBars points={points} />
        </Tile>
        <Tile
          go={go}
          value={`${Math.round(within * 10)} in 10`}
          line="land within one metre of the spot."
          info={
            <>
              {pct(within)} of landings ended within 1 m
              {d ? ` (${d.within_1m.k} of ${d.within_1m.n}, 95% interval ${pct(d.within_1m.ci95[0])} to ${pct(d.within_1m.ci95[1])})` : ''}.
            </>
          }
        >
          <MiniRing frac={within} />
        </Tile>
        <Tile
          go={go}
          value={pred === null ? 'not yet' : `${pred.toFixed(1)} cm`}
          line="Its guess of where it will touch down is off by only this much."
          info={
            <>
              {pred === null
                ? 'Needs the full run summary, which is not published yet.'
                : `Median gap between the touchdown point predicted at 5 m and the real one: ${pred.toFixed(1)} cm (95th percentile ${summary?.pred_vs_actual_cm.p95.toFixed(1)} cm).`}
            </>
          }
        >
          <MiniGuess />
        </Tile>
        <Tile
          go={go}
          value={`${Math.round(back * 100)} in 100`}
          line="approaches end with the probe backing away."
          info={
            <>
              Back-away rate {pct(back)} with the faithful baseline (complete ground map, no neural detector).
              {summary ? ` With a stale map: ${pct(summary.scenarios.stale_baseline.abort.rate)}.` : ''}
              {summary?.scenarios.stale_nn ? ` Stale map plus the neural detector: ${pct(summary.scenarios.stale_nn.abort.rate)}.` : ''}
            </>
          }
        >
          <MiniDots k={Math.round(back * 100)} />
        </Tile>
      </div>
      <StartAlt />
    </section>
  )
}
