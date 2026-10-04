export interface Site {
  extent_m: [number, number]
  res_m: number
  target: [number, number]
  target_clearance_m: number
}

export interface Frame {
  t: number
  alt: number
  true: number[]
  est: number[]
  err: number
  sigma_xy: number[]
  matched: number
  used: number
  features: number[][] // [u_pred, v_pred, u_meas, v_meas] in 320x240 px
  nn?: boolean
}

export interface Decision {
  abort: Record<string, boolean>
  p_hazard: Record<string, number>
  contact_pred: number[]
  contact_pred_sigma: number[]
  contact_true: number[]
  delivery_error_m: number
  pred_vs_actual_m: number
  unsafe_contact: boolean
  clearance_at_contact_m: number
  decision_alt_est: number
}

export interface Replay {
  id: string
  title: string
  blurb: string
  seed: number
  target: number[]
  sun: { az: number; el: number }
  frames: Frame[]
  matchpoint_t: number | null
  burn_dv: number | null
  decision: Decision
}

export interface IndexEntry {
  id: string
  title: string
  blurb: string
  seed: number
  abort: Record<string, boolean>
  unsafe_contact: boolean
  delivery_error_m: number
}

export interface Rate {
  k: number
  n: number
  rate: number
  ci95: [number, number]
}

export interface Summary {
  n_landings: number
  delivery_error_m: {
    median: number
    mean: number
    p90: number
    p95: number
    max: number
    within_1m: Rate
    published_within_m: number
  }
  pred_vs_actual_cm: { median: number; p95: number; published_cm: number }
  nav_err_at_matchpoint_m_median: number
  nav_err_at_decision_m_median: number
  nees_at_decision_mean: number
  unsafe_if_never_abort: Rate
  published_abort_probability_pre_tag: number
  scenarios: Record<
    string,
    {
      abort: Rate
      unsafe_contact_when_proceeding: Rate
      needless_abort: Rate
      safe_touchdown: Rate
    }
  >
}

export interface LandingPoint {
  seed: number
  delivery_error_m: number
  unsafe_contact: boolean
  contact_true: number[]
  abort: Record<string, boolean>
}
