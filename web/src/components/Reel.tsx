import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { ArrowCounterClockwise, ArrowRight } from '@phosphor-icons/react'
import { SCENES } from './Story'
import { EASE_IN_OUT } from '../lib/motion'
import { STAR_COLORS, mulberry32 } from '../lib/model'
import './story.css'

// One pinned full-screen stage for all seven animations. A little scrolling moves from one scene to the next;
// scenes hand over with a wipe and restart from the beginning each time you arrive.
export const SCENE_COUNT = SCENES.length
export const PART_SPLIT = SCENES.findIndex((s) => s.part === 'Three landings')
const SCENE_VH = 70 // scroll length per scene, in viewport heights

/** Page scroll position that shows scene i of the reel whose container is `el`. */
export function reelSceneTop(el: HTMLElement, i: number): number {
  const top = el.getBoundingClientRect().top + window.scrollY
  return top + ((i + 0.5) / SCENE_COUNT) * (el.offsetHeight - window.innerHeight)
}

/** Which scene is showing at page scroll `y`, clamped. */
export function reelIndexFrom(top: number, height: number, viewportH: number, y: number): number {
  const p = (y - top) / Math.max(1, height - viewportH)
  return Math.max(0, Math.min(SCENE_COUNT - 1, Math.floor(p * SCENE_COUNT)))
}

export function reelIndexAt(el: HTMLElement, y: number): number {
  return reelIndexFrom(el.getBoundingClientRect().top + window.scrollY, el.offsetHeight, window.innerHeight, y)
}

function SkyDots() {
  const dots = useMemo(() => {
    const rng = mulberry32(11)
    return Array.from({ length: 170 }, () => ({ x: -100 + rng() * 1000, y: -300 + rng() * 630, r: 0.5 + rng() * 1.2, c: STAR_COLORS[Math.floor(rng() * STAR_COLORS.length)], o: 0.4 + rng() * 0.6 }))
  }, [])
  return (
    <g aria-hidden="true">
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={d.c} opacity={d.o} />
      ))}
    </g>
  )
}

type Kind = 'clean' | 'back' | 'old'

function SceneLayer({ index, narrow, reduce, onExample, has }: { index: number; narrow: boolean; reduce: boolean; onExample: (kind: Kind) => void; has: (kind: Kind) => boolean }) {
  const scene = SCENES[index]
  const [go, setGo] = useState(false)
  const [run, setRun] = useState(0)
  // wait for the wipe to settle before the scene starts moving
  useEffect(() => {
    const t = setTimeout(() => setGo(true), reduce ? 0 : 450)
    return () => clearTimeout(t)
  }, [reduce])

  return (
    <>
      <svg
        key={run}
        viewBox={narrow ? scene.narrow : '0 0 800 450'}
        preserveAspectRatio={narrow ? 'xMidYMax meet' : 'xMidYMax slice'}
        className={go ? 'beat-svg go' : 'beat-svg'}
        role="img"
        aria-label={scene.label}
      >
        <SkyDots />
        {scene.render()}
      </svg>
      <div className="reel-caption">
        <h2>{scene.title ?? scene.line}</h2>
        {scene.title && <p className="dim">{scene.line}</p>}
      </div>
      <div className="reel-actions">
        {scene.example && has(scene.example) && (
          <button type="button" className="ghost" onClick={() => onExample(scene.example!)}>
            See a real one <ArrowRight size={14} />
          </button>
        )}
        <button type="button" className="anim-replay" aria-label={`Replay: ${scene.label}`} onClick={() => { setRun((r) => r + 1); setGo(true) }}>
          <ArrowCounterClockwise size={16} />
        </button>
      </div>
    </>
  )
}

export default function Reel({ narrow, onExample, has }: { narrow: boolean; onExample: (kind: Kind) => void; has: (kind: Kind) => boolean }) {
  const ref = useRef<HTMLElement>(null)
  const reduce = !!useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  const [idx, setIdx] = useState(0)
  const [dir, setDir] = useState(1)
  const prev = useRef(0)
  const fill = useTransform(scrollYProgress, (v) => `scaleX(${Math.max(0, Math.min(1, v)).toFixed(4)})`)

  useMotionValueEvent(scrollYProgress, 'change', (p) => {
    const i = Math.max(0, Math.min(SCENE_COUNT - 1, Math.floor(p * SCENE_COUNT)))
    if (i !== prev.current) {
      setDir(i > prev.current ? 1 : -1)
      prev.current = i
      setIdx(i)
    }
  })

  // left and right arrow keys step through the scenes while the reel is on screen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
      const el = ref.current
      if (!el || document.querySelector('.overlay')) return
      const r = el.getBoundingClientRect()
      if (r.top > 0 || r.bottom < window.innerHeight) return // only while the pinned stage fills the screen
      const target = Math.max(0, Math.min(SCENE_COUNT - 1, prev.current + (e.key === 'ArrowRight' ? 1 : -1)))
      if (target === prev.current) return
      e.preventDefault()
      window.scrollTo({ top: reelSceneTop(el, target), behavior: reduce ? 'auto' : 'smooth' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reduce])

  const scene = SCENES[idx]
  const partStart = scene.part === 'How a probe sees' ? 0 : PART_SPLIT
  const partCount = scene.part === 'How a probe sees' ? PART_SPLIT : SCENE_COUNT - PART_SPLIT

  return (
    <section ref={ref} className="reel" id="story" style={{ height: `calc(100dvh + ${SCENE_COUNT * SCENE_VH}vh)` }}>
      <div className="reel-stage">
        <AnimatePresence initial={false} custom={dir}>
          <motion.div
            key={idx}
            className="reel-scene"
            custom={dir}
            variants={{
              enter: (d: number) => (reduce ? { opacity: 0 } : { clipPath: d > 0 ? 'inset(0 100% 0 0)' : 'inset(0 0 0 100%)' }),
              center: reduce ? { opacity: 1 } : { clipPath: 'inset(0 0% 0 0%)' },
              exit: { opacity: 0.999 },
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: reduce ? 0.45 : 0.75, ease: EASE_IN_OUT }}
          >
            <SceneLayer index={idx} narrow={narrow} reduce={reduce} onExample={onExample} has={has} />
          </motion.div>
        </AnimatePresence>
        <div className="reel-part" aria-live="polite">
          {scene.part} <span className="dim">{idx - partStart + 1} of {partCount}</span>
        </div>
        <div className="reel-progress" aria-hidden="true">
          <motion.div className="reel-progress-fill" style={{ transform: fill }} />
          {Array.from({ length: SCENE_COUNT - 1 }, (_, i) => (
            <span key={i} className={i + 1 === PART_SPLIT ? 'tick part' : 'tick'} style={{ left: `${((i + 1) / SCENE_COUNT) * 100}%` }} />
          ))}
        </div>
      </div>
    </section>
  )
}
