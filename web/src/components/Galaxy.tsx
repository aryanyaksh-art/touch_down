import { useEffect, useRef, useState } from 'react'
import {
  ARM_ORDER,
  ARM_TWIST,
  HAZARD_COLOR,
  OUTCOME_LABEL,
  armPhase,
  gauss,
  layoutStars,
  mulberry32,
  viewKey,
  type Outcome,
  type Star,
  type View,
} from '../lib/model'

// Every simulated landing is one star. Stars sit on three spiral arms by what happened at the
// 5 m decision; distance from the core is how far the landing ended from its aim point.
// The faint dust, haze and dark lanes behind them are decoration and carry no data.

// Wide screens tilt the disc like an inclined galaxy; portrait screens turn it diagonal and fatten it so it fills the width.
const WIDE = { tilt: -0.32, squash: 0.58 }
const PORTRAIT = { tilt: -1.0, squash: 0.86 }
const PLANE = 1.3 // half-width of the cached background plane, in galaxy radii
const SPIN = 0.011 // radians per second

interface Props {
  stars: Star[]
  view: View
  interactive: boolean
  paused: boolean
  reduce: boolean
  bloom: boolean
  onOpen: (seed: number, origin: { x: number; y: number }) => void
}

function drawBackground(L: number, dpr: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = L
  c.height = L
  const g = c.getContext('2d')!
  const rng = mulberry32(1987)
  const px = (v: number) => ((v + PLANE) / (2 * PLANE)) * L
  const unit = L / (2 * PLANE) // pixels per galaxy radius
  const dot = (x: number, y: number, r: number, col: string, a: number) => {
    g.globalAlpha = a
    g.fillStyle = col
    if (r < 1.2 * dpr) g.fillRect(px(x), px(y), r * 1.5, r * 1.5)
    else {
      g.beginPath()
      g.arc(px(x), px(y), r, 0, 6.2832)
      g.fill()
    }
  }
  // haze: stacked translucent discs, widest first. Flat fills only.
  for (let i = 0; i < 40; i++) {
    g.globalAlpha = 0.0038
    g.fillStyle = '#7f90cf'
    g.beginPath()
    g.arc(px(0), px(0), unit * (1.2 - i * 0.026), 0, 6.2832)
    g.fill()
  }
  // three arms with the same phases as the outcome arms; the weights say how busy each one is
  const arms: { phase: number; weight: number; cols: string[] }[] = [
    { phase: armPhase('clean'), weight: 1.0, cols: ['#9db4ff', '#bcd0ff', '#dfe6ff', '#dfe6ff', '#fff1d6'] },
    { phase: armPhase('backaway'), weight: 0.62, cols: ['#9db4ff', '#bcd0ff', '#dfe6ff', '#ffd9a0'] },
    { phase: armPhase('hazard'), weight: 0.3, cols: ['#bcd0ff', '#dfe6ff', '#ffc98a'] },
  ]
  for (const arm of arms) {
    const n = Math.round(7600 * arm.weight)
    for (let i = 0; i < n; i++) {
      const r = 0.08 + Math.pow(rng(), 0.8) * 0.98
      const spread = 0.2 / (0.32 + r)
      const th = arm.phase + ARM_TWIST * r + gauss(rng) * spread * 0.42
      const rr = r + gauss(rng) * 0.018
      const col = arm.cols[Math.floor(rng() * arm.cols.length)]
      const bright = rng() < 0.05
      dot(Math.cos(th) * rr, Math.sin(th) * rr, (bright ? 1.4 : 0.55 + rng() * 0.7) * dpr, col, bright ? 0.9 : 0.14 + rng() * 0.5)
    }
    // arm body from stacked translucent discs along the arm
    for (let i = 0; i < 70; i++) {
      const r = 0.1 + (i / 70) * 0.95
      const th = arm.phase + ARM_TWIST * r
      g.globalAlpha = 0.022 * arm.weight
      g.fillStyle = '#a9b8ff'
      g.beginPath()
      g.arc(px(Math.cos(th) * r), px(Math.sin(th) * r), unit * (0.05 + 0.05 * r), 0, 6.2832)
      g.fill()
    }
  }
  // bulge: warm dots with a gaussian falloff over a few stacked translucent discs
  for (let i = 0; i < 26; i++) {
    g.globalAlpha = 0.02
    g.fillStyle = '#ffe2b0'
    g.beginPath()
    g.arc(px(0), px(0), unit * (0.3 - i * 0.0107), 0, 6.2832)
    g.fill()
  }
  for (let i = 0; i < 3600; i++) {
    const a = rng() * Math.PI * 2
    const r = Math.abs(gauss(rng)) * 0.09
    dot(Math.cos(a) * r, Math.sin(a) * r, (0.5 + rng() * 0.9) * dpr, rng() < 0.5 ? '#fff1d6' : '#ffd9a0', 0.25 + rng() * 0.6)
  }
  // field stars across the disc and beyond
  for (let i = 0; i < 2600; i++) {
    const a = rng() * Math.PI * 2
    const r = Math.sqrt(rng()) * 1.25
    dot(Math.cos(a) * r, Math.sin(a) * r, (0.4 + rng() * 0.5) * dpr, '#dfe6ff', 0.1 + rng() * 0.35)
  }
  // dust lanes: dark blobs on the inner edge of each arm, painted in the sky colour
  for (const arm of arms) {
    const n = Math.round(1300 * arm.weight)
    for (let i = 0; i < n; i++) {
      const r = 0.14 + Math.pow(rng(), 0.9) * 0.82
      const th = arm.phase + ARM_TWIST * r - 0.2 / (0.4 + r) + gauss(rng) * 0.03
      g.globalAlpha = 0.05 + rng() * 0.07
      g.fillStyle = '#0a0d1f'
      g.beginPath()
      g.arc(px(Math.cos(th) * r), px(Math.sin(th) * r), (1.5 + rng() * 5) * dpr, 0, 6.2832)
      g.fill()
    }
  }
  g.globalAlpha = 1
  return c
}

