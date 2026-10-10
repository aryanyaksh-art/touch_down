import type { LandingPoint, Site, Summary } from '../types'

const pct = (v: number) => `${(v * 100).toFixed(1)}%`
const NAMES: Record<string, string> = {
  complete_baseline: 'Complete map · baseline',
  stale_baseline: 'Stale map · baseline',
  complete_nn: 'Complete map · + detector',
  stale_nn: 'Stale map · + detector',
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  )
}

function Scatter({ site, pts }: { site: Site; pts: LandingPoint[] }) {
  const R = 3
  const dx = (p: LandingPoint) => p.contact_true[0] - site.target[0]
  const dy = (p: LandingPoint) => p.contact_true[1] - site.target[1]
  return (
    <svg viewBox={`${-R} ${-R} ${2 * R} ${2 * R}`} className="scatter" role="img" aria-label="Where each simulated landing touched down, relative to the target">
      {[1, 2].map((r) => (
        <g key={r}>
          <circle r={r} className="ring" />
          <text x={r * 0.72} y={-r * 0.72 - 0.06} className="ring-label">{r} m</text>
        </g>
      ))}
      <path d="M-0.15,0h0.3M0,-0.15v0.3" className="cross" />
      {pts.map((p) => (
        <circle key={p.seed} cx={dx(p)} cy={-dy(p)} r={0.045} className={p.unsafe_contact ? 'pt-bad' : 'pt-ok'} />
      ))}
    </svg>
  )
}

function Histogram({ pts }: { pts: LandingPoint[] }) {
  const maxD = 3
  const bins = 24
  const h = new Array(bins).fill(0)
  pts.forEach((p) => {
    const b = Math.min(bins - 1, Math.floor((p.delivery_error_m / maxD) * bins))
    h[b]++
  })
  const hm = Math.max(...h, 1)
  return (
    <svg viewBox={`0 0 ${bins * 10 + 20} 80`} className="hist" role="img" aria-label="Distribution of delivery error">
      {h.map((v, i) => (
        <rect key={i} x={10 + i * 10} y={70 - (v / hm) * 60} width={8} height={(v / hm) * 60} className="bar" />
      ))}
      <line x1={10 + (1 / maxD) * bins * 10} x2={10 + (1 / maxD) * bins * 10} y1={4} y2={70} className="one-m" />
      <text x={14 + (1 / maxD) * bins * 10} y={12} className="ring-label">1 m (published)</text>
      <line x1={10} x2={bins * 10 + 10} y1={70} y2={70} className="axis" />
      <text x={10} y={79} className="ring-label">0</text>
      <text x={bins * 10 - 6} y={79} className="ring-label">{maxD} m</text>
    </svg>
  )
}

export default function Dashboard({ site, summary, landings }: { site: Site | null; summary: Summary | null; landings: LandingPoint[] }) {
  if (!summary || !site) {
    return (
      <section className="dashboard">
        <h2>Monte Carlo results</h2>
        <p className="muted">The simulated-landing statistics have not been published yet.</p>
      </section>
    )
  }
  const d = summary.delivery_error_m
  const sc = summary.scenarios
  return (
    <section className="dashboard" id="results">
      <h2>{summary.n_landings.toLocaleString()} simulated landings</h2>
      <p className="lede">
        Each landing flies the full descent with rendered camera frames. Randomized: start position and velocity, burn
        execution error, unmodelled forces, sun direction, and onboard terrain-model error.
      </p>
      <div className="stats">
        <Stat
          label="Delivery error, median"
          value={`${d.median.toFixed(2)} m`}
          sub={`95th percentile ${d.p95.toFixed(2)} m${d.median_ci95 ? ` · median 95% CI ${d.median_ci95[0].toFixed(2)}–${d.median_ci95[1].toFixed(2)}` : ''}`}
        />
        <Stat
          label="Within 1 m of target"
          value={pct(d.within_1m.rate)}
          sub={`95% CI ${pct(d.within_1m.ci95[0])}–${pct(d.within_1m.ci95[1])} · OSIRIS-REx: within 1 m (one landing)`}
        />
        <Stat
          label="Predicted vs. actual contact"
          value={`${summary.pred_vs_actual_cm.median.toFixed(1)} cm`}
          sub={`OSIRIS-REx: ${summary.pred_vs_actual_cm.published_cm} cm (one landing)`}
        />
        <Stat
          label="Back-away rate"
          value={pct(sc.complete_baseline.abort.rate)}
          sub={`OSIRIS-REx predicted <${(summary.published_abort_probability_pre_tag * 100).toFixed(0)}% before TAG`}
        />
      </div>
      <div className="two">
        <figure>
          <Scatter site={site} pts={landings} />
          <figcaption>Where each landing touched down relative to the aim point. Red: the contact would have hit a hazard.</figcaption>
        </figure>
        <figure>
          <Histogram pts={landings} />
          <figcaption>Distribution of delivery error.</figcaption>
        </figure>
      </div>
      <h3>Back-away decision under four conditions</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Scenario</th>
              <th>Back-away</th>
              <th>Hit a hazard</th>
              <th>Needless back-away</th>
              <th>Safe touchdown</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(sc).map(([k, v]) => (
              <tr key={k}>
                <td>{NAMES[k] ?? k}</td>
                <td>{pct(v.abort.rate)}</td>
                <td className={v.unsafe_contact_when_proceeding.rate > 0.02 ? 'bad' : ''}>{pct(v.unsafe_contact_when_proceeding.rate)}</td>
                <td>{pct(v.needless_abort.rate)}</td>
                <td>{pct(v.safe_touchdown.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {summary.detector_effect && Object.keys(summary.detector_effect).length > 0 && (
        <>
          <h3>What the neural detector changes</h3>
          <p className="lede">
            The same flights are judged with and without the detector, so the comparison is paired. It prevents hazard contacts
            but also raises false alarms (needless back-aways).
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ground map</th>
                  <th>Hazard contacts</th>
                  <th>Needless back-aways</th>
                  <th>Extra needless per hazard avoided</th>
                  <th>Paired test (McNemar p)</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(summary.detector_effect).map(([k, e]) => (
                  <tr key={k}>
                    <td>{k === 'stale' ? 'Stale (missing small boulders)' : 'Complete'}</td>
                    <td>{e.hazard_contacts_baseline} → {e.hazard_contacts_with_detector} of {e.n}</td>
                    <td>{e.needless_baseline} → {e.needless_with_detector}</td>
                    <td>
                      {e.extra_needless_per_hazard_avoided == null
                        ? '–'
                        : `${e.extra_needless_per_hazard_avoided.toFixed(1)}${e.extra_needless_per_hazard_avoided_ci95 ? ` (${e.extra_needless_per_hazard_avoided_ci95[0].toFixed(1)}–${e.extra_needless_per_hazard_avoided_ci95[1].toFixed(1)})` : ''}`}
                    </td>
                    <td>{e.mcnemar_p < 0.001 ? '<0.001' : e.mcnemar_p.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="note">
        <b>Read with care.</b> The real mission is one landing; these are simulated, so matching its numbers shows the method is
        plausible, not that it would fly. Terrain is the real Nightingale model rendered by a Lambertian model, so very low
        altitude navigation is optimistic. Aim points are random but safe on the true map (an extension: the real site was chosen
        for large clearance), and the decision uses the published TAGSAM head radius (16 cm) and a threshold for over 99% safety.
        The “stale map” scenario removes boulders under 0.8 m from the ground-built hazard map, an assumption standing in for
        unmapped small rocks.
      </p>
    </section>
  )
}
