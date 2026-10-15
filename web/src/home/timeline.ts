// The home page is one continuous timeline t in [0, 3]. Step k plays t from k-1 to k. Everything the scene shows is a pure function
// of t (pose(t)), so any frame can be reproduced, scrubbed and screenshot, and playing a step backwards is just t decreasing.
//
//   step 1  t 0..1  push in toward the meteor radiant            (caption: "Let's take a look")
//   step 2  t 1..2  pull back to the telescope view
//   step 3  t 2..3  one unbroken shot: the telescope turns, the camera flies into the eyepiece, the round view opens on the stars, an
//                   asteroid streaks across, the camera swings round and chases it, the galaxy fades in dead centre, the camera
//                   dollies in, and the asteroid zooms past the galaxy and leaves the frame

export type V3 = [number, number, number]

export const STEP_COUNT = 3
/** seconds each step takes when played at full length */
export const STEP_SECONDS = [4.6, 3.6, 26]

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k
export const lerp3 = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]
export const smooth = (x: number) => {
  const k = clamp(x)
  return k * k * (3 - 2 * k)
}
/** strong ease-in-out, the house curve (matches cubic-bezier(0.77, 0, 0.175, 1) closely) */
export const easeInOut = (x: number) => {
  const k = clamp(x)
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
}
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x), 4)
/** progress of t inside [a, b], clamped to 0..1 */
export const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a))

const rad = (d: number) => (d * Math.PI) / 180

// ---- the telescope, in its own frame (metres; ground contact at the origin; the whole thing turns about Y)
export const TELESCOPE = {
  elevation: rad(52),            // how steeply the tube points up
  headY: 1.04,                   // height of the mount head above the ground
  tubeLength: 0.96,
  tubeRadius: 0.135,
  yawStart: rad(34),             // resting yaw
  yawEyepiece: rad(-90),         // the yaw at which the eyepiece faces the camera (+Z)
}
const axis = (): V3 => [0, Math.sin(TELESCOPE.elevation), -Math.cos(TELESCOPE.elevation)]
export const tubeCentre = (): V3 => [0, TELESCOPE.headY + 0.13, 0]
/** the eyepiece's eye lens, local frame; the eyepiece axis points along +X */
export const eyeLensLocal = (): V3 => {
  const a = axis()
  const c = tubeCentre()
  const along = TELESCOPE.tubeLength / 2 - 0.12
  return [c[0] + a[0] * along + TELESCOPE.tubeRadius + 0.2, c[1] + a[1] * along, c[2] + a[2] * along]
}
export const yawVec = (v: V3, yaw: number): V3 => [v[0] * Math.cos(yaw) + v[2] * Math.sin(yaw), v[1], -v[0] * Math.sin(yaw) + v[2] * Math.cos(yaw)]

// ---- the sky
/** where the meteors come from (unit vector) */
export const RADIANT: V3 = (() => {
  const v: V3 = [-0.28, 0.82, -0.5]
  const n = Math.hypot(...v)
  return [v[0] / n, v[1] / n, v[2] / n]
})()

// ---- the galaxy (it sits far along this direction from the origin)
export const GALAXY_DIR: V3 = (() => {
  const v: V3 = [-0.78, 0.18, -0.6]
  const n = Math.hypot(...v)
  return [v[0] / n, v[1] / n, v[2] / n]
})()
export const GALAXY_DIST = 620
export const GALAXY_RADIUS = 230
/** the galaxy's disc is perpendicular to this */
export const GALAXY_NORMAL: V3 = (() => {
  const v: V3 = [0.2, 0.9, 0.38]
  const n = Math.hypot(...v)
  return [v[0] / n, v[1] / n, v[2] / n]
})()
/** where the camera ends up: on the near side of the galaxy, looking at its disc from about 50 degrees off its axis */
function galaxyEndCamera(distScale = 1): V3 {
  const N = GALAXY_NORMAL
  const toViewer: V3 = [-GALAXY_DIR[0], -GALAXY_DIR[1], -GALAXY_DIR[2]]
  const d = toViewer[0] * N[0] + toViewer[1] * N[1] + toViewer[2] * N[2]
  const w: V3 = [toViewer[0] - N[0] * d, toViewer[1] - N[1] * d, toViewer[2] - N[2] * d]
  const wl = Math.hypot(...w) || 1
  const a = 0.86
  const dir: V3 = [N[0] * Math.cos(a) + (w[0] / wl) * Math.sin(a), N[1] * Math.cos(a) + (w[1] / wl) * Math.sin(a), N[2] * Math.cos(a) + (w[2] / wl) * Math.sin(a)]
  const gc: V3 = [GALAXY_DIR[0] * GALAXY_DIST, GALAXY_DIR[1] * GALAXY_DIST, GALAXY_DIR[2] * GALAXY_DIST]
  const dist = 470 * distScale
  return [gc[0] + dir[0] * dist, gc[1] + dir[1] * dist, gc[2] + dir[2] * dist]
}

