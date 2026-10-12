import { useEffect, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import CameraView from './CameraView'
import DecisionBanner from './DecisionBanner'
import SiteMap from './SiteMap'
import Timeline from './Timeline'
import { useReplay } from '../data'
import type { Replay, Site } from '../types'

interface Props {
  id: string
  site: Site
  /** called once the replay JSON has loaded, so the overlay header can use its title */
  onLoaded?: (r: Replay) => void
}

export default function ReplayViewer({ id, site, onLoaded }: Props) {
  const reduce = useReducedMotion()
  const { replay, failed } = useReplay(id)
  const [k, setK] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [showLabels, setShowLabels] = useState(true)
  const [showFeatures, setShowFeatures] = useState(true)
  const [prior, setPrior] = useState<'complete' | 'stale'>('complete')
  const [detector, setDetector] = useState(false)

  useEffect(() => {
    setK(0)
    setPlaying(false)
  }, [id])

  useEffect(() => {
    if (replay && onLoaded) onLoaded(replay)
    // start playing after the overlay has unfolded, so the path draws itself while you watch
    if (replay && !reduce) {
      const timer = setTimeout(() => setPlaying(true), 900)
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay, reduce])

  useEffect(() => {
    if (!playing || !replay) return
    const timer = setInterval(() => {
      setK((cur) => {
        if (cur >= replay.frames.length - 1) {
          setPlaying(false)
          return cur
        }
        return cur + 1
      })
    }, 450)
    return () => clearInterval(timer)
  }, [playing, replay])

  if (failed || (replay && replay.frames.length === 0)) return <p className="muted" role="alert">This replay could not be loaded.</p>
  if (!replay) return <p className="muted">Loading the replay.</p>

  const hasDetector = replay.decision.abort['complete_nn'] !== undefined
  const detectorOn = detector && hasDetector

  return (
    <div className="replay">
      <p className="blurb">{replay.blurb}</p>
      <div className="grid">
        <CameraView replay={replay} k={k} showLabels={showLabels} showFeatures={showFeatures} useNN={detectorOn} />
        <SiteMap site={site} replay={replay} k={k} showPrior={prior === 'stale'} />
      </div>
      <Timeline replay={replay} k={k} setK={setK} playing={playing} setPlaying={setPlaying} />
      <div className="options">
        <label><input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> hazard labels</label>
        <label><input type="checkbox" checked={showFeatures} onChange={(e) => setShowFeatures(e.target.checked)} /> landmark matches</label>
        <span className="seg" role="group" aria-label="Ground hazard map">
          <button type="button" className={prior === 'complete' ? 'on' : ''} onClick={() => setPrior('complete')}>complete map</button>
          <button type="button" className={prior === 'stale' ? 'on' : ''} onClick={() => setPrior('stale')}>stale map</button>
        </span>
        <span className="seg" role="group" aria-label="Neural hazard detector">
          <button type="button" className={!detectorOn ? 'on' : ''} onClick={() => setDetector(false)}>baseline</button>
          <button type="button" className={detectorOn ? 'on' : ''} disabled={!hasDetector} title={hasDetector ? '' : 'detector results are not in this replay'} onClick={() => setDetector(true)}>+ detector</button>
        </span>
      </div>
      <DecisionBanner replay={replay} k={k} prior={prior} detector={detectorOn} />
    </div>
  )
}
