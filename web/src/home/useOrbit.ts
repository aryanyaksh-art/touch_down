import { useEffect, type RefObject } from 'react'
import { stage } from './stage'

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))

/** Free look around the galaxy: drag to turn it, scroll or pinch to zoom, with a little momentum on release. */
export function useOrbit(el: RefObject<HTMLElement | null>, active: boolean, reduce: boolean) {
  useEffect(() => {
    const node = el.current
    if (!node || !active) return
    const e = stage.explore
    e.on = true
    node.style.touchAction = 'none'
    node.style.cursor = 'grab'

    const pts = new Map<number, { x: number; y: number }>()
    let vy = 0
    let vp = 0
    let pinch = 0
    let raf = 0

    const coast = () => {
      e.yaw += vy
      e.pitch = clamp(e.pitch + vp, -1.25, 1.25)
      vy *= 0.94
      vp *= 0.94
      if (Math.abs(vy) > 1e-5 || Math.abs(vp) > 1e-5) raf = requestAnimationFrame(coast)
    }

    const down = (ev: PointerEvent) => {
      node.setPointerCapture(ev.pointerId)
      pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
      cancelAnimationFrame(raf)
      vy = vp = 0
      e.drag = true
      node.style.cursor = 'grabbing'
      if (pts.size === 2) {
        const [a, b] = [...pts.values()]
        pinch = Math.hypot(a.x - b.x, a.y - b.y)
      }
    }
    const move = (ev: PointerEvent) => {
      const p = pts.get(ev.pointerId)
      if (!p) return
      const dx = ev.clientX - p.x
      const dy = ev.clientY - p.y
      p.x = ev.clientX
      p.y = ev.clientY
      if (pts.size === 1) {
        vy = -dx * 0.0055
        vp = dy * 0.004
        e.yaw += vy
        e.pitch = clamp(e.pitch + vp, -1.25, 1.25)
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (pinch > 0) e.zoom = clamp(e.zoom * (pinch / d), 0.35, 1.7)
        pinch = d
      }
    }
    const up = (ev: PointerEvent) => {
      pts.delete(ev.pointerId)
      if (pts.size === 0) {
        e.drag = false
        node.style.cursor = 'grab'
        if (!reduce) raf = requestAnimationFrame(coast)
      }
    }
    const wheel = (ev: WheelEvent) => {
      ev.preventDefault()
      e.zoom = clamp(e.zoom * Math.exp(ev.deltaY * 0.0011), 0.35, 1.7)
    }

    node.addEventListener('pointerdown', down)
    node.addEventListener('pointermove', move)
    node.addEventListener('pointerup', up)
    node.addEventListener('pointercancel', up)
    node.addEventListener('wheel', wheel, { passive: false })
    return () => {
      cancelAnimationFrame(raf)
      node.removeEventListener('pointerdown', down)
      node.removeEventListener('pointermove', move)
      node.removeEventListener('pointerup', up)
      node.removeEventListener('pointercancel', up)
      node.removeEventListener('wheel', wheel)
      node.style.touchAction = ''
      node.style.cursor = ''
      e.on = false
      e.drag = false
    }
  }, [el, active, reduce])
}
