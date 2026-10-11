import { useRef, useState } from 'react'
import { dataUrl } from '../data'
import { classify, usePixels } from './pixels'
import ZoomPan from './ZoomPan'

type Layer = 'raw' | 'truth' | 'detector'

// The picture the spacecraft looked at when it made its 5 m decision, re-rendered for this landing (see
// touchdown/analysis/render_pictures.py). Inspect it: zoom and drag, switch the analysis layer, slide between raw and
// analysed, and hover to read what is under the cursor.
export default function PictureView({ seed, detector }: { seed: number; detector: boolean }) {
  const [layer, setLayer] = useState<Layer>(detector ? 'detector' : 'truth')
  const [split, setSplit] = useState(100)
  const [hover, setHover] = useState<{ x: number; y: number; truth: string; found: string | null } | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const base = `pictures/s${seed}`
  const truthPx = usePixels(dataUrl(`${base}_l.png`))
  const foundPx = usePixels(detector ? dataUrl(`${base}_n.png`) : null)
  const overlay = layer === 'raw' ? null : dataUrl(`${base}${layer === 'detector' ? '_n' : '_l'}.png`)

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const img = imgRef.current
    // on touch screens the readout comes from a tap (see onPointerUp), not from moving
    if (!img || e.pointerType === 'touch' || e.buttons) return setHover(null)
    const r = img.getBoundingClientRect()
    const u = ((e.clientX - r.left) / r.width) * 320
    const v = ((e.clientY - r.top) / r.height) * 240
    if (u < 0 || v < 0 || u >= 320 || v >= 240) return setHover(null)
    const box = e.currentTarget.getBoundingClientRect()
    setHover({ x: e.clientX - box.left, y: e.clientY - box.top, truth: classify(truthPx, u, v), found: detector ? classify(foundPx, u, v) : null })
  }

  const onTap = (e: React.PointerEvent<HTMLDivElement>) => {
    const img = imgRef.current
    if (!img) return
    const r = img.getBoundingClientRect()
    const u = ((e.clientX - r.left) / r.width) * 320
    const v = ((e.clientY - r.top) / r.height) * 240
    if (u < 0 || v < 0 || u >= 320 || v >= 240) return setHover(null)
    const box = e.currentTarget.getBoundingClientRect()
    setHover({ x: e.clientX - box.left, y: e.clientY - box.top, truth: classify(truthPx, u, v), found: detector ? classify(foundPx, u, v) : null })
  }

  return (
    <div className="panel picture">
      <div className="panel-title">
        <span>Picture analysed</span>
        <span className="seg" role="group" aria-label="Analysis layer">
          <button type="button" className={layer === 'raw' ? 'on' : ''} onClick={() => setLayer('raw')}>raw</button>
          <button type="button" className={layer === 'truth' ? 'on' : ''} onClick={() => setLayer('truth')}>ground truth</button>
          {detector && <button type="button" className={layer === 'detector' ? 'on' : ''} onClick={() => setLayer('detector')}>detector</button>}
        </span>
      </div>
      <div className="frame" onPointerMove={onMove} onPointerUp={(e) => e.pointerType === 'touch' && onTap(e)} onPointerLeave={() => setHover(null)}>
        <ZoomPan>
          <img ref={imgRef} src={dataUrl(`${base}.webp`)} alt={`What the probe saw above landing ${seed + 1} at 5 metres`} draggable={false} />
          {overlay && (
            <div className="cam-clip" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
              <img className="cam-layer" src={overlay} alt="" draggable={false} />
            </div>
          )}
          {overlay && split < 100 && <div className="split-line" style={{ left: `${split}%` }} aria-hidden="true" />}
        </ZoomPan>
        {hover && (
          <div className="probe-tip" style={{ transform: `translate(${Math.round(hover.x + 14)}px, ${Math.round(hover.y + 14)}px)` }}>
            <span>Truth: <b>{hover.truth}</b></span>
            {hover.found !== null && <span>Detector: <b>{hover.found}</b></span>}
          </div>
        )}
      </div>
      {overlay && (
        <label className="compare">
          <span>Raw</span>
          <input type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} aria-label="Before and after: how much of the picture shows the analysis" />
          <span>Analysed</span>
        </label>
      )}
      <div className="caption muted">
        Straight down at about 5 m, above the contact point the spacecraft predicted. Orange: boulders. Red: steep ground. Scroll to zoom, drag to move, hover for what is under the cursor.
      </div>
    </div>
  )
}
