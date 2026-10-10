import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion, useMotionValue, useMotionValueEvent, useScroll, useSpring, useTransform, type MotionValue } from 'motion/react'
import Galaxy from './Galaxy'
import { EYE, TUBE_ANGLE, TelescopeScene, TelescopeTube, VB_H, VB_W } from './Telescope'
import type { Star, View } from '../lib/model'

interface Props {
  stars: Star[]
  view: View
  reduce: boolean
  paused: boolean
  simple: boolean
  count: number
  onOpen: (seed: number, origin: { x: number; y: number }) => void
  hud: ReactNode
}

const MAX_ZOOM = 60
const HOLE_START = 10 // eyepiece hole radius in scene units
const HOLE_END = 34
// the eyepiece drifts to the middle of the screen as we fly in, so the galaxy ends up centred
const pan = (v: number) => {
  const e = v * v * (3 - 2 * v)
  return { x: EYE.x + (VB_W / 2 - EYE.x) * e, y: EYE.y + (VB_H / 2 - EYE.y) * e }
}

function Title({ count }: { count: number }) {
  return (
    <>
      <h1>TouchDown</h1>
      <p>
        A spacecraft lands on an asteroid by itself. Here are {count.toLocaleString()} simulated landings at Bennu, one star each.
      </p>
    </>
  )
}

function SceneSvg({ tilt }: { tilt: MotionValue<number> }) {
  const tiltStyle = useTransform(tilt, (v) => `translate(${EYE.x}px, ${EYE.y}px) rotate(${v}deg) translate(${-EYE.x}px, ${-EYE.y}px)`)
  return (
    <>
      <TelescopeScene />
      <motion.g style={{ transform: tiltStyle }}>
        <g transform={`translate(${EYE.x} ${EYE.y}) rotate(${TUBE_ANGLE})`}>
          <TelescopeTube />
        </g>
      </motion.g>
    </>
  )
}

/** Phones and reduced motion: a still picture, then the galaxy below it. No scroll zoom. */
function SimpleHero({ stars, view, reduce, paused, count, onOpen, hud }: Props) {
  return (
    <>
      <section className="hero-simple">
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMax slice" aria-hidden="true" className="scene-static">
          <TelescopeScene />
          <g transform={`translate(${EYE.x} ${EYE.y}) rotate(${TUBE_ANGLE})`}>
            <TelescopeTube />
          </g>
        </svg>
        <div className="hero-title">
          <Title count={count} />
        </div>
      </section>
      <section className="galaxy-block" id="sky">
        <Galaxy stars={stars} view={view} interactive paused={paused} reduce={reduce} bloom onOpen={onOpen} />
        <div className="hud-layer on">{hud}</div>
      </section>
    </>
  )
}

export default function Hero(props: Props) {
  if (props.simple) return <SimpleHero {...props} />
  return <ScrollHero {...props} />
}

function ScrollHero({ stars, view, reduce, paused, count, onOpen, hud }: Props) {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const sizeRef = useRef(size)
  sizeRef.current = size
  const [bloom, setBloom] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    setBloom(v > 0.34)
    setReady(v > 0.84)
  })

  // zoom progress 0..1 over the first stretch of the scroll, smoothed so wheel notches glide
  const raw = useTransform(scrollYProgress, [0.03, 0.8], [0, 1], { clamp: true })
  const t = useSpring(raw, { stiffness: 140, damping: 32, mass: 0.5 })

  const sceneTransform = useTransform(t, (v) => {
    const p = pan(v)
    return `translate(${p.x}px, ${p.y}px) scale(${Math.pow(MAX_ZOOM, v)}) translate(${-EYE.x}px, ${-EYE.y}px)`
  })
  const sceneOpacity = useTransform(t, [0.96, 0.99], [1, 0])
  const clip = useTransform(t, (v) => {
    const { w, h } = sizeRef.current
    const k = Math.max(w / VB_W, h / VB_H)
    const p = pan(v)
    const ex = (w - VB_W * k) / 2 + p.x * k
    const ey = (h - VB_H * k) / 2 + p.y * k
    const r = (HOLE_START + (HOLE_END - HOLE_START) * v) * Math.pow(MAX_ZOOM, v) * k
    return `circle(${r.toFixed(1)}px at ${ex.toFixed(1)}px ${ey.toFixed(1)}px)`
  })
  // focus pull: the galaxy arrives soft and slightly large, then settles
  const galaxyBlur = useTransform(t, [0.35, 0.96], [12, 0], { clamp: true })
  const galaxyFilter = useTransform(galaxyBlur, (b) => `blur(${b.toFixed(1)}px)`)
  const galaxyTransform = useTransform(t, (v) => `scale(${(1.28 - 0.28 * v).toFixed(4)})`)
  const titleOpacity = useTransform(scrollYProgress, [0, 0.1], [1, 0])
  const titleTransform = useTransform(scrollYProgress, [0, 0.1], [0, -36], { clamp: true })
  const titleMove = useTransform(titleTransform, (y) => `translateY(${y}px)`)

  // the telescope follows the cursor, a few degrees at most
  const aim = useMotionValue(0)
  const tilt = useSpring(aim, { stiffness: 70, damping: 14, mass: 0.8 })
  const onPointerMove = (e: React.PointerEvent) => {
    const { w, h } = sizeRef.current
    const k = Math.max(w / VB_W, h / VB_H)
    const ex = (w - VB_W * k) / 2 + EYE.x * k
    const ey = (h - VB_H * k) / 2 + EYE.y * k
    const ang = (Math.atan2(e.clientY - ey, e.clientX - ex) * 180) / Math.PI
    aim.set(Math.max(-5, Math.min(5, (ang - TUBE_ANGLE) * 0.1)))
  }

  const stage = useMemo(() => ({ height: '100dvh' }), [])
  return (
    <section ref={ref} className="hero-scroll" id="sky" onPointerMove={reduce ? undefined : onPointerMove}>
      <div className="stage" style={stage}>
        <motion.svg
          className="scene"
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
          style={{ opacity: sceneOpacity }}
        >
          <motion.g style={{ transform: sceneTransform }}>
            <SceneSvg tilt={tilt} />
          </motion.g>
        </motion.svg>
        <motion.div className="galaxy-clip" style={{ clipPath: clip }}>
          <motion.div className="galaxy-zoom" style={{ transform: galaxyTransform, filter: galaxyFilter }}>
            <Galaxy stars={stars} view={view} interactive={ready} paused={paused} reduce={reduce} bloom={bloom} onOpen={onOpen} />
          </motion.div>
        </motion.div>
        <motion.div className="hero-title" style={{ opacity: titleOpacity, transform: titleMove }}>
          <Title count={count} />
        </motion.div>
        <div className={ready ? 'hud-layer on' : 'hud-layer'}>{hud}</div>
      </div>
    </section>
  )
}
