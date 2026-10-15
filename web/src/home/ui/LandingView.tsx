import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { X } from '@phosphor-icons/react'
import PictureView from '../../components/PictureView'
import ReplayViewer from '../../components/ReplayViewer'
import CountText from '../../components/CountText'
import { Ruler } from '../../components/DataCard'
import { OUTCOME_LABEL, landingNo, outcomeOf, viewKey, type View } from '../../lib/model'
import type { LandingPoint, Replay, Site } from '../../types'
import '../landing.css'

const EASE_OUT = [0.23, 1, 0.32, 1] as const

const KEYS: { key: string; label: string }[] = [
  { key: 'complete_baseline', label: 'Complete map, baseline' },
  { key: 'stale_baseline', label: 'Stale map, baseline' },
  { key: 'complete_nn', label: 'Complete map, + detector' },
  { key: 'stale_nn', label: 'Stale map, + detector' },
]

function verdict(point: LandingPoint, key: string) {
  const abort = point.abort[key]
  if (abort === undefined) return { text: 'not run', tone: 'dim' }
  const unsafe = point.unsafe_contact
  if (abort) return { text: unsafe ? 'Backed away. Contact would have hit a hazard.' : 'Backed away. Contact would have been safe.', tone: unsafe ? 'good' : 'warn' }
  return { text: unsafe ? 'Touched down on a hazard.' : 'Touched down safely.', tone: unsafe ? 'bad' : 'good' }
}

interface Props {
  point: LandingPoint
  replayId: string | null
  site: Site | null
  hasPicture: boolean
  pictureDetector: boolean
  reduce: boolean
  onClose: () => void
}

/** One landing, full screen over the real night sky: the picture the spacecraft looked at on one side, the decision and numbers on the other. */
export default function LandingView({ point, replayId, site, hasPicture, pictureDetector, reduce, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const [view, setView] = useState<View>({ prior: 'complete', detector: false })
  const [replayTitle, setReplayTitle] = useState<string | null>(null)
  const key = viewKey(view)
  const outcome = outcomeOf(point, key)
  const v = verdict(point, key)
  const baseAbort = point.abort['complete_baseline']
  const hasDetector = point.abort['complete_nn'] !== undefined

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    closeRef.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      prev?.focus?.()
    }
  }, [onClose])

  const asReplay = !!(replayId && site)
  return (
    <motion.div
      className="lv"
      role="dialog"
      aria-modal="true"
      aria-label={`Landing ${landingNo(point.seed)}`}
      initial={reduce ? { opacity: 0 } : { opacity: 0, transform: 'scale(1.015)' }}
      animate={{ opacity: 1, transform: 'scale(1)' }}
      exit={{ opacity: 0, transition: { duration: 0.18, ease: 'easeOut' } }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
    >
      <button ref={closeRef} type="button" className="lv-close" onClick={onClose} aria-label="Close and return to the galaxy">
        <X size={20} />
      </button>
      <div className="lv-scroll">
        <header className="lv-head">
          <h2>{replayTitle ?? `Landing ${landingNo(point.seed)}`}</h2>
          <p>
            {replayTitle ? `Landing ${landingNo(point.seed)}. ` : ''}
            {OUTCOME_LABEL[outcome]}.
          </p>
        </header>
        {asReplay ? (
          <ReplayViewer id={replayId!} site={site!} onLoaded={(r: Replay) => setReplayTitle(r.title)} />
        ) : (
          <div className="lv-grid">
            <div className="lv-left">{hasPicture ? <PictureView seed={point.seed} detector={pictureDetector} /> : <p className="muted">There is no picture for this landing.</p>}</div>
            <div className="lv-right">
              <div className="lv-toggles">
                <span className="seg" role="group" aria-label="Ground hazard map">
                  <button type="button" className={view.prior === 'complete' ? 'on' : ''} onClick={() => setView({ ...view, prior: 'complete' })}>complete map</button>
                  <button type="button" className={view.prior === 'stale' ? 'on' : ''} onClick={() => setView({ ...view, prior: 'stale' })}>stale map</button>
                </span>
                <span className="seg" role="group" aria-label="Neural hazard detector">
                  <button type="button" className={!view.detector ? 'on' : ''} onClick={() => setView({ ...view, detector: false })}>baseline</button>
                  <button type="button" className={view.detector ? 'on' : ''} disabled={!hasDetector} onClick={() => setView({ ...view, detector: true })}>+ detector</button>
                </span>
              </div>
              <div className={`lv-verdict tone-${v.tone}`}>
                <div className="lv-verdict-main">{point.abort[key] === undefined ? 'No data' : point.abort[key] ? 'Back away' : 'Touch down'}</div>
                <div className="lv-verdict-sub">{v.text}</div>
              </div>
              <div className="lv-nums">
                <div>
                  <div className="big"><CountText value={`${point.delivery_error_m.toFixed(2)} m`} duration={0.9} /></div>
                  <div className="dim">from the aim point at touchdown</div>
                </div>
                <div>
                  <div className="big">{point.unsafe_contact ? 'Hazard' : 'Safe'}</div>
                  <div className="dim">ground under the contact point</div>
                </div>
                <div>
                  <div className="big">{baseAbort === undefined ? 'n/a' : baseAbort ? 'Back away' : 'Touch down'}</div>
                  <div className="dim">faithful baseline decision</div>
                </div>
              </div>
              <Ruler err={point.delivery_error_m} />
              <h3>One flight, judged four ways</h3>
              <div className="table-wrap">
                <table>
                  <tbody>
                    {KEYS.map(({ key: k, label }) => {
                      const r = verdict(point, k)
                      return (
                        <tr key={k}>
                          <td>{label}</td>
                          <td className={`tone-${r.tone}`}>{r.text}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}
