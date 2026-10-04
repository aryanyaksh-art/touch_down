import { useEffect, useState } from 'react'
import CameraView from './components/CameraView'
import Dashboard from './components/Dashboard'
import DecisionBanner from './components/DecisionBanner'
import SiteMap from './components/SiteMap'
import Timeline from './components/Timeline'
import { useReplay, useStatic } from './data'

export default function App() {
  const { site, index, summary, landings, loaded } = useStatic()
  const [id, setId] = useState<string | null>(null)
  const [k, setK] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [showLabels, setShowLabels] = useState(true)
  const [showFeatures, setShowFeatures] = useState(true)
  const [prior, setPrior] = useState<'complete' | 'stale'>('complete')
  const [detector, setDetector] = useState(false)

  useEffect(() => {
    if (!id && index.length) setId(index[0].id)
  }, [index, id])
  const replay = useReplay(id)

  useEffect(() => {
    setK(0)
    setPlaying(false)
  }, [id])

  useEffect(() => {
    if (!playing || !replay) return
    const timer = setInterval(() => {
      setK((cur) => {
        if (cur >= replay.frames.length - 1) {
          setPlaying(false)
          return cur
        }
        return cur + 1
      })
    }, 450)
    return () => clearInterval(timer)
  }, [playing, replay])

  const hasDetector = !!replay && replay.decision.abort['complete_nn'] !== undefined
  const detectorOn = detector && hasDetector

  return (
    <>
      <header className="top">
        <div className="brand">
          <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M16 5v15m0 0l-5.5-5.5M16 20l5.5-5.5M7 26h18" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          </svg>
          <span>TouchDown</span>
        </div>
        <nav>
          <a href="#replay">Replay</a>
          <a href="#results">Results</a>
          <a href="https://github.com/aryanyaksh-art/touch_down">GitHub</a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <h1>A spacecraft that lands by itself.</h1>
          <p>
            Radio delay makes remote control impossible at an asteroid. Replay simulated descents to Bennu: what the camera sees, where the
            navigation filter thinks it is, and the final call to touch down or back away.
          </p>
        </section>

        <section id="replay">
          {!loaded && <p className="muted">Loading…</p>}
          {loaded && (!site || index.length === 0) && (
            <p className="muted">No replays have been published yet. Run the export step to generate them.</p>
          )}
          {site && index.length > 0 && (
            <>
              <div className="chips" role="tablist">
                {index.map((e) => (
                  <button key={e.id} role="tab" aria-selected={e.id === id} className={e.id === id ? 'chip on' : 'chip'} onClick={() => setId(e.id)}>
                    {e.title}
                  </button>
                ))}
              </div>
              {replay && (
                <>
                  <p className="blurb">{replay.blurb}</p>
                  <div className="grid">
                    <CameraView replay={replay} k={k} showLabels={showLabels} showFeatures={showFeatures} useNN={detectorOn} />
                    <SiteMap site={site} replay={replay} k={k} showPrior={prior === 'stale'} />
                  </div>
                  <Timeline replay={replay} k={k} setK={setK} playing={playing} setPlaying={setPlaying} />
                  <div className="options">
                    <label><input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> hazard labels</label>
                    <label><input type="checkbox" checked={showFeatures} onChange={(e) => setShowFeatures(e.target.checked)} /> landmark matches</label>
                    <span className="seg" role="group" aria-label="Ground hazard map">
                      <button className={prior === 'complete' ? 'on' : ''} onClick={() => setPrior('complete')}>complete map</button>
                      <button className={prior === 'stale' ? 'on' : ''} onClick={() => setPrior('stale')}>stale map</button>
                    </span>
                    <span className="seg" role="group" aria-label="Neural hazard detector">
                      <button className={!detectorOn ? 'on' : ''} onClick={() => setDetector(false)}>baseline</button>
                      <button className={detectorOn ? 'on' : ''} disabled={!hasDetector} title={hasDetector ? '' : 'detector results not in this replay'} onClick={() => setDetector(true)}>+ detector</button>
                    </span>
                  </div>
                  <DecisionBanner replay={replay} k={k} prior={prior} detector={detectorOn} />
                </>
              )}
            </>
          )}
        </section>

        <Dashboard site={site} summary={summary} landings={landings} />

        <section className="about">
          <h2>How it works</h2>
          <ol>
            <li><b>Camera frames</b> are rendered from NASA’s public 5 cm model of Nightingale, OSIRIS-REx’s sample site.</li>
            <li><b>Natural Feature Tracking</b> predicts how known landmarks should look from the estimated position, matches them to the image, and a Kalman filter turns the offsets into a position fix.</li>
            <li><b>A Matchpoint-style burn</b> puts the spacecraft on a ballistic arc to the aim point at 10 cm/s.</li>
            <li><b>At about 5 m</b> it predicts where it will touch, checks that against the hazard map, and either lands or backs away.</li>
            <li><b>The extension:</b> a neural network also looks for boulders in the live images, something the real spacecraft did not do.</li>
          </ol>
        </section>
      </main>
      <footer>
        Independent educational recreation. Not affiliated with NASA. Terrain: NASA OSIRIS-REx Laser Altimeter shape models.
      </footer>
    </>
  )
}
