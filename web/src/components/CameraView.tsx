import { dataUrl } from '../data'
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
  const sweeping = showLabels && useNN && hasNN
  const overlay = showLabels ? dataUrl(`${base}/${useNN && hasNN ? 'n' : 'l'}${pad(k)}.png`) : null
  return (
    <div className="panel camera">
      <div className="panel-title">
        <span>Camera</span>
        <span className="muted">
          {showLabels ? (useNN && hasNN ? 'detector output' : 'ground-truth hazard labels') : 'raw frame'}
        </span>
      </div>
      <div className="frame">
        <ZoomPan>
          <img src={dataUrl(`${base}/f${pad(k)}.webp`)} alt="Navigation camera frame" draggable={false} />
          {overlay && (
            <img
              key={sweeping ? `s${k}` : 'o'}
              className={sweeping ? 'cam-layer sweep' : 'cam-layer'}
              src={overlay}
              alt=""
              draggable={false}
            />
          )}
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
      </div>
      <div className="caption muted">
        {f.used} landmark{f.used === 1 ? '' : 's'} matched this frame
        {showFeatures && f.features.length > 0 && ' Boxes: predicted position. Dots: where the image says they are.'}
      </div>
    </div>
  )
}
