import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { ArrowLeft, ArrowRight, GithubLogo, Play } from '@phosphor-icons/react'
import Dashboard from './components/Dashboard'
import DataCard from './components/DataCard'
import Hero from './components/Hero'
import LandingOverlay from './components/LandingOverlay'
import ReplayViewer from './components/ReplayViewer'
import SectionDots, { type Section } from './components/SectionDots'
import Starfield from './components/Starfield'
import { useStatic } from './data'
import { EASE_OUT } from './lib/motion'
import { OUTCOME_LABEL, buildStars, demoLandings, outcomeOf, viewKey, type View } from './lib/model'
import { buildTour } from './lib/tour'
import type { Site } from './types'

const SECTIONS: Section[] = [
  { id: 'sky', label: 'The sky' },
  { id: 'tour', label: 'Three landings' },
  { id: 'results', label: 'Results' },
  { id: 'faithful', label: 'Faithful and added' },
  { id: 'how', label: 'How it works' },
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
  const tour = useMemo(() => buildTour(stars), [stars])

  const [view, setView] = useState<View>({ prior: 'complete', detector: false })
  const [open, setOpen] = useState<{ seed: number; origin: { x: number; y: number } } | null>(() => {
    const s = seedFromHash()
    return s === null ? null : { seed: s, origin: { x: window.innerWidth / 2, y: window.innerHeight / 2 } }
  })
  const [tourStep, setTourStep] = useState<number | null>(null)
  const [direction, setDirection] = useState(1)
  const [replayTitle, setReplayTitle] = useState<string | null>(null)

  const centre = () => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 })

  const openSeed = useCallback((seed: number, origin: { x: number; y: number }) => {
    setReplayTitle(null)
    setOpen({ seed, origin })
    history.pushState(null, '', `#/landing/${seed}`)
  }, [])

  const close = useCallback(() => {
    setOpen(null)
    setTourStep(null)
    if (HASH.test(location.hash)) history.replaceState(null, '', location.pathname + location.search)
  }, [])

  useEffect(() => {
    const on = () => {
      const s = seedFromHash()
      if (s === null) {
        setOpen(null)
        setTourStep(null)
      } else setOpen({ seed: s, origin: { x: window.innerWidth / 2, y: window.innerHeight / 2 } })
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const goTourStep = (i: number, dir = 1) => {
    const step = tour[i]
    if (!step) return
    setDirection(dir)
    setTourStep(i)
    setView(step.view)
    setReplayTitle(null)
    setOpen((cur) => ({ seed: step.seed, origin: cur?.origin ?? centre() }))
    history.replaceState(null, '', `#/landing/${step.seed}`)
  }
  const startTour = (i = 0) => {
    const step = tour[i]
    if (!step) return
    setDirection(1)
    setTourStep(i)
    setView(step.view)
    setReplayTitle(null)
    setOpen({ seed: step.seed, origin: centre() })
    history.pushState(null, '', `#/landing/${step.seed}`)
  }

  const goto = useCallback(
    (id: string) => {
      const el = document.getElementById(id)
      if (!el) return
      const behavior: ScrollBehavior = reduce ? 'auto' : 'smooth'
      if (id === 'sky' && !narrow) {
        // land where the galaxy is fully revealed, not at the telescope
        const top = el.getBoundingClientRect().top + window.scrollY
        window.scrollTo({ top: top + (el.offsetHeight - window.innerHeight) * 0.9, behavior })
      } else el.scrollIntoView({ behavior, block: 'start' })
    },
    [reduce, narrow],
  )

  const openStar = open ? stars.find((s) => s.seed === open.seed) : undefined
  const { scrollY } = useScroll()
  const barOpacity = useTransform(scrollY, [160, 360], [0, 1])

  const hud = (
    <div className="hud">
      <div className="hud-legend">
        <p>
          Each bright star is one simulated landing. Closer to the core means it ended nearer its aim point. A ring means a full
          camera replay. The faint haze behind is decoration.
        </p>
        {demo && <p className="hot">Sample data, shown until the real landings are published.</p>}
      </div>
      <div className="hud-controls">
        <span className="seg" role="group" aria-label="Ground hazard map">
          <button type="button" className={view.prior === 'complete' ? 'on' : ''} onClick={() => setView({ ...view, prior: 'complete' })}>complete map</button>
          <button type="button" className={view.prior === 'stale' ? 'on' : ''} onClick={() => setView({ ...view, prior: 'stale' })}>stale map</button>
        </span>
        <span className="seg" role="group" aria-label="Neural hazard detector">
          <button type="button" className={!view.detector ? 'on' : ''} onClick={() => setView({ ...view, detector: false })}>baseline</button>
          <button type="button" className={view.detector ? 'on' : ''} onClick={() => setView({ ...view, detector: true })}>+ detector</button>
        </span>
        <form
          className="goto"
          onSubmit={(e) => {
            e.preventDefault()
            const v = Number(new FormData(e.currentTarget).get('seed'))
            if (stars.some((s) => s.seed === v)) openSeed(v, centre())
          }}
        >
          <label htmlFor="seed">Landing</label>
          <input id="seed" name="seed" type="number" min={0} inputMode="numeric" placeholder="0" />
          <button type="submit">Open</button>
        </form>
        {tour.length > 0 && (
          <button type="button" className="primary" onClick={() => startTour()}>
            <Play size={14} weight="fill" /> Take the tour
          </button>
        )}
      </div>
    </div>
  )

  const step = tourStep !== null ? tour[tourStep] : null
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

      <SectionDots sections={SECTIONS} onGo={goto} />

      <main>
        <div>
          <Hero
            stars={stars}
            view={view}
            reduce={reduce}
            paused={!!open}
            simple={narrow || reduce}
            count={stars.length || 1000}
            onOpen={openSeed}
            hud={hud}
          />
        </div>

        <div className="content">
          <section id="tour" className="block">
            <h2>Follow three landings</h2>
            <p className="lede">Each one is picked from the landing data rather than written by hand, then replayed from the first camera frame to the decision at 5 m.</p>
            {tour.length === 0 && <p className="dim">The landing data is still loading.</p>}
            <ol className="tour-list">
              {tour.map((s, i) => (
                <motion.li
                  key={s.seed}
                  initial={reduce ? false : { opacity: 0, transform: 'translateY(14px)' }}
                  whileInView={{ opacity: 1, transform: 'translateY(0px)' }}
                  viewport={{ once: true, margin: '0px 0px -12% 0px' }}
                  transition={{ duration: 0.5, delay: i * 0.07, ease: EASE_OUT }}
                >
                  <div>
                    <h3>{s.title}</h3>
                    <p>{s.text}</p>
                  </div>
                  <button type="button" onClick={() => startTour(i)}>
                    Watch landing {s.seed}
                  </button>
                </motion.li>
              ))}
            </ol>
          </section>

          <Dashboard site={site} summary={demo ? null : data.summary} landings={points} />

          <section className="block" id="faithful">
            <h2>What is faithful, and what is added</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Part</th><th>Real OSIRIS-REx</th><th>This project</th></tr>
                </thead>
                <tbody>
                  <tr><td>Navigation</td><td>Natural Feature Tracking from camera images</td><td>Same method, rebuilt here</td></tr>
                  <tr><td>Hazard check</td><td>Ground-built hazard map; wave-off at 5 m if contact is unsafe</td><td>Same (the baseline)</td></tr>
                  <tr><td>Hazard detection</td><td>None onboard</td><td><b>Added:</b> a neural network reads the live images</td></tr>
                  <tr><td>Aim point</td><td>One site chosen for large clearance</td><td><b>Added:</b> random safe points, to stress the decision</td></tr>
                  <tr><td>Descent start</td><td>Checkpoint at about 125 m</td><td>45 m (the real terrain tile is only 48 m wide)</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="block" id="how">
            <h2>How it works</h2>
            <ol className="how">
              <li><b>Camera frames</b> are rendered from NASA’s public 5 cm model of Nightingale, OSIRIS-REx’s sample site.</li>
              <li><b>Natural Feature Tracking</b> predicts how known landmarks should look from the estimated position, matches them to the image, and a Kalman filter turns the offsets into a position fix.</li>
              <li><b>A Matchpoint-style burn</b> puts the spacecraft on a ballistic arc to the aim point at 10 cm/s.</li>
              <li><b>At about 5 m</b> it predicts where it will touch, checks that against the hazard map, and either lands or backs away.</li>
              <li><b>The extension:</b> a neural network also looks for boulders in the live images, something the real spacecraft did not do.</li>
            </ol>
          </section>
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
            direction={direction}
            header={
              <div className="overlay-head">
                <h2>{step ? step.title : replayTitle ?? `Landing ${openStar.seed}`}</h2>
                <p className="dim">
                  {step || replayTitle ? `Landing ${openStar.seed}. ` : ''}
                  {outcome ? OUTCOME_LABEL[outcome] : ''}.
                </p>
              </div>
            }
            footer={
              step && tourStep !== null ? (
                <div className="tour-bar">
                  <p>{step.text}</p>
                  <div className="tour-nav">
                    <button type="button" onClick={() => goTourStep(tourStep - 1, -1)} disabled={tourStep === 0} aria-label="Previous landing">
                      <ArrowLeft size={16} />
                    </button>
                    <span className="dim">{tourStep + 1} of {tour.length}</span>
                    {tourStep < tour.length - 1 ? (
                      <button type="button" onClick={() => goTourStep(tourStep + 1, 1)} aria-label="Next landing">
                        <ArrowRight size={16} />
                      </button>
                    ) : (
                      <button type="button" className="primary" onClick={close}>Back to the sky</button>
                    )}
                  </div>
                </div>
              ) : undefined
            }
          >
            {openStar.replayId && site && data.site ? (
              <ReplayViewer id={openStar.replayId} site={data.site} onLoaded={(r) => setReplayTitle(r.title)} />
            ) : (
              <DataCard star={openStar} />
            )}
          </LandingOverlay>
        )}
      </AnimatePresence>
    </>
  )
}