export default function Galaxy({ stars, view, interactive, paused, reduce, bloom, onOpen }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<Star | null>(null)
  const eng = useRef({
    cx: new Float32Array(0),
    cy: new Float32Array(0),
    sx: new Float32Array(0),
    sy: new Float32Array(0),
    hover: -1,
    spin: 0,
    armAlpha: 0,
    onOpen,
    interactive,
    bloom,
    draw: (() => {}) as () => void,
  })
  eng.current.onOpen = onOpen
  eng.current.interactive = interactive
  eng.current.bloom = bloom

  // recompute star targets whenever the view or the data changes
  useEffect(() => {
    layoutStars(stars, viewKey(view))
    const e = eng.current
    if (e.cx.length !== stars.length) {
      e.cx = new Float32Array(stars.length)
      e.cy = new Float32Array(stars.length)
      e.sx = new Float32Array(stars.length)
      e.sy = new Float32Array(stars.length)
      const rng = mulberry32(5)
      for (let i = 0; i < stars.length; i++) {
        e.cx[i] = (rng() - 0.5) * 0.06
        e.cy[i] = (rng() - 0.5) * 0.06
      }
    }
    e.draw()
  }, [stars, view, reduce])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')!
    const e = eng.current
    let W = 0
    let H = 0
    let dpr = 1
    let S = 1
    let tilt = WIDE.tilt
    let squash = WIDE.squash
    let cyShift = 0
    let bg: HTMLCanvasElement | null = null
    let raf = 0
    let last = performance.now()

    let T = Math.cos(tilt)
    let U = Math.sin(tilt)
    const project = (x: number, y: number, ca: number, sa: number) => {
      const rx = x * ca - y * sa
      const ry = x * sa + y * ca
      const ex = rx * S
      const ey = ry * S * squash
      return [W / 2 + ex * T - ey * U, H / 2 + cyShift + ex * U + ey * T] as const
    }

    function draw() {
      const now = performance.now()
      const dt = Math.min(0.2, (now - last) / 1000)
      last = now
      if (!bg || e.cx.length !== stars.length) return
      const t = now / 1000
      if (!reduce) e.spin += dt * SPIN
      const ca = Math.cos(e.spin)
      const sa = Math.sin(e.spin)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      // cached dust, rotated with the same transform the stars use
      ctx.save()
      ctx.translate(W / 2, H / 2 + cyShift)
      ctx.rotate(tilt)
      ctx.scale(1, squash)
      ctx.rotate(e.spin)
      ctx.drawImage(bg, -PLANE * S, -PLANE * S, 2 * PLANE * S, 2 * PLANE * S)
      ctx.restore()

      const live = e.bloom || reduce
      const k = reduce ? 1 : 1 - Math.exp(-dt * 2.4)
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i]
        if (live) {
          e.cx[i] += (s.tx - e.cx[i]) * k
          e.cy[i] += (s.ty - e.cy[i]) * k
        }
        const p = project(e.cx[i], e.cy[i], ca, sa)
        e.sx[i] = p[0]
        e.sy[i] = p[1]
      }
      if (!live) return
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i]
        const x = e.sx[i]
        const y = e.sy[i]
        const tw = reduce ? 0.95 : 0.62 + 0.38 * Math.sin(t * s.speed + s.phase)
        const col = s.outcome === 'hazard' ? HAZARD_COLOR : s.color
        const r = s.size * (s.outcome === 'hazard' ? 1.35 : 1)
        ctx.fillStyle = col
        ctx.globalAlpha = 0.13 * tw
        ctx.beginPath()
        ctx.arc(x, y, r * 3.1, 0, 6.2832)
        ctx.fill()
        ctx.globalAlpha = tw
        ctx.beginPath()
        ctx.arc(x, y, r, 0, 6.2832)
        ctx.fill()
        if (s.replayId) {
          ctx.globalAlpha = 0.55
          ctx.strokeStyle = col
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.arc(x, y, r + 4.5, 0, 6.2832)
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1
      // arm names with counts
      e.armAlpha += (1 - e.armAlpha) * (reduce ? 1 : 1 - Math.exp(-dt * 1.2))
      const counts: Record<Outcome, number> = { clean: 0, backaway: 0, hazard: 0 }
      for (const s of stars) counts[s.outcome]++
      ctx.font = '11px "Space Mono", monospace'
      ctx.textBaseline = 'middle'
      for (const o of ARM_ORDER) {
        const th = armPhase(o) + ARM_TWIST * 1.0
        const p = project(Math.cos(th) * 1.12, Math.sin(th) * 1.12, ca, sa)
        ctx.globalAlpha = e.armAlpha * 0.9
        ctx.fillStyle = o === 'hazard' ? HAZARD_COLOR : '#c8cdea'
        const text = `${OUTCOME_LABEL[o]}  ${counts[o]}`
        const tw = ctx.measureText(text).width
        const right = p[0] > W / 2
        ctx.textAlign = 'left'
        const x = right ? Math.min(p[0], W - tw - 8) : Math.max(p[0] - tw, 8)
        const ty = Math.max(14, Math.min(H - 14, p[1]))
        ctx.lineWidth = 3
        ctx.strokeStyle = '#0a0d1f'
        ctx.lineJoin = 'round'
        ctx.strokeText(text, x, ty)
        ctx.fillText(text, x, ty)
      }
      ctx.globalAlpha = 1
      if (e.hover >= 0) {
        const x = e.sx[e.hover]
        const y = e.sy[e.hover]
        ctx.strokeStyle = '#f2efe8'
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.arc(x, y, 11 + (reduce ? 0 : Math.sin(t * 5) * 0.8), 0, 6.2832)
        ctx.stroke()
        if (labelRef.current) labelRef.current.style.transform = `translate(${Math.round(x + 16)}px, ${Math.round(y - 14)}px)`
      }
    }
    e.draw = draw

    const resize = () => {
      const r = wrap.getBoundingClientRect()
      W = r.width
      H = r.height
      if (W < 2 || H < 2) return
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      const portrait = H > W * 1.1
      const shape = portrait ? PORTRAIT : WIDE
      tilt = shape.tilt
      squash = shape.squash
      T = Math.cos(tilt)
      U = Math.sin(tilt)
      S = portrait ? W * 0.5 : Math.min(W * 0.44, H * 0.8)
      cyShift = portrait ? -H * 0.14 : 0
      bg = drawBackground(Math.min(2400, Math.round(S * 2 * PLANE * dpr)), dpr)
      draw()
    }

    const tick = () => {
      draw()
      raf = requestAnimationFrame(tick)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    resize()
    if (!reduce && !paused) raf = requestAnimationFrame(tick)

    const hit = (x: number, y: number, radius: number) => {
      let best = -1
      let bd = radius * radius
      for (let i = 0; i < stars.length; i++) {
        const dx = e.sx[i] - x
        const dy = e.sy[i] - y
        const d = dx * dx + dy * dy
        if (d < bd) {
          bd = d
          best = i
        }
      }
      return best
    }
    const onMove = (ev: PointerEvent) => {
      if (!e.interactive || ev.pointerType === 'touch') return
      const r = canvas.getBoundingClientRect()
      const h = hit(ev.clientX - r.left, ev.clientY - r.top, 14)
      if (h !== e.hover) {
        e.hover = h
        setHover(h >= 0 ? stars[h] : null)
        canvas.style.cursor = h >= 0 ? 'pointer' : 'default'
        if (reduce) draw()
      }
    }
    const onLeave = () => {
      if (e.hover !== -1) {
        e.hover = -1
        setHover(null)
        if (reduce) draw()
      }
    }
    const onClick = (ev: MouseEvent) => {
      if (!e.interactive) return
      const r = canvas.getBoundingClientRect()
      const h = hit(ev.clientX - r.left, ev.clientY - r.top, 20)
      if (h >= 0) e.onOpen(stars[h].seed, { x: e.sx[h] + r.left, y: e.sy[h] + r.top })
    }
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerleave', onLeave)
    canvas.addEventListener('click', onClick)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('click', onClick)
    }
  }, [stars, reduce, paused])

  return (
    <div className="galaxy" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className={interactive ? 'galaxy-canvas on' : 'galaxy-canvas'}
        role="img"
        aria-label="Map of the simulated landings, one star each. Use the landing number box to open one."
      />
      <div ref={labelRef} className="star-label" data-show={hover ? 'true' : 'false'} aria-hidden="true">
        {hover && (
          <>
            <b>Landing {hover.seed}</b>
            <span>{hover.err.toFixed(2)} m from the aim point</span>
            <span className={hover.outcome === 'hazard' ? 'hot' : ''}>{OUTCOME_LABEL[hover.outcome]}</span>
            {hover.replayId && <span className="dim">full camera replay</span>}
          </>
        )}
      </div>
    </div>
  )
}
