import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { ArrowUp, GithubLogo } from '@phosphor-icons/react'
import DataCard from './components/DataCard'
import Hero, { HERO_REST } from './components/Hero'
import LandingOverlay from './components/LandingOverlay'
import Reel, { PART_SPLIT, reelIndexAt, reelSceneTop } from './components/Reel'
import ReplayViewer from './components/ReplayViewer'
import Results from './components/Results'
import SectionDots, { type Section } from './components/SectionDots'
import Starfield from './components/Starfield'
import { useStatic } from './data'
import { OUTCOME_LABEL, buildStars, demoLandings, outcomeOf, viewKey, type View } from './lib/model'
import { pickExamples, type Example } from './lib/tour'
import type { Site } from './types'

const SECTIONS: Section[] = [
  { id: 'sky', label: 'The sky' },
  { id: 'story', label: 'How a probe sees' },
  { id: 'scenes', label: 'Three landings' },
  { id: 'results', label: 'Results' },
]

const DEMO_SITE: Site = { extent_m: [48, 48], res_m: 0.05, target: [0, 0], target_clearance_m: 2 }
const HASH = /^#\/landing\/(\d+)$/

function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 899px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 899px)')
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return narrow
}

function seedFromHash(): number | null {
  const m = location.hash.match(HASH)
  return m ? Number(m[1]) : null
}

