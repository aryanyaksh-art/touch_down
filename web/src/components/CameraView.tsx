import { useRef, useState } from 'react'
import { dataUrl } from '../data'
import { classify, usePixels } from './pixels'
import ZoomPan from './ZoomPan'
import type { Frame, Replay } from '../types'

interface Props {
  replay: Replay
  k: number
  showLabels: boolean
  showFeatures: boolean
  useNN: boolean
}

export default function CameraView({ replay, k, showLabels, showFeatures, useNN }: Props) {
  const f: Frame = replay.frames[k]
  const pad = (n: number) => String(n).padStart(2, '0')
  const base = `replays/${replay.id}`
  const hasNN = !!f.nn
  const analysed = useNN && hasNN
  const overlay = showLabels ? dataUrl(`${base}/${analysed ? 'n' : 'l'}${pad(k)}.png`) : null
  const sweeping = showLabels && analysed
  const imgRef = useRef<HTMLImageElement>(null)
  // before and after: how much of the picture is shown analysed, from the left edge
  const [split, setSplit] = useState(100)
  const [hover, setHover] = useState<{ x: number; y: number; truth: string; found: string | null } | null>(null)
  // hover reads the label images directly, so what it says matches what is drawn
  const truthPx = usePixels(dataUrl(`${base}/l${pad(k)}.png`))
  const foundPx = usePixels(hasNN ? dataUrl(`${base}/n${pad(k)}.png`) : null)

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const img = imgRef.current
    // on touch screens the readout comes from a tap (see onPointerUp), not from moving
    if (!img || e.pointerType === 'touch' || e.buttons) return setHover(null)
    const r = img.getBoundingClientRect()
    const u = ((e.clientX - r.left) / r.width) * 320
    const v = ((e.clientY - r.top) / r.height) * 240
    if (u < 0 || v < 0 || u >= 320 || v >= 240) return setHover(null)
    const box = e.currentTarget.getBoundingClientRect()
    setHover({ x: e.clientX - box.left, y: e.clientY - box.top, truth: classify(truthPx, u, v), found: hasNN ? classify(foundPx, u, v) : null })
  }

  const onTap = (e: React.PointerEvent<HTMLDivElement>) => {
    const img = imgRef.current
    if (!img) return
    const r = img.getBoundingClientRect()
    const u = ((e.clientX - r.left) / r.width) * 320
    const v = ((e.clientY - r.top) / r.height) * 240
    if (u < 0 || v < 0 || u >= 320 || v >= 240) return setHover(null)
    const box = e.currentTarget.getBoundingClientRect()
    setHover({ x: e.clientX - box.left, y: e.clientY - box.top, truth: classify(truthPx, u, v), found: hasNN ? classify(foundPx, u, v) : null })
  }

  return (
    <div className="panel camera">
      <div className="panel-title">
        <span>Picture analysed</span>
        <span className="muted">
          {showLabels ? (analysed ? 'detector output' : 'ground-truth hazard labels') : 'raw frame'}
        </span>
      </div>
      <div className="frame" onPointerMove={onMove} onPointerUp={(e) => e.pointerType === 'touch' && onTap(e)} onPointerLeave={() => setHover(null)}>
        <ZoomPan>
          <img ref={imgRef} src={dataUrl(`${base}/f${pad(k)}.webp`)} alt="Navigation camera frame" draggable={false} />
          {overlay && (
            <div className="cam-clip" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
              <img
                key={sweeping ? `s${k}` : 'o'}
                className={sweeping ? 'cam-layer sweep' : 'cam-layer'}
                src={overlay}
                alt=""
                draggable={false}
              />
            </div>
          )}
          {overlay && split < 100 && <div className="split-line" style={{ left: `${split}%` }} aria-hidden="true" />}
          {sweeping && <div key={`scan${k}`} className="scanline" aria-hidden="true" />}
          {showFeatures && (
            <svg viewBox="0 0 320 240" className="cam-layer">
              {f.features.map((p, i) => (
                <g key={i}>
                  <rect x={p[0] - 10} y={p[1] - 10} width={20} height={20} className="feat-pred" />
                  <line x1={p[0]} y1={p[1]} x2={p[2]} y2={p[3]} className="feat-vec" />
                  <circle cx={p[2]} cy={p[3]} r={2.2} className="feat-meas" />
                </g>
              ))}
            </svg>
          )}
        </ZoomPan>
        <div className="hud">
          <div>
            <b>{f.alt.toFixed(1)}</b> m
          </div>
          <div className="muted">T+{f.t.toFixed(0)} s</div>
        </div>
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
        {f.used} landmark{f.used === 1 ? '' : 's'} matched this frame.
        {showFeatures && f.features.length > 0 && ' Boxes: predicted position. Dots: where the image says they are.'} Scroll to zoom, drag to move, hover for what is under the cursor.
      </div>
    </div>
  )
}
