import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, useMotionValue, useMotionValueEvent, useScroll, useSpring, useTransform, type MotionValue } from 'motion/react'
import Galaxy from './Galaxy'
import { SurfaceArt } from './Surface'
import { EYE, FOCUS, TUBE_ANGLE, TelescopeScene, TelescopeTube, VB_H, VB_W } from './Telescope'
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
  highlightSeed: number | null
  highlightPos: { current: { x: number; y: number } | null }
}

const MAX_ZOOM = 60
const HOLE_START = 11 // lens hole radius in scene units, matches the blue lens
const HOLE_END = 34

// Scroll phases, as fractions of the hero's scroll length
const ZOOM_FROM = 0.02 // telescope zoom runs ZOOM_FROM to ZOOM_TO (about two screens of scrolling)
const ZOOM_TO = 0.5
const READY_FROM = 0.52 // the galaxy can be explored between READY_FROM and READY_TO
const READY_TO = 0.66
const DIVE_FROM = 0.67 // then the camera dives into the galaxy core and lands on the asteroid
const DIVE_TO = 0.95
/** where the page rests when you jump to the galaxy (middle of the explore window) */
export const HERO_REST = (READY_FROM + READY_TO) / 2
const DIVE_ZOOM = 14

function Title({ count }: { count: number }) {
  return (
    <>
      <h1>TouchDown</h1>
      <p>
        A spacecraft lands on an asteroid by itself. {count === 1 ? 'Here is 1 simulated landing' : `Here are ${count.toLocaleString()} simulated landings`} at Bennu, one star each.
      </p>
    </>
  )
}

function SceneSvg({ tilt, fade }: { tilt: MotionValue<number>; fade: MotionValue<number> }) {
  const tiltStyle = useTransform(tilt, (v) => `translate(${EYE.x}px, ${EYE.y}px) rotate(${v}deg) translate(${-EYE.x}px, ${-EYE.y}px)`)
  return (
    <>
      {/* everything but the lens fades out in the first moments of the zoom, so only the dot swells */}
      <motion.g style={{ opacity: fade }}>
        <TelescopeScene />
        <motion.g style={{ transform: tiltStyle }}>
          <g transform={`translate(${EYE.x} ${EYE.y}) rotate(${TUBE_ANGLE})`}>
            <TelescopeTube />
          </g>
        </motion.g>
      </motion.g>
      <circle cx={FOCUS.x} cy={FOCUS.y} r={11} fill="#8da2ff" />
    </>
  )
}

/** Phones and reduced motion: a still picture, then the galaxy below it. No scroll zoom. */
function SimpleHero({ stars, view, reduce, paused, count, onOpen, hud, highlightSeed, highlightPos }: Props) {
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
        <Galaxy stars={stars} view={view} interactive paused={paused} reduce={reduce} bloom highlightSeed={highlightSeed} highlightPos={highlightPos} onOpen={onOpen} />
        <div className="hud-layer on">{hud}</div>
      </section>
    </>
  )
}

export default function Hero(props: Props) {
  if (props.simple) return <SimpleHero {...props} />
  return <ScrollHero {...props} />
}

function ScrollHero({ stars, view, reduce, paused, count, onOpen, hud, highlightSeed, highlightPos }: Props) {
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
    setBloom(v > 0.36)
    setReady(v > READY_FROM && v < READY_TO)
  })

  // telescope zoom progress 0..1, smoothed so wheel notches glide
  const raw = useTransform(scrollYProgress, [ZOOM_FROM, ZOOM_TO], [0, 1], { clamp: true })
  const t = useSpring(raw, { stiffness: 140, damping: 32, mass: 0.5 })
  // dive progress 0..1
  const diveRaw = useTransform(scrollYProgress, [DIVE_FROM, DIVE_TO], [0, 1], { clamp: true })
  const u = useSpring(diveRaw, { stiffness: 120, damping: 30, mass: 0.5 })

  // pure zoom about the blue lens: the picture never slides, it just pushes in
  const sceneTransform = useTransform(
    t,
    (v) => `translate(${FOCUS.x}px, ${FOCUS.y}px) scale(${Math.pow(MAX_ZOOM, v)}) translate(${-FOCUS.x}px, ${-FOCUS.y}px)`,
  )
  const sceneOpacity = useTransform(t, [0.96, 0.99], [1, 0])
  const teleFade = useTransform(t, [0, 0.16], [1, 0], { clamp: true })
  const clip = useTransform(t, (v) => {
    const { w, h } = sizeRef.current
    const k = Math.max(w / VB_W, h / VB_H)
    const ex = (w - VB_W * k) / 2 + FOCUS.x * k
    const ey = (h - VB_H * k) / 2 + FOCUS.y * k
    const r = (HOLE_START + (HOLE_END - HOLE_START) * v) * Math.pow(MAX_ZOOM, v) * k
    return `circle(${r.toFixed(1)}px at ${ex.toFixed(1)}px ${ey.toFixed(1)}px)`
  })
  // the galaxy arrives soft and slightly large, settles, then we dive into its core
  const galaxyTransform = useTransform([t, u], ([tv, uv]: number[]) => `scale(${((1.28 - 0.28 * tv) * Math.pow(DIVE_ZOOM, uv)).toFixed(4)})`)
  const galaxyFilter = useTransform([t, u], ([tv, uv]: number[]) => {
    const focus = 12 * (1 - Math.min(1, Math.max(0, (tv - 0.35) / 0.61)))
    return `blur(${(focus + 5 * uv).toFixed(1)}px)`
  })
  const galaxyOpacity = useTransform(u, [0.74, 0.96], [1, 0])
  // the asteroid surface rises as the glow fades
  const surfaceRise = useTransform(u, [0.5, 1], [22, 0], { clamp: true })
  const surfaceMove = useTransform(surfaceRise, (y) => `translateY(${y.toFixed(2)}%)`)
  const surfaceOpacity = useTransform(u, [0.5, 0.9], [0, 1])
  const titleOpacity = useTransform(scrollYProgress, [0, 0.07], [1, 0])
  const titleY = useTransform(scrollYProgress, [0, 0.07], [0, -36], { clamp: true })
  const titleMove = useTransform(titleY, (y) => `translateY(${y}px)`)

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

  return (
    <section ref={ref} className="hero-scroll" id="sky" onPointerMove={reduce ? undefined : onPointerMove}>
      <div className="stage">
        <motion.svg className="scene" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{ opacity: sceneOpacity }}>
          <motion.g style={{ transform: sceneTransform }}>
            <SceneSvg tilt={tilt} fade={teleFade} />
          </motion.g>
        </motion.svg>
        <motion.div className="galaxy-clip" style={{ clipPath: clip, opacity: galaxyOpacity }}>
          <motion.div className="galaxy-zoom" style={{ transform: galaxyTransform, filter: galaxyFilter }}>
            <Galaxy
              stars={stars}
              view={view}
              interactive={ready}
              paused={paused}
              reduce={reduce}
              bloom={bloom}
              highlightSeed={highlightSeed}
              highlightPos={highlightPos}
              onOpen={onOpen}
            />
          </motion.div>
        </motion.div>
        <motion.svg
          className="surface"
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="xMidYMax slice"
          aria-hidden="true"
          style={{ opacity: surfaceOpacity, transform: surfaceMove }}
        >
          <SurfaceArt />
        </motion.svg>
        <motion.div className="hero-title" style={{ opacity: titleOpacity, transform: titleMove }}>
          <Title count={count} />
        </motion.div>
        <div className={ready ? 'hud-layer on' : 'hud-layer'}>{hud}</div>
      </div>
    </section>
  )
}
