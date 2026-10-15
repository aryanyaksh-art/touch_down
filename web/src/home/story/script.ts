// The story as pure functions: scene index and progress u (0..1) in, camera, probe and overlay state out.
// Frames: the Nightingale tile in metres, +y up (see terrain.ts). Faithful vs. extension is kept visible: the first six scenes
// show the mission's own method (shadow and hazard-map logic, back-away at 5 m); the last shows the detector extension.
import type { StorySites } from './terrain'

export type V3 = [number, number, number]

export interface StoryPose {
  cam: V3
  look: V3
  fov: number
  /** sun elevation above the horizon, degrees */
  sunElev: number
  /** brightness of the ground, 1 = lit by the sun alone, lower dims it so the map reads */
  ground: number
  probe: { on: boolean; pos: V3; tiltX: number; tiltZ: number; flame: number }
  /** the camera cone from the probe to the ground, 0..1 */
  frustum: number
  /** a white flash (the shutter), 0..1 */
  flash: number
  /** outlines around the rocks, 0..1 progress */
  outlines: number
  /** the hazard grid: how much of it has appeared, and how much of its hazard cells have filled */
  grid: { show: number; hot: number }
  /** the target ring on the ground */
  ring: { a: number; x: number; z: number; r: number }
  /** the 5 m ring above the contact point */
  ring5: { a: number; x: number; z: number; y: number }
  /** dust at the contact point, 0..1 progress */
  dust: { t: number; x: number; z: number }
  /** the detector's outline of the rock the map missed, 0..1 */
  rockOutline: { a: number; x: number; z: number }
  /** a dip to dark while the old landing is rewound */
  dip: number
  /** which caption line to show */
  line: number
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
/** progress of u between a and b */
const seg = (a: number, b: number, u: number) => clamp01((u - a) / (b - a))
const ease = (t: number) => t * t * (3 - 2 * t)
const outCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export interface SceneDef {
  part: 'How a probe sees' | 'Three landings'
  title: string | null
  /** caption lines; the pose picks one with `line` */
  lines: string[]
  /** screen-reader description */
  label: string
  /** seconds to play */
  seconds: number
  /** which real landing the "See a real one" button opens */
  example?: 'clean' | 'back' | 'old'
}

export const SCENES: SceneDef[] = [
  { part: 'How a probe sees', title: null, lines: ['The probe looks straight down with a camera.'], label: 'A probe descends over rocky ground and its camera takes a picture.', seconds: 11 },
  { part: 'How a probe sees', title: null, lines: ['Low sun makes every boulder throw a long shadow.', 'Each shadow gives a rock away, so each one is outlined.'], label: 'Low sunlight makes each boulder throw a long shadow, then each boulder is outlined.', seconds: 12 },
  { part: 'How a probe sees', title: null, lines: ['Rocks and steep slopes get marked on a map.'], label: 'The ground is flattened into a grid map and the cells with boulders or steep slopes fill in.', seconds: 9 },
  { part: 'How a probe sees', title: null, lines: ['It picks the safest spot and flies there.'], label: 'A target ring hops over hazard cells and settles on the safest cell, then the probe drifts over it.', seconds: 11 },
  { part: 'Three landings', title: 'A clean touchdown', lines: ['Safe ground below, so it touches down.'], label: 'A probe descends, checks the ground at 5 metres, and touches down on safe ground.', seconds: 13, example: 'clean' },
  { part: 'Three landings', title: 'Backing away for a reason', lines: ['A boulder sits where it would land, so it backs away.'], label: 'A boulder sits where the probe would touch, so at 5 metres it fires its thrusters and backs away.', seconds: 13, example: 'back' },
  {
    part: 'Three landings',
    title: 'When the map is out of date',
    lines: ['The map missed a small rock, so the probe lands on it.', 'Replayed with live detection, the rock is outlined.', 'It backs away.'],
    label: 'The ground map is missing a small rock, so the probe lands on it. Replayed with live detection, the rock is outlined and the probe backs away.',
    seconds: 18,
    example: 'old',
  },
]

export interface Ground {
  at: (x: number, z: number) => number
  sites: StorySites
}

const NONE = {
  frustum: 0,
  flash: 0,
  outlines: 0,
  grid: { show: 0, hot: 0 },
  ring: { a: 0, x: 0, z: 0, r: 1 },
  ring5: { a: 0, x: 0, z: 0, y: 0 },
  dust: { t: 0, x: 0, z: 0 },
  rockOutline: { a: 0, x: 0, z: 0 },
  dip: 0,
  line: 0,
}

/** the probe is modelled so its sampler head is the origin; the body rides about 4.3 m above it */
export const BODY_ABOVE_HEAD = 4.3

function lowPose(base: Partial<StoryPose> & Pick<StoryPose, 'cam' | 'look'>): StoryPose {
  return {
    fov: 38,
    sunElev: 14,
    ground: 1,
    probe: { on: false, pos: [0, 0, 0], tiltX: 0, tiltZ: 0, flame: 0 },
    ...NONE,
    ...base,
  }
}

/** A camera that circles a point at a radius and height, looking a little above it. */
function orbit(cx: number, cz: number, y: number, radius: number, ang: number): V3 {
  return [cx + Math.sin(ang) * radius, y, cz + Math.cos(ang) * radius]
}

/** A camera that keeps the whole probe and the ground in frame as the probe's sampler head moves: it backs off as the probe climbs. */
function track(gx: number, gz: number, gh: number, head: V3, ang: number, wide: number): { cam: V3; look: V3 } {
  const h = Math.max(0, head[1] - gh)
  const radius = (19 + 1.2 * h) * wide
  const cam = orbit(gx, gz, gh + 3.5 + 0.3 * h, radius, ang)
  return { cam, look: [(gx + head[0]) / 2, gh + (h + BODY_ABOVE_HEAD) * 0.42, gz] }
}

export function storyPose(scene: number, u: number, g: Ground, aspect: number): StoryPose {
  const { patch, clean, back, old } = g.sites
  const wide = aspect < 1 ? 1.5 : 1 // a portrait screen needs more distance to hold the same width
  const pcx = patch.cx, pcz = patch.cz
  const pgh = g.at(pcx, pcz)

  if (scene === 0) {
    // the probe comes down over the patch; its camera cone appears; the shutter fires; the view swings to straight above
    const d = outCubic(seg(0, 0.72, u))
    const head: V3 = [pcx - 2, pgh + lerp(34, 12.5, d), pcz + 1]
    const camA = orbit(pcx, pcz, pgh + 11 - 2 * u, 36 * wide, 0.7 + 0.55 * u)
    const lookA: V3 = [pcx, (head[1] + pgh) / 2 + 3.5, pcz]
    const b = ease(seg(0.78, 1, u))
    const cam = lerp3(camA, [pcx, pgh + 27 * wide, pcz + 0.4], b)
    const look = lerp3(lookA, [pcx, pgh, pcz], b)
    const fl = seg(0.7, 0.74, u) * (1 - seg(0.74, 0.84, u))
    return lowPose({
      cam, look, sunElev: 20,
      probe: { on: true, pos: head, tiltX: 0, tiltZ: 0, flame: 0 },
      frustum: seg(0.3, 0.52, u) * (1 - seg(0.78, 0.9, u) * 0.6),
      flash: fl,
    })
  }

  if (scene === 1) {
    // the sun sinks and the shadows lengthen; then every rock is outlined
    const sun = lerp(64, 13, inOut(seg(0.04, 0.5, u)))
    const cam = lerp3([pcx - 3, pgh + 21 * wide, pcz + 14 * wide], [pcx + 2, pgh + 18 * wide, pcz + 12 * wide], ease(u))
    return lowPose({
      cam, look: [pcx, pgh, pcz - 0.5], fov: 40, sunElev: sun,
      outlines: seg(0.56, 0.95, u),
      line: u > 0.55 ? 1 : 0,
    })
  }

  if (scene === 2) {
    // straight down: the picture is flattened into a grid and the cells with rocks fill in
    const dim = ease(seg(0, 0.3, u))
    return lowPose({
      cam: [pcx, pgh + 17.5 * wide, pcz + 0.3], look: [pcx, pgh, pcz], fov: 40, sunElev: 13,
      ground: lerp(1, 0.34, dim),
      grid: { show: ease(seg(0.12, 0.5, u)), hot: ease(seg(0.5, 0.9, u)) },
    })
  }

  if (scene === 3) {
    // a ring hops from cell to cell, then settles on the safest one; the probe slides in over it
    const cell = (a: number, b: number): [number, number] => [patch.x0 + (a + 0.5) * patch.g, patch.z0 + (b + 0.5) * patch.g]
    const [tx, tj] = patch.target
    // the hazard cells nearest the target are where the ring tries first
    const stops: [number, number][] = []
    for (let b = 0; b < patch.rows && stops.length < 2; b++) {
      for (let a = patch.cols - 1; a >= 0 && stops.length < 2; a--) {
        if (patch.hazard[b * patch.cols + a] && Math.abs(a - tx) > 2) stops.push(cell(a, b))
      }
    }
    while (stops.length < 2) stops.push(cell(0, 0))
    const way = [stops[0], stops[1], cell(tx, tj)]
    const f = seg(0.06, 0.62, u) * (way.length - 1)
    const k = Math.min(way.length - 2, Math.floor(f))
    const h = ease(clamp01(f - k))
    const rx = lerp(way[k][0], way[k + 1][0], h)
    const rz = lerp(way[k][1], way[k + 1][1], h)
    const settle = seg(0.62, 0.7, u)
    const px = cell(tx, tj)[0], pz = cell(tx, tj)[1]
    const slide = outCubic(seg(0.62, 1, u))
    const head: V3 = [lerp(px - 9, px, slide), pgh + lerp(8.5, 6.2, slide), pz]
    const pitch = ease(seg(0.62, 1, u))
    return lowPose({
      cam: lerp3([pcx, pgh + 17.5 * wide, pcz + 0.3], [pcx + 3, pgh + 13 * wide, pcz + 11 * wide], pitch), look: [pcx, pgh + 1.5 * pitch, pcz], fov: 40, sunElev: 13,
      ground: 0.34,
      grid: { show: 1, hot: 1 },
      ring: { a: ease(seg(0.02, 0.1, u)), x: rx, z: rz, r: lerp(0.8, 0.62, settle) },
      probe: { on: u > 0.6, pos: head, tiltX: 0, tiltZ: 0, flame: 0 },
    })
  }

  if (scene === 4) {
    const gx = clean.x, gz = clean.z
    const gh = g.at(gx, gz)
    const d = seg(0, 0.8, u)
    // fast at first, slow through the last few metres, as in the real approach
    const y = gh + lerp(26, 0, 1 - Math.pow(1 - d, 1.9))
    const head: V3 = [gx, y, gz]
    const c = track(gx, gz, gh, head, 0.6 + 0.35 * u, wide)
    return lowPose({
      cam: c.cam, look: c.look,
      sunElev: 12,
      probe: { on: true, pos: head, tiltX: 0, tiltZ: 0, flame: 0 },
      ring: { a: ease(seg(0.15, 0.3, u)), x: gx, z: gz, r: 0.95 },
      ring5: { a: seg(0.3, 0.4, u) * (1 - seg(0.7, 0.8, u)) , x: gx, z: gz, y: gh + 5 },
      dust: { t: seg(0.8, 1, u), x: gx, z: gz },
      grid: { show: 0, hot: 0 },
    })
  }

  if (scene === 5) {
    const gx = back.x, gz = back.z
    const gh = g.at(gx, gz)
    const d = seg(0, 0.5, u)
    const down = gh + lerp(26, 5.0, 1 - Math.pow(1 - d, 1.9))
    // at 5 m the probe stops; ~0.1 s later the thrusters fire; it rises, leans, and drifts away
    const burn = seg(0.6, 0.72, u)
    const away = seg(0.62, 1, u)
    const y = u < 0.58 ? down : lerp(down, gh + 5 + 22, Math.pow(away, 2.1))
    const x = gx + Math.pow(away, 2.4) * 7
    const head: V3 = [x, y, gz]
    const c = track(gx, gz, gh, head, 0.55 + 0.4 * u, wide)
    return lowPose({
      cam: c.cam, look: c.look,
      sunElev: 12,
      probe: { on: true, pos: head, tiltX: 0, tiltZ: -away * 0.35 * (1 - seg(0.9, 1, u) * 0.3), flame: burn * (1 - seg(0.88, 1, u)) },
      ring: { a: ease(seg(0.15, 0.3, u)), x: gx, z: gz, r: 1.15 },
      ring5: { a: seg(0.3, 0.4, u) * (1 - seg(0.78, 0.9, u)), x: gx, z: gz, y: gh + 5 },
      outlines: 0,
      rockOutline: { a: seg(0.46, 0.58, u) * (1 - seg(0.88, 1, u)), x: gx, z: gz },
    })
  }

  // scene 6: the map is out of date. First flight lands on the rock; rewind; second flight sees it and backs away.
  const gx = old.x, gz = old.z
  const gh = g.at(gx, gz)
  const first = u < 0.5
  const dip = seg(0.46, 0.52, u) * (1 - seg(0.54, 0.62, u))
  const d1 = seg(0, 0.36, u)
  const d2 = seg(0.6, 0.8, u)
  const away = seg(0.8, 1, u)
  let y: number, x = gx, tiltZ = 0, flame = 0, line = 0
  if (first) {
    y = gh + lerp(24, 0, 1 - Math.pow(1 - d1, 1.9))
    // on contact with the rock the probe rocks over a little
    const hit = seg(0.36, 0.5, u)
    tiltZ = Math.sin(hit * Math.PI * 1.5) * 0.12 * (1 - hit * 0.5)
  } else {
    line = u < 0.62 ? 1 : 2
    const dd = 1 - Math.pow(1 - d2, 1.9)
    y = gh + lerp(24, 5, dd)
    if (u > 0.8) {
      y = lerp(gh + 5, gh + 5 + 20, Math.pow(away, 2.1))
      x = gx + Math.pow(away, 2.4) * 6
      tiltZ = -away * 0.32
      flame = seg(0.8, 0.88, u) * (1 - seg(0.95, 1, u))
    }
  }
  const tr = track(gx, gz, gh, [x, y, gz], 0.5 + 0.45 * u, wide)
  const cam = tr.cam
  const look = tr.look
  return lowPose({
    cam, look, sunElev: 12, ground: 1,
    probe: { on: true, pos: [x, y, gz], tiltX: 0, tiltZ, flame },
    ring: { a: ease(seg(0.1, 0.22, u)) * (1 - ease(seg(0.5, 0.56, u))) + ease(seg(0.62, 0.7, u)), x: gx, z: gz, r: 0.9 },
    ring5: { a: !first ? seg(0.66, 0.74, u) * (1 - seg(0.9, 0.97, u)) : 0, x: gx, z: gz, y: gh + 5 },
    rockOutline: { a: seg(0.72, 0.82, u) * (1 - seg(0.95, 1, u)), x: gx, z: gz },
    grid: { show: ease(seg(0.04, 0.2, u)), hot: 1 },
    flash: seg(0.36, 0.38, u) * (1 - seg(0.38, 0.46, u)) * 0.8,
    dip,
    line,
  })
}

export const fromTo = (a: StoryPose, b: StoryPose, k: number): Pick<StoryPose, 'cam' | 'look' | 'fov' | 'sunElev' | 'ground'> => ({
  cam: lerp3(a.cam, b.cam, k),
  look: lerp3(a.look, b.look, k),
  fov: lerp(a.fov, b.fov, k),
  sunElev: lerp(a.sunElev, b.sunElev, k),
  ground: lerp(a.ground, b.ground, k),
})
