import { dataUrl } from '../data'
import type { Replay, Site } from '../types'

interface Props {
  site: Site
  replay: Replay
  k: number
  showPrior: boolean
}

const HALF_W = Math.tan((22 * Math.PI) / 180)
const HALF_H = Math.tan((16.85 * Math.PI) / 180)

export default function SiteMap({ site, replay, k, showPrior }: Props) {
  const [lx, ly] = site.extent_m
  const frames = replay.frames
  const f = frames[k]
  const last = k === frames.length - 1
  // SVG y points down, so flip north
  const P = (p: number[]) => `${p[0]},${-p[1]}`
  const trueTrack = frames.slice(0, k + 1).map((fr) => P(fr.true)).join(' ')
  const estTrack = frames.slice(0, k + 1).map((fr) => P(fr.est)).join(' ')
  const d = replay.decision
  const sx = f.sigma_xy[0]
  const sy = f.sigma_xy[1]
  return (
    <div className="panel map">
      <div className="panel-title">
        <span>Site, top-down</span>
        <span className="muted">{lx.toFixed(0)} × {ly.toFixed(0)} m, north up</span>
      </div>
      <svg viewBox={`${-lx / 2} ${-ly / 2} ${lx} ${ly}`} preserveAspectRatio="xMidYMid meet">
        <image href={dataUrl('site_hillshade.webp')} x={-lx / 2} y={-ly / 2} width={lx} height={ly} />
        <image href={dataUrl('site_hazards.png')} x={-lx / 2} y={-ly / 2} width={lx} height={ly} opacity={0.9} />
        {showPrior && (
          <image
            href={dataUrl('site_prior_stale.png')}
            x={-lx / 2}
            y={-ly / 2}
            width={lx}
            height={ly}
            opacity={0.35}
            style={{ mixBlendMode: 'screen' }}
          />
        )}
        {/* target and 8 m sampling zone */}
        <circle cx={site.target[0]} cy={-site.target[1]} r={4} className="zone" />
        <path d={`M${site.target[0] - 0.9},${-site.target[1]}h1.8M${site.target[0]},${-site.target[1] - 0.9}v1.8`} className="cross" />
        {/* camera footprint at the estimated position */}
        <rect
          x={f.est[0] - f.est[2] * HALF_W}
          y={-f.est[1] - f.est[2] * HALF_H}
          width={2 * f.est[2] * HALF_W}
          height={2 * f.est[2] * HALF_H}
          className="footprint"
        />
        <polyline points={trueTrack} className="track-true" />
        <polyline points={estTrack} className="track-est" />
        <ellipse cx={f.est[0]} cy={-f.est[1]} rx={Math.max(3 * sx, 0.05)} ry={Math.max(3 * sy, 0.05)} className="sigma" />
        <circle cx={f.true[0]} cy={-f.true[1]} r={0.35} className="dot-true" />
        <circle cx={f.est[0]} cy={-f.est[1]} r={0.2} className="dot-est" />
        {last && (
          <>
            <ellipse
              cx={d.contact_pred[0]}
              cy={-d.contact_pred[1]}
              rx={Math.max(2 * d.contact_pred_sigma[0], 0.05)}
              ry={Math.max(2 * d.contact_pred_sigma[1], 0.05)}
              className="pred-contact"
            />
            <circle cx={d.contact_true[0]} cy={-d.contact_true[1]} r={0.3} className={d.unsafe_contact ? 'contact-bad' : 'contact-ok'} />
          </>
        )}
      </svg>
      <div className="legend">
        <span><i className="sw true" />true path</span>
        <span><i className="sw est" />estimated path</span>
        <span><i className="sw zone-sw" />8 m sampling zone</span>
        <span><i className="sw boulder" />boulders</span>
        <span><i className="sw steep" />steep ground</span>
      </div>
    </div>
  )
}
