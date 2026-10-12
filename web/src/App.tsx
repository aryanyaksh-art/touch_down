import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { ArrowUp, GithubLogo } from '@phosphor-icons/react'
import DataCard from './components/DataCard'
import Hero, { HERO_REST } from './components/Hero'
import LandingOverlay from './components/LandingOverlay'
import ErrorBoundary from './components/ErrorBoundary'
import Reel, { PART_SPLIT, reelIndexFrom, reelSceneTop } from './components/Reel'
import ReplayViewer from './components/ReplayViewer'
import Results from './components/Results'
import SectionDots, { type Section } from './components/SectionDots'
import Starfield from './components/Starfield'
import { useStatic } from './data'
import { OUTCOME_LABEL, buildStars, demoLandings, landingNo, outcomeOf, viewKey, type View } from './lib/model'
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
  // the hash carries the displayed landing number (1 to N); the code uses seeds (0 to N-1)
  return m ? Number(m[1]) - 1 : null
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
    history.pushState(null, '', `#/landing/${landingNo(seed)}`)
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

  // which side dot is lit: decided from the real scroll position, including which scene of the reel is showing.
  // The section positions are measured once (and again on resize or layout change) instead of on every scroll frame.
  const [active, setActive] = useState('sky')
  const geo = useRef<{ reelTop: number; reelH: number; resTop: number } | null>(null)
  const measure = useCallback(() => {
    const reel = document.getElementById('story')
    const res = document.getElementById('results')
    if (!reel) return
    const y = window.scrollY
    geo.current = { reelTop: reel.getBoundingClientRect().top + y, reelH: reel.offsetHeight, resTop: res ? res.getBoundingClientRect().top + y : Infinity }
  }, [])
  const computeActive = useCallback(() => {
    if (!geo.current) measure()
    const g = geo.current
    if (!g) return 'sky'
    const y = window.scrollY
    if (y + window.innerHeight * 0.5 < g.reelTop) return 'sky'
    if (y + window.innerHeight * 0.5 >= g.resTop) return 'results'
    return reelIndexFrom(g.reelTop, g.reelH, window.innerHeight, y) < PART_SPLIT ? 'story' : 'scenes'
  }, [measure])
  useEffect(() => {
    measure()
    const ro = new ResizeObserver(() => {
      measure()
      setActive(computeActive())
    })
    ro.observe(document.body)
    return () => ro.disconnect()
  }, [measure, computeActive])

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

  // a link to a landing that does not exist (#/landing/9999) says so and clears itself, instead of silently pausing the sky
  const [notice, setNotice] = useState({ text: '', show: false })
  useEffect(() => {
    if (!data.loaded || !open || openStar) return
    setOpen(null)
    if (HASH.test(location.hash)) history.replaceState(null, '', location.pathname + location.search)
    setNotice({ text: `There is no landing ${landingNo(open.seed)}. Landings run from 1 to ${landingNo(max)}.`, show: true })
  }, [data.loaded, open, openStar, max])
  useEffect(() => {
    if (!notice.show) return
    const t = setTimeout(() => setNotice((n) => ({ ...n, show: false })), 6000)
    return () => clearTimeout(t)
  }, [notice])

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
            setPickText(String(landingNo(sorted[i])))
          }}
          aria-valuetext={pickSeed === null ? 'none chosen' : `landing ${pickSeed}`}
        />
        <input
          className="seed-box"
          type="number"
          inputMode="numeric"
          min={1}
          max={landingNo(max)}
          placeholder={`1 to ${landingNo(max)}`}
          value={pickText}
          aria-label={`Landing number, 1 to ${landingNo(max)}`}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') {
              setPickText('')
              setPickIdx(null)
              return
            }
            const n = Math.floor(Number(raw))
            if (Number.isNaN(n) || !sorted.length) return
            // typed numbers are landing numbers (1 to N); cap them at the last landing
            const capped = Math.max(landingNo(sorted[0]), Math.min(landingNo(max), n))
            setPickIdx(pickNearest(capped - 1))
            setPickText(String(capped === n ? raw : capped))
          }}
          onBlur={() => pickSeed !== null && setPickText(String(landingNo(pickSeed)))}
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
          has={(kind) => !!examples[kind]}
          onExample={(kind) => {
            const ex = examples[kind]
            if (ex) openExample(ex)
          }}
        />

        <div className="content">
          <Results summary={demo ? null : data.summary} points={points} sample={demo} />
        </div>
      </main>

      <div className="notice" role="status" data-show={notice.show}>{notice.text}</div>

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
                <h2 className={(replayTitle ?? '').length > 48 ? 'long' : undefined}>{replayTitle ?? `Landing ${landingNo(openStar.seed)}`}</h2>
                <p className="dim">
                  {replayTitle ? `Landing ${landingNo(openStar.seed)}. ` : ''}
                  {outcome ? OUTCOME_LABEL[outcome] : ''}.
                </p>
              </div>
            }
          >
            <ErrorBoundary key={open.seed} message="This landing could not be shown. Close it and try another.">
              {openStar.replayId && site && data.site ? (
                <ReplayViewer id={openStar.replayId} site={data.site} onLoaded={(r) => setReplayTitle(r.title)} />
              ) : (
                <DataCard star={openStar} picture={data.pictures.has(openStar.seed)} detector={data.pictureDetector} />
              )}
            </ErrorBoundary>
          </LandingOverlay>
        )}
      </AnimatePresence>
    </>
  )
}
