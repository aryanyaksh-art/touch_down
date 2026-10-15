import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { useReducedMotion } from 'motion/react'
import Rig from './scene/Rig'
import Lights from './scene/Lights'
import Sky from './scene/Sky'
import Ground from './scene/Ground'
import Telescope from './scene/Telescope'
import Meteors from './scene/Meteors'
import Galaxy from './scene/Galaxy'
import { DriftRocks, HeroAsteroid } from './scene/Asteroid'
import Caption from './ui/Caption'
import StepButtons from './ui/StepButtons'
import Loader from './ui/Loader'
import { CAPTIONS, STEP_COUNT, STEP_SECONDS } from './timeline'
import { isLiteDevice, stage } from './stage'
import './home.css'

const asset = (p: string) => `${import.meta.env.BASE_URL}assets/${p}`

const STATUS = [
  'A telescope on a dark hill under the night sky, with meteors falling.',
  'The camera pushes in toward the meteor shower.',
  'The camera pulls back to the telescope.',
  'The camera flies into the eyepiece and an asteroid streaks across the stars.',
  'The camera follows the asteroid and reveals a spiral galaxy.',
]

function maxTextureSize() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl')
    return gl ? (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) : 4096
  } catch {
    return 4096
  }
}

function ReadySignal({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    // two frames after mount, so the first picture is already on screen when the loader lifts
    const id = requestAnimationFrame(() => requestAnimationFrame(onReady))
    return () => cancelAnimationFrame(id)
  }, [onReady])
  return null
}

export default function HomeExperience() {
  const reduce = !!useReducedMotion()
  const lite = useMemo(() => isLiteDevice(), [])
  const sharp = useMemo(() => !lite && maxTextureSize() >= 8192, [lite])
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [fading, setFading] = useState(false)
  const [ready, setReady] = useState(false)
  const stepRef = useRef(0)
  const run = useRef<{ stop: () => void; finish: () => void } | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const ring = useRef<HTMLDivElement>(null)
  const black = useRef<HTMLDivElement>(null)

  useEffect(() => {
    stage.wrap = wrap.current
    stage.ring = ring.current
    stage.black = black.current
    stage.lite = lite
    document.documentElement.classList.add('home-lock')
    return () => {
      document.documentElement.classList.remove('home-lock')
      stage.wrap = stage.ring = stage.black = null
    }
  }, [lite])

  // ready when every texture and model has arrived (the signal mounts last, so only after everything above it has resolved); after
  // a generous wait the page opens anyway, so a failed file never traps the visitor
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 25000)
    return () => window.clearTimeout(t)
  }, [])

  const finishTo = useCallback((to: number) => {
    stage.t = to
    stepRef.current = to
    run.current = null
    setStep(to)
    setPlaying(false)
  }, [])

  const go = useCallback(
    (to: number) => {
      // a second click while a move is playing skips to the end of it
      if (run.current) {
        run.current.stop()
        run.current.finish()
        return
      }
      const from = stepRef.current
      if (to < 0 || to > STEP_COUNT || to === from) return
      setPlaying(true)
      if (reduce) {
        // no camera moves: a quick cross-fade through black between the still frames
        setFading(true)
        const id = window.setTimeout(() => {
          finishTo(to)
          setFading(false)
        }, 260)
        run.current = { stop: () => window.clearTimeout(id), finish: () => (finishTo(to), setFading(false)) }
        return
      }
      const seconds = STEP_SECONDS[Math.max(from, to) - 1] * (to < from ? 0.7 : 1)
      // a plain requestAnimationFrame tween of the timeline value; the camera poses carry their own easing
      const start = performance.now()
      const t0 = stage.t
      let raf = 0
      const tick = (now: number) => {
        const k = Math.min(1, (now - start) / (seconds * 1000))
        stage.t = t0 + (to - t0) * k
        if (k < 1) raf = requestAnimationFrame(tick)
        else finishTo(to)
      }
      raf = requestAnimationFrame(tick)
      run.current = { stop: () => cancelAnimationFrame(raf), finish: () => finishTo(to) }
    },
    [reduce, finishTo],
  )

  const forward = useCallback(() => go(stepRef.current + 1), [go])
  const back = useCallback(() => go(stepRef.current - 1), [go])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        forward()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        back()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [forward, back])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __home?: unknown }
    w.__home = { setT: (t: number) => (stage.t = t), go, get t() { return stage.t } }
    return () => {
      delete w.__home
    }
  }, [go])

  return (
    <main className="home">
      <div className="stage-wrap" ref={wrap}>
        <Canvas
          dpr={lite ? [1, 1.25] : [1, 1.75]}
          camera={{ fov: 42, near: 0.05, far: 6000, position: [0, 1.22, 5.5] }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          aria-hidden="true"
        >
          <color attach="background" args={['#020203']} />
          <Rig />
          <Lights />
          <Suspense fallback={null}>
            <Sky url={asset('sky/starmap_4k.webp')} hiUrl={sharp ? asset('sky/starmap_8k.webp') : undefined} />
            <Ground />
            <Telescope />
            <Meteors count={lite ? 52 : 100} />
            <HeroAsteroid url={asset('models/bennu.glb')} />
            <DriftRocks url={asset('models/bennu.glb')} />
            <Galaxy lite={lite} />
            <ReadySignal onReady={() => setReady(true)} />
          </Suspense>
        </Canvas>
      </div>
      <div className="iris-ring" ref={ring} aria-hidden="true" />
      <div className="blackout" ref={black} aria-hidden="true" />
      <div className="fadeout" data-on={fading} aria-hidden="true" />

      <Caption text={playing ? null : CAPTIONS[step]} reduce={reduce} />
      <StepButtons canBack={step > 0} canForward={step < STEP_COUNT} playing={playing} onBack={back} onForward={forward} />
      <Loader ready={ready} />
      <p className="sr-only" role="status">
        {STATUS[step]}
      </p>
    </main>
  )
}
