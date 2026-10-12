import { useEffect, useRef, useState } from 'react'
import { useInView } from 'motion/react'
import { Info } from '@phosphor-icons/react'
import CountText from './CountText'
import { START_ALT } from '../lib/startAlt'

// "Where the descent starts": two small bar panels under the result tiles. The bars grow in when they scroll into
// view and the numbers count up; with reduced motion they fade instead. Precise figures sit behind the "i" button.

const SCALE_M = 1 // a full bar is 100 cm
const cm = (m: number) => `${Math.round(m * 100)} cm`

type Row = { label: string; m: number; tone: 'old' | 'new' }

function Panel({ title, rows, start }: { title: string; rows: Row[]; start: number }) {
  return (
    <div className="sa-panel">
      <h4>{title}</h4>
      {rows.map((r, i) => (
        <div className="sa-row" key={r.label}>
          <span className="sa-label">{r.label}</span>
          <span className="sa-track" role="img" aria-label={`${r.label}: median miss ${cm(r.m)}`}>
            <span
              className={`a sa-bar ${r.tone}`}
              style={{ width: `${Math.min(r.m / SCALE_M, 1) * 100}%`, animationDelay: `${(start + i) * 0.12}s` }}
            />
          </span>
          <span className="sa-val">
            <CountText value={cm(r.m)} />
          </span>
        </div>
      ))}
    </div>
  )
}

export default function StartAlt() {
  const ref = useRef<HTMLDivElement>(null)
  const go = useInView(ref, { once: true, amount: 0.35 })
  const [open, setOpen] = useState(false)
  const pop = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onDown = (e: PointerEvent) => !pop.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  const { paired, burn } = START_ALT
  const f = (m: number) => m.toFixed(2)

  return (
    <div className={go ? 'startalt go' : 'startalt'} ref={ref}>
      <div ref={pop}>
        <h3>Where the descent starts changes the answer</h3>
        <p className="lede">The real probe begins its approach at 125 m. The big run began at 45 m, where the engine burn is tiny and hid some of the error.</p>
        <button type="button" className="tile-info" aria-label="The precise numbers" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Info size={18} />
        </button>
        {open && (
          <div className="tile-pop sa-pop" role="note">
            Median miss distance. Left: the same {paired.seeds} landings flown from 45 m ({f(paired.from45_m)} m) and from 125 m ({f(paired.from125_m)} m); paired
            difference +{f(paired.diff_m)} m (95% interval +{f(paired.diff_ci95_m[0])} to +{f(paired.diff_ci95_m[1])} m). Right: from 125 m with the assumed burn errors scaled, {burn.seeds} landings each:{' '}
            {burn.rows.map((r, i) => `${r.label.toLowerCase()} ${f(r.median_m)} m (${f(r.ci95_m[0])} to ${f(r.ci95_m[1])}, ${r.within1m} of ${burn.seeds} within 1 m)${i < burn.rows.length - 1 ? '; ' : '.'}`)}{' '}
            The burn errors are assumptions, not mission values, and the terrain outside the 5 cm tile is partly synthetic.{' '}
            <a href="https://github.com/aryanyaksh-art/touch_down/blob/main/docs/descent_extension.md" target="_blank" rel="noreferrer">Details</a>
          </div>
        )}
      </div>
      <div className="sa-grid">
        <Panel
          title={`Same ${paired.seeds} landings, two starting heights`}
          start={0}
          rows={[
            { label: 'From 45 m', m: paired.from45_m, tone: 'old' },
            { label: 'From 125 m', m: paired.from125_m, tone: 'new' },
          ]}
        />
        <Panel
          title="From 125 m, with different engine-burn errors"
          start={2}
          rows={burn.rows.map((r) => ({ label: r.label, m: r.median_m, tone: 'new' as const }))}
        />
      </div>
      <p className="sa-foot">Even with perfect burns the median miss is about {Math.round(burn.rows[0].median_m * 10) * 10} cm.</p>
    </div>
  )
}