export interface Pose {
  camPos: V3
  camLook: V3
  fov: number
  /** which world is drawn */
  world: 'outside' | 'inside' | 'galaxy'
  telescopeYaw: number
  /** 0 = base meteor shower, 1 = full */
  meteorRate: number
  meteorsOn: boolean
  /** radius of the round eyepiece view as a fraction of the screen's short side, or null for no clipping */
  iris: number | null
  /** extra black over the canvas, 0..1 (for the cut into the eyepiece) */
  blackout: number
  skyGain: number
  asteroid: { on: boolean; pos: V3; scale: number; spin: number }
  galaxyOpacity: number
  /** the camera's up vector (it rolls so that the galaxy's disc ends up level on screen) */
  up: V3
}

const P0base = { pos: [0, 1.15, 3.8] as V3, look: [0, 1.52, 0] as V3, fov: 46 }
const P1 = { pos: [0.1, 1.05, 3.4] as V3, look: [-0.4, 7.05, -1.6] as V3, fov: 34 }
const UP: V3 = [0, 1, 0]

/** on a tall screen the camera backs off so the whole telescope still fits across the narrow width */
export function framing(aspect: number): number {
  return lerp(1, 1.7, clamp((1.25 - aspect) / 0.75))
}

const norm = (v: V3): V3 => {
  const n = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / n, v[1] / n, v[2] / n]
}
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul3 = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/** the camera's right, up and forward axes for a camera at `pos` looking at `look` with up hint `up` */
function basis(pos: V3, look: V3, up: V3) {
  const f = norm(sub3(look, pos))
  const r = norm(cross3(f, up))
  const u = cross3(r, f)
  return { f, r, u }
}
/** a point given in the camera's own frame (x right, y up, d ahead) */
function fromCam(pos: V3, look: V3, up: V3, o: V3): V3 {
  const b = basis(pos, look, up)
  return add3(add3(add3(pos, mul3(b.f, o[2])), mul3(b.r, o[0])), mul3(b.u, o[1]))
}
function toCam(pos: V3, look: V3, up: V3, p: V3): V3 {
  const b = basis(pos, look, up)
  const d = sub3(p, pos)
  return [dot3(d, b.r), dot3(d, b.u), dot3(d, b.f)]
}

// ---- step 3, in phases of u (0..1 over the step)
const U_CUT = 0.255 // the cut from the outside shot to the round eyepiece view
const U_ASTEROID = 0.3 // the asteroid enters
const U_CROSSED = 0.45 // it has crossed the inside view
const INSIDE_LOOK: V3 = norm([0.18, 0.2, -1])

function galaxyCentre(): V3 {
  return mul3(GALAXY_DIR, GALAXY_DIST)
}

/** the camera once we are inside the star field (u >= U_CUT): it swings toward the galaxy, then dollies in to the end pose */
function insideCamera(u: number, aspect: number) {
  const gc = galaxyCentre()
  const sweep = easeInOut(seg(u, 0.4, 0.72))
  const dolly = easeInOut(seg(u, 0.56, 1))
  const endPos = galaxyEndCamera(lerp(1, 1.9, clamp((1.25 - aspect) / 0.75)))
  const pos = lerp3([0, 0, 0], endPos, dolly)
  const ahead: V3 = mul3(INSIDE_LOOK, 120)
  const look = lerp3(ahead, gc, sweep)
  const upBlend = smooth(seg(u, 0.66, 1))
  const up = norm(lerp3(UP, GALAXY_NORMAL, upBlend))
  const fov = lerp(lerp(34, 50, easeInOut(seg(u, 0.265, 0.37))), 52, dolly)
  return { pos, look, up, fov }
}

