import { useEffect, useRef, type ReactNode } from 'react'
import { animate, motion, useMotionTemplate, useMotionValue } from 'motion/react'
import { MagnifyingGlassMinus, MagnifyingGlassPlus, ArrowsIn } from '@phosphor-icons/react'
import { EASE_OUT } from '../lib/motion'

// Wheel or buttons to zoom a picture, drag to pan, double-click to reset. Zoom is anchored on the cursor.
const MAX = 8

export default function ZoomPan({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const scale = useMotionValue(1)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const transform = useMotionTemplate`translate(${x}px, ${y}px) scale(${scale})`
  const drag = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number } | null>(null)
  // two-finger pinch on touch screens
  const touches = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; scale: number } | null>(null)

  const clamp = (nx: number, ny: number, s: number) => {
    const r = box.current!.getBoundingClientRect()
    const mx = ((s - 1) * r.width) / 2
    const my = ((s - 1) * r.height) / 2
    return [Math.max(-mx, Math.min(mx, nx)), Math.max(-my, Math.min(my, ny))] as const
  }
  const zoomTo = (s2: number, cx: number, cy: number) => {
    const s = scale.get()
    s2 = Math.max(1, Math.min(MAX, s2))
    const k = s2 / s
    const [nx, ny] = clamp(cx - (cx - x.get()) * k, cy - (cy - y.get()) * k, s2)
    scale.set(s2)
    x.set(nx)
    y.set(ny)
  }
  const reset = () => {
    const o = { duration: 0.35, ease: EASE_OUT }
    animate(scale, 1, o)
    animate(x, 0, o)
    animate(y, 0, o)
  }

  useEffect(() => {
    const el = box.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomTo(scale.get() * Math.exp(-e.deltaY * 0.0018), e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const step = (f: number) => zoomTo(scale.get() * f, 0, 0)

  return (
    <div
      className="zoompan"
      ref={box}
      onDoubleClick={reset}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return
        if (e.pointerType === 'touch') {
          touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
          if (touches.current.size === 2) {
            const [a, b] = [...touches.current.values()]
            pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: scale.get() }
            drag.current = null
            return
          }
        }
        if (scale.get() <= 1) return
        if (drag.current) return
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: x.get(), oy: y.get() }
      }}
      onPointerMove={(e) => {
        if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) {
          touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
          if (pinch.current && touches.current.size === 2) {
            const [a, b] = [...touches.current.values()]
            const r = box.current!.getBoundingClientRect()
            zoomTo(pinch.current.scale * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.dist), (a.x + b.x) / 2 - r.left - r.width / 2, (a.y + b.y) / 2 - r.top - r.height / 2)
            return
          }
        }
        const d = drag.current
        if (!d || d.id !== e.pointerId) return
        const [nx, ny] = clamp(d.ox + e.clientX - d.sx, d.oy + e.clientY - d.sy, scale.get())
        x.set(nx)
        y.set(ny)
      }}
      onPointerUp={(e) => {
        touches.current.delete(e.pointerId)
        if (touches.current.size < 2) pinch.current = null
        drag.current = null
      }}
      onPointerCancel={(e) => {
        touches.current.delete(e.pointerId)
        pinch.current = null
        drag.current = null
      }}
    >
      <motion.div className="zoompan-layer" style={{ transform }}>
        {children}
      </motion.div>
      <div className="zoom-tools">
        <button type="button" onClick={() => step(1.6)} aria-label="Zoom in"><MagnifyingGlassPlus size={18} weight="regular" /></button>
        <button type="button" onClick={() => step(1 / 1.6)} aria-label="Zoom out"><MagnifyingGlassMinus size={18} weight="regular" /></button>
        <button type="button" onClick={reset} aria-label="Reset zoom"><ArrowsIn size={18} weight="regular" /></button>
      </div>
    </div>
  )
}
