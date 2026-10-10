import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'
import { STAR_COLORS, mulberry32 } from '../lib/model'

// The page background: a fixed night sky in three depth layers. Stars twinkle, the layers drift at
// different speeds as you scroll (parallax), and an occasional meteor crosses. Solid dots only, no gradients.
const LAYERS = [
  { density: 5200, size: [0.5, 1.0], parallax: 0.02, alpha: 0.55 },
  { density: 9000, size: [0.6, 1.3], parallax: 0.05, alpha: 0.75 },
  { density: 26000, size: [0.9, 1.9], parallax: 0.1, alpha: 0.95 },
]

interface Dot {
  x: number
  y: number
  r: number
  c: string
  ph: number
  sp: number
}

export default function Starfield({ paused = false, inline = false }: { paused?: boolean; inline?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduce = useReducedMotion()

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let W = 0
    let H = 0
    let dpr = 1
    let layers: Dot[][] = []
    let raf = 0
    let meteor: { x: number; y: number; vx: number; vy: number; t: number } | null = null
    let nextMeteor = 6000 + Math.random() * 6000
    const t0 = performance.now()

    const build = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = inline ? canvas.parentElement!.clientWidth : window.innerWidth
      H = inline ? canvas.parentElement!.clientHeight : window.innerHeight
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const rng = mulberry32(7)
      layers = LAYERS.map((L) => {
        // the layer is taller than the viewport so it can drift without showing a seam
        const h = H * 1.5
        const n = Math.round((W * h) / L.density)
        const dots: Dot[] = []
        for (let i = 0; i < n; i++) {
          dots.push({
            x: rng() * W,
            y: rng() * h,
            r: L.size[0] + rng() * (L.size[1] - L.size[0]),
            c: STAR_COLORS[Math.floor(rng() * STAR_COLORS.length)],
            ph: rng() * Math.PI * 2,
            sp: 0.4 + rng() * 1.4,
          })
        }
        return dots
      })
    }

    const draw = (now: number) => {
      const t = (now - t0) / 1000
      ctx.clearRect(0, 0, W, H)
      const sy = reduce ? 0 : window.scrollY
      layers.forEach((dots, li) => {
        const L = LAYERS[li]
        const h = H * 1.5
        const off = -((sy * L.parallax) % h)
        for (const d of dots) {
          let y = d.y + off
          if (y < 0) y += h
          if (y > H + 4) continue
          const tw = reduce ? 0.85 : 0.55 + 0.45 * Math.sin(t * d.sp + d.ph)
          ctx.globalAlpha = L.alpha * tw
          ctx.fillStyle = d.c
          if (d.r < 1.1) ctx.fillRect(d.x, y, d.r * 1.6, d.r * 1.6)
          else {
            ctx.beginPath()
            ctx.arc(d.x, y, d.r, 0, 6.2832)
            ctx.fill()
          }
        }
      })
      if (!reduce) {
        if (!meteor && now - t0 > nextMeteor) {
          const fromLeft = Math.random() < 0.5
          meteor = { x: fromLeft ? Math.random() * W * 0.5 : W * 0.5 + Math.random() * W * 0.5, y: Math.random() * H * 0.4, vx: (fromLeft ? 1 : -1) * (520 + Math.random() * 240), vy: 260 + Math.random() * 160, t: now }
        }
        if (meteor) {
          const age = (now - meteor.t) / 1000
          if (age > 0.9) {
            meteor = null
            nextMeteor = now - t0 + 9000 + Math.random() * 9000
          } else {
            // a streak of short segments with falling alpha (no gradient)
            for (let i = 0; i < 9; i++) {
              const a = age - i * 0.018
              if (a < 0) continue
              ctx.globalAlpha = (1 - i / 9) * (1 - age / 0.9) * 0.9
              ctx.fillStyle = '#dfe6ff'
              ctx.fillRect(meteor.x + meteor.vx * a, meteor.y + meteor.vy * a, 2.2, 2.2)
            }
          }
        }
      }
      ctx.globalAlpha = 1
    }

    const loop = (now: number) => {
      draw(now)
      raf = requestAnimationFrame(loop)
    }
    build()
    if (reduce || paused) {
      draw(performance.now())
      const onResize = () => { build(); draw(performance.now()) }
      window.addEventListener('resize', onResize)
      return () => {
        window.removeEventListener('resize', onResize)
      }
    }
    raf = requestAnimationFrame(loop)
    const onResize = () => build()
    const onVis = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden) raf = requestAnimationFrame(loop)
    }
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [reduce, paused, inline])

  return <canvas ref={ref} className={inline ? 'starfield inline' : 'starfield'} aria-hidden="true" />
}
