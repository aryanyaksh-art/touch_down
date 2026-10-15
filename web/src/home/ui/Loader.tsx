import { useEffect, useState } from 'react'
import { DefaultLoadingManager } from 'three'

/** A thin progress ring over black until the sky and the models have arrived. */
export default function Loader({ ready }: { ready: boolean }) {
  const [p, setP] = useState(0)
  useEffect(() => {
    // assets arrive one after another, so the manager's own fraction jumps about; keep it moving forward and never claim to be done
    const prev = DefaultLoadingManager.onProgress
    let best = 0
    DefaultLoadingManager.onProgress = (_url, loaded, total) => {
      best = Math.max(best, total ? loaded / (total + 1) : 0)
      setP(Math.min(0.92, best))
    }
    return () => {
      DefaultLoadingManager.onProgress = prev
    }
  }, [])
  const r = 22
  const c = 2 * Math.PI * r
  return (
    <div className="loader" data-ready={ready} aria-hidden={ready} role="status">
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="1.5" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="#f4f4f5"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray={`${Math.max(0.04, p) * c} ${c}`}
          transform="rotate(-90 32 32)"
          style={{ transition: 'stroke-dasharray 300ms cubic-bezier(0.23, 1, 0.32, 1)' }}
        />
      </svg>
      <span className="sr-only">Loading</span>
    </div>
  )
}