export function pose(tIn: number, aspect = 16 / 9): Pose {
  const t = clamp(tIn, 0, STEP_COUNT)
  const k0 = framing(aspect)
  const P0 = { ...P0base, pos: lerp3(P0base.look, P0base.pos, k0) }
  const base: Pose = {
    camPos: P0.pos,
    camLook: P0.look,
    fov: P0.fov,
    world: 'outside',
    telescopeYaw: TELESCOPE.yawStart,
    meteorRate: 0.5,
    meteorsOn: true,
    iris: null,
    blackout: 0,
    skyGain: 2.6,
    asteroid: { on: false, pos: [0, 0, 0], scale: 1, spin: 0 },
    galaxyOpacity: 0,
    up: UP,
  }

  // steps 1 and 2: push in toward the radiant, then back out
  if (t <= 2) {
    const k = t <= 1 ? easeInOut(t) : easeInOut(2 - t)
    return {
      ...base,
      camPos: lerp3(P0.pos, P1.pos, k),
      camLook: lerp3(P0.look, P1.look, k),
      fov: lerp(P0.fov, P1.fov, k),
      meteorRate: lerp(0.5, 0.95, k),
    }
  }

  const u = t - 2

  // ---- outside: the telescope turns while the camera arcs round to its eyepiece, then pushes into the eye lens
  if (u < U_CUT) {
    const turn = easeInOut(seg(u, 0, 0.17))
    const yaw = lerp(TELESCOPE.yawStart, TELESCOPE.yawEyepiece, turn)
    const eye = yawVec(eyeLensLocal(), yaw)
    const dir = yawVec([1, 0, 0], yaw) // the eyepiece axis, pointing out toward whoever looks in
    const stand: V3 = add3(eye, mul3(dir, 0.95))
    const press: V3 = add3(eye, mul3(dir, 0.03))
    const approach = easeInOut(seg(u, 0.02, 0.17))
    const push = easeInOut(seg(u, 0.17, 0.245))
    // an arc rather than a straight line: the control point swings out to the side, so the camera orbits as it closes in
    const ctrl: V3 = [stand[0] + 1.3, stand[1] + 0.25, (P0.pos[2] + stand[2]) / 2 + 0.6]
    const a1 = lerp3(P0.pos, ctrl, approach)
    const a2 = lerp3(ctrl, stand, approach)
    let camPos = lerp3(a1, a2, approach)
    camPos = lerp3(camPos, press, push)
    const centre: V3 = [0, 1.45, 0]
    const lock = smooth(seg(u, 0.07, 0.17))
    const camLook = lerp3(lerp3(P0.look, centre, smooth(seg(u, 0, 0.08))), eye, lock)
    const fov = lerp(P0.fov, 30, approach) - 13 * push
    return {
      ...base,
      camPos,
      camLook,
      fov,
      telescopeYaw: yaw,
      meteorRate: lerp(0.5, 0.15, approach),
      blackout: smooth(seg(u, 0.235, U_CUT)),
    }
  }

  // ---- inside: the round eyepiece view opens, an asteroid crosses it, the camera chases it and the galaxy appears
  const cam = insideCamera(u, aspect)
  const open = easeInOut(seg(u, 0.265, 0.37))
  const showGalaxy = smooth(seg(u, 0.5, 0.82))

  // the asteroid: a fast crossing in world space, then it stays ahead of the camera and flies off past the galaxy
  let ast: Pose['asteroid'] = { on: false, pos: [0, 0, 0], scale: 3, spin: u * 14 }
  if (u >= U_ASTEROID && u < 0.97) {
    const crossing = easeInOut(seg(u, U_ASTEROID, U_CROSSED))
    const worldA: V3 = [lerp(28, -14, crossing), lerp(7, 2.4, crossing), lerp(-54, -34, crossing)]
    if (u < U_CROSSED) {
      ast = { on: true, pos: worldA, scale: 3.2, spin: u * 14 }
    } else {
      // from here on it is placed relative to the camera, so it cannot swallow the galaxy: it hangs ahead, slightly right of the
      // galaxy's centre, then accelerates leftward across the galaxy and out of the frame
      const c0 = insideCamera(U_CROSSED, aspect)
      const rel0 = toCam(c0.pos, c0.look, c0.up, [-14, 2.4, -34])
      const hold: V3 = [10, 3, 110]
      const exit: V3 = [-300, 34, 200]
      const toHold = easeInOut(seg(u, U_CROSSED, 0.62))
      const out = Math.pow(seg(u, 0.78, 0.96), 2.2)
      const rel = lerp3(lerp3(rel0, hold, toHold), exit, out)
      ast = { on: true, pos: fromCam(cam.pos, cam.look, cam.up, rel), scale: lerp(3.2, 2.6, toHold), spin: u * 14 }
    }
  }

  return {
    ...base,
    camPos: cam.pos,
    camLook: cam.look,
    fov: cam.fov,
    up: cam.up,
    world: u < 0.5 ? 'inside' : 'galaxy',
    telescopeYaw: TELESCOPE.yawEyepiece,
    meteorsOn: false,
    iris: lerp(0.2, 1.25, open),
    blackout: 1 - smooth(seg(u, U_CUT, 0.285)),
    skyGain: lerp(4.2, 2.4, easeInOut(seg(u, 0.56, 1))),
    asteroid: ast,
    galaxyOpacity: showGalaxy,
  }
}

/** the caption shown at rest after step k (k = 0 means the opening frame) */
export const CAPTIONS: (string | null)[] = [null, "Let's take a look", 'Something out there is worth a closer look.', null]

/** the plain night sky behind the story: no telescope, no galaxy, no asteroid, just stars */
export function storyBackdrop(): Pose {
  return {
    camPos: [0, 0, 0],
    camLook: mul3(norm([0.25, 0.32, -1]), 100),
    fov: 56,
    world: 'inside',
    telescopeYaw: TELESCOPE.yawEyepiece,
    meteorRate: 0,
    meteorsOn: false,
    iris: null,
    blackout: 0,
    skyGain: 3.2,
    asteroid: { on: false, pos: [0, 0, 0], scale: 1, spin: 0 },
    galaxyOpacity: 0,
    up: UP,
  }
}