export default function App() {
  const reduce = !!useReducedMotion()
  const narrow = useNarrow()
  const data = useStatic()
  const demo = data.loaded && data.landings.length === 0
  const points = useMemo(() => (demo ? demoLandings() : data.landings), [demo, data.landings])
  const site = demo ? DEMO_SITE : data.site
  const stars = useMemo(() => buildStars(points, data.index), [points, data.index])
  const examples = useMemo(() => pickExamples(stars), [stars])
  const sorted = useMemo(() => stars.map((s) => s.seed).sort((a, b) => a - b), [stars])

  const [view, setView] = useState<View>({ prior: 'complete', detector: false })
  const [open, setOpen] = useState<{ seed: number; origin: { x: number; y: number } } | null>(() => {
    const s = seedFromHash()
    return s === null ? null : { seed: s, origin: { x: window.innerWidth / 2, y: window.innerHeight / 2 } }
  })
  const [replayTitle, setReplayTitle] = useState<string | null>(null)
  // the landing picker: slider and number box share one pick, which rings a star in the galaxy
  const [pickIdx, setPickIdx] = useState<number | null>(null)
  const [pickText, setPickText] = useState('')
  const highlightPos = useRef<{ x: number; y: number } | null>(null)
  const pickSeed = pickIdx === null ? null : sorted[pickIdx]

  const centre = () => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 })

  const openSeed = useCallback((seed: number, origin: { x: number; y: number }) => {
    setReplayTitle(null)
    setOpen({ seed, origin })
    history.pushState(null, '', `#/landing/${seed}`)
  }, [])

  const close = useCallback(() => {
    setOpen(null)
    if (HASH.test(location.hash)) history.replaceState(null, '', location.pathname + location.search)
  }, [])

  useEffect(() => {
    const on = () => {
      const s = seedFromHash()
      if (s === null) setOpen(null)
      else setOpen({ seed: s, origin: { x: window.innerWidth / 2, y: window.innerHeight / 2 } })
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const openExample = (ex: Example) => {
    setView(ex.view)
    openSeed(ex.seed, centre())
  }

  const goto = useCallback(
    (id: string) => {
      const behavior: ScrollBehavior = reduce ? 'auto' : 'smooth'
      const el = document.getElementById(id === 'scenes' ? 'story' : id)
      if (!el) return
      if (id === 'sky' && !narrow) {
        // land where the galaxy is fully revealed, not at the telescope
        const top = el.getBoundingClientRect().top + window.scrollY
        window.scrollTo({ top: top + (el.offsetHeight - window.innerHeight) * HERO_REST, behavior })
      } else if (id === 'story' || id === 'scenes') {
        window.scrollTo({ top: reelSceneTop(el, id === 'story' ? 0 : PART_SPLIT), behavior })
      } else el.scrollIntoView({ behavior, block: 'start' })
    },
    [reduce, narrow],
  )

  // which side dot is lit: decided from the real scroll position, including which scene of the reel is showing
  const [active, setActive] = useState('sky')
  const computeActive = useCallback(() => {
    const reel = document.getElementById('story')
    const res = document.getElementById('results')
    if (!reel) return 'sky'
    const y = window.scrollY
    const reelTop = reel.getBoundingClientRect().top + y
    if (y + window.innerHeight * 0.5 < reelTop) return 'sky'
    if (res && y + window.innerHeight * 0.5 >= res.getBoundingClientRect().top + y) return 'results'
    return reelIndexAt(reel, y) < PART_SPLIT ? 'story' : 'scenes'
  }, [])

  const pickNearest = (n: number) => {
    let lo = 0
    let hi = sorted.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (sorted[mid] < n) lo = mid + 1
      else hi = mid
    }
    if (lo > 0 && n - sorted[lo - 1] < sorted[lo] - n) lo -= 1
    return lo
  }

  const openStar = open ? stars.find((s) => s.seed === open.seed) : undefined
  const { scrollY } = useScroll()
  const barOpacity = useTransform(scrollY, [160, 360], [0, 1])
  useMotionValueEvent(scrollY, 'change', () => setActive(computeActive()))
  useEffect(() => setActive(computeActive()), [computeActive, stars.length])
  const max = sorted.length ? sorted[sorted.length - 1] : 0

  const hud = (
    <div className="hud">
      <div className="hud-controls">
        <span className="seg" role="group" aria-label="Ground hazard map">
          <button type="button" className={view.prior === 'complete' ? 'on' : ''} onClick={() => setView({ ...view, prior: 'complete' })}>complete map</button>
          <button type="button" className={view.prior === 'stale' ? 'on' : ''} onClick={() => setView({ ...view, prior: 'stale' })}>stale map</button>
        </span>
        <span className="seg" role="group" aria-label="Neural hazard detector">
          <button type="button" className={!view.detector ? 'on' : ''} onClick={() => setView({ ...view, detector: false })}>baseline</button>
          <button type="button" className={view.detector ? 'on' : ''} onClick={() => setView({ ...view, detector: true })}>+ detector</button>
        </span>
        {demo && <span className="sample hot">sample data</span>}
      </div>
      <div className="picker">
        <label htmlFor="landing-slider">Landing</label>
        <input
          id="landing-slider"
          className="slider"
          type="range"
          min={0}
          max={Math.max(0, sorted.length - 1)}
          step={1}
          value={pickIdx ?? 0}
          onChange={(e) => {
            const i = Number(e.target.value)
            setPickIdx(i)
            setPickText(String(sorted[i]))
          }}
          aria-valuetext={pickSeed === null ? 'none chosen' : `landing ${pickSeed}`}
        />
        <input
          className="seed-box"
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          placeholder={`0 to ${max}`}
          value={pickText}
          aria-label={`Landing number, 0 to ${max}`}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') {
              setPickText('')
              setPickIdx(null)
              return
            }
            const n = Math.floor(Number(raw))
            if (Number.isNaN(n) || !sorted.length) return
            const capped = Math.max(sorted[0], Math.min(max, n))
            const i = pickNearest(capped)
            setPickIdx(i)
            setPickText(String(capped === n ? raw : capped))
          }}
          onBlur={() => pickSeed !== null && setPickText(String(pickSeed))}
        />
        {pickSeed !== null && (
          <button type="button" className="primary open-btn" onClick={() => openSeed(pickSeed, highlightPos.current ?? centre())}>
            Open
          </button>
        )}
      </div>
    </div>
  )

  const outcome = openStar ? outcomeOf(openStar.point, viewKey(view)) : null

  return (
    <>
      <Starfield paused={!!open} />

      <motion.header className="top" style={{ opacity: barOpacity }}>
        <a className="brand" href="#sky" onClick={(e) => { e.preventDefault(); goto('sky') }}>TouchDown</a>
        <a className="gh" href="https://github.com/aryanyaksh-art/touch_down" aria-label="Source code on GitHub">
          <GithubLogo size={20} />
        </a>
      </motion.header>

      <SectionDots sections={SECTIONS} active={active} onGo={goto} />
      <button type="button" className="to-galaxy" data-show={active !== 'sky'} tabIndex={active === 'sky' ? -1 : 0} onClick={() => goto('sky')}>
        <ArrowUp size={16} /> Back to the galaxy
      </button>

      <main>
        <Hero
          stars={stars}
          view={view}
          reduce={reduce}
          paused={!!open}
          simple={narrow || reduce}
          count={stars.length || 1000}
          onOpen={openSeed}
          hud={hud}
          highlightSeed={pickSeed}
          highlightPos={highlightPos}
        />

        <Reel
          narrow={narrow}
          onExample={(kind) => {
            const ex = examples[kind]
            if (ex) openExample(ex)
          }}
        />

        <div className="content">
          <Results summary={demo ? null : data.summary} points={points} sample={demo} />
        </div>
      </main>

      <footer>Independent educational recreation. Not affiliated with NASA. Terrain: NASA OSIRIS-REx Laser Altimeter shape models.</footer>

      <AnimatePresence>
        {open && openStar && (
          <LandingOverlay
            key="overlay"
            origin={open.origin}
            reduce={reduce}
            onClose={close}
            contentKey={open.seed}
            direction={1}
            header={
              <div className="overlay-head">
                <h2>{replayTitle ?? `Landing ${openStar.seed}`}</h2>
                <p className="dim">
                  {replayTitle ? `Landing ${openStar.seed}. ` : ''}
                  {outcome ? OUTCOME_LABEL[outcome] : ''}.
                </p>
              </div>
            }
          >
            {openStar.replayId && site && data.site ? (
              <ReplayViewer id={openStar.replayId} site={data.site} onLoaded={(r) => setReplayTitle(r.title)} />
            ) : (
              <DataCard star={openStar} picture={data.pictures.has(openStar.seed)} detector={data.pictureDetector} />
            )}
          </LandingOverlay>
        )}
      </AnimatePresence>
    </>
  )
}
