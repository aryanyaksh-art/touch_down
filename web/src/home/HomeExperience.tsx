import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { AnimatePresence, useReducedMotion } from 'motion/react'
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
import GalaxyControls from './ui/GalaxyControls'
import LandingView from './ui/LandingView'
import StoryIntro from './ui/StoryIntro'
import StoryUI from './story/StoryUI'
import StoryWorld, { PROBE_URL, TERRAIN_URL } from './story/StoryWorld'
import { useStory } from './story/useStory'
import { SCENES } from './story/script'
import { buildStars, type View } from '../lib/model'
import { pickExamples } from '../lib/tour'
import { useOrbit } from './useOrbit'
import { useStatic } from '../data'
import { CAPTIONS, STEP_COUNT, STEP_SECONDS } from './timeline'
import { isLiteDevice, stage } from './stage'
import './home.css'

const asset = (p: string) => `${import.meta.env.BASE_URL}assets/${p}`
const HASH = /^#\/landing\/(\d+)$/

const STATUS = [
  'A telescope on a dark hill under the night sky, with meteors falling.',
  'The camera pushes in toward the meteor shower.',
  'The camera pulls back to the telescope.',
  'A spiral galaxy. Drag to turn it, scroll to zoom, pick a landing to open, or watch the story.',
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
  const data = useStatic()
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [fading, setFading] = useState(false)
  const [ready, setReady] = useState(false)
  const [screen, setScreen] = useState<'home' | 'story'>('home')
  const [openSeed, setOpenSeed] = useState<number | null>(null)
  const [openView, setOpenView] = useState<View | undefined>(undefined)
  const [storyReady, setStoryReady] = useState(false)
  const stepRef = useRef(0)
  const run = useRef<{ stop: () => void; finish: () => void } | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const ring = useRef<HTMLDivElement>(null)
  const black = useRef<HTMLDivElement>(null)
  const flash = useRef<HTMLDivElement>(null)
  const story = useStory(reduce)
  const examples = useMemo(() => pickExamples(buildStars(data.landings, data.index)), [data.landings, data.index])

  useEffect(() => {
    stage.wrap = wrap.current
    stage.ring = ring.current
    stage.black = black.current
    stage.flash = flash.current
    stage.lite = lite
    document.documentElement.classList.add('home-lock')
    return () => {
      document.documentElement.classList.remove('home-lock')
      stage.wrap = stage.ring = stage.black = stage.flash = null
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
      const seconds = STEP_SECONDS[Math.max(from, to) - 1] * (to < from ? 0.6 : 1)
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

  const onHome = screen === 'home'
  const atGalaxy = onHome && step === STEP_COUNT && !playing
  const landing = openSeed === null ? null : (data.landings.find((l) => l.seed === openSeed) ?? null)

  // the galaxy can be turned and zoomed once the intro has finished and nothing sits on top of it
  useOrbit(wrap, atGalaxy && !landing, reduce)

  const crossfade = useCallback(
    (change: () => void) => {
      if (reduce) return change()
      setFading(true)
      window.setTimeout(() => {
        change()
        window.setTimeout(() => setFading(false), 60)
      }, 260)
    },
    [reduce],
  )

  const open = useCallback((landingNumber: number, view?: View) => {
    setOpenView(view)
    setOpenSeed(landingNumber - 1)
    history.replaceState(null, '', `#/landing/${landingNumber}`)
  }, [])
  const close = useCallback(() => {
    setOpenSeed(null)
    if (HASH.test(location.hash)) history.replaceState(null, '', location.pathname + location.search)
  }, [])

  // a link to a landing (#/landing/42) skips the intro and opens it over the galaxy
  useEffect(() => {
    const m = HASH.exec(location.hash)
    if (!m) return
    stage.t = STEP_COUNT
    stepRef.current = STEP_COUNT
    setStep(STEP_COUNT)
    setOpenSeed(Number(m[1]) - 1)
  }, [])

  const toStory = useCallback(() => {
    crossfade(() => {
      stage.mode = 'story'
      setScreen('story')
    })
  }, [crossfade])
  const fromStory = useCallback(() => {
    crossfade(() => {
      story.reset()
      stage.mode = 'home'
      setScreen('home')
    })
  }, [crossfade, story])
  const startStory = useCallback(() => crossfade(() => story.start()), [crossfade, story])
  const seeReal = useCallback(() => {
    const ex = SCENES[story.scene].example
    const e = ex ? examples[ex] : null
    if (e) open(e.seed + 1, e.view)
  }, [story.scene, examples, open])

  // warm the story's two models while the visitor is looking at the galaxy, so "Watch the story" starts at once
  useEffect(() => {
    if (!atGalaxy) return
    useLoader.preload(GLTFLoader, TERRAIN_URL)
    useLoader.preload(GLTFLoader, PROBE_URL)
  }, [atGalaxy])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !onHome || landing) return
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
  }, [forward, back, onHome, landing])

  // keys inside the story: right and space go on, left goes back, escape leaves
  useEffect(() => {
    if (screen !== 'story' || landing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Escape') {
        e.preventDefault()
        fromStory()
      } else if (!story.started) {
        return
      } else if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        story.next()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        story.prev()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [screen, landing, story, fromStory])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __home?: unknown }
    w.__home = { setT: (t: number) => (stage.t = t), go, jump: finishTo, get t() { return stage.t }, toStory, fromStory, story, startStory, storyAt: story.debugSet, stage }
    return () => {
      delete w.__home
    }
  }, [go, finishTo, toStory, fromStory, story, startStory])

  return (
    <main className="home" data-screen={screen} data-explore={atGalaxy}>
      <div className="stage-wrap" ref={wrap}>
        <Canvas
          dpr={lite ? [1, 1.25] : [1, 1.75]}
          shadows="soft"
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
            {screen === 'story' && (
              <Suspense fallback={null}>
                <StoryWorld onReady={() => setStoryReady(true)} />
              </Suspense>
            )}
            <ReadySignal onReady={() => setReady(true)} />
          </Suspense>
        </Canvas>
      </div>
      <div className="iris-ring" ref={ring} aria-hidden="true" />
      <div className="blackout" ref={black} aria-hidden="true" />
      <div className="flash" ref={flash} aria-hidden="true" />

      {onHome && <Caption text={playing ? null : CAPTIONS[step]} reduce={reduce} />}
      {onHome && !landing && <StepButtons canBack={step > 0} canForward={step < STEP_COUNT} playing={playing} onBack={back} onForward={forward} />}
      {atGalaxy && !landing && <GalaxyControls count={data.landings.length} disabled={!data.loaded} onOpen={open} onStory={toStory} />}
      {screen === 'story' && !story.started && <StoryIntro reduce={reduce} ready={storyReady} onBack={fromStory} onStart={startStory} />}
      {screen === 'story' && story.started && !landing && (
        <StoryUI
          scene={story.scene}
          line={story.line}
          playing={story.playing}
          done={story.done}
          reduce={reduce}
          canSeeReal={!!(SCENES[story.scene].example && examples[SCENES[story.scene].example!])}
          onPrev={story.prev}
          onNext={story.next}
          onReplay={story.replay}
          onExit={fromStory}
          onSeeReal={seeReal}
        />
      )}

      <AnimatePresence>
        {landing && (
          <LandingView
            key={landing.seed}
            point={landing}
            replayId={data.index.find((e) => e.seed === landing.seed)?.id ?? null}
            site={data.site}
            initialView={openView}
            hasPicture={data.pictures.has(landing.seed)}
            pictureDetector={data.pictureDetector}
            reduce={reduce}
            onClose={close}
          />
        )}
      </AnimatePresence>

      {((atGalaxy && !landing) || (screen === 'story' && !story.started)) && (
        <p className="credits">Sky: NASA SVS Deep Star Maps. Bennu: NASA SVS and the OSIRIS-REx team. Probe: NASA VTAD.</p>
      )}
      <div className="fadeout" data-on={fading} aria-hidden="true" />
      <Loader ready={ready} />
      <p className="sr-only" role="status">
        {screen === 'story' ? 'The story begins on a plain night sky.' : STATUS[step]}
      </p>
    </main>
  )
}
