// The home page is one continuous timeline t in [0, 4]. Step k plays t from k-1 to k. Everything the scene shows is a pure function
// of t (pose(t)), so any frame can be reproduced, scrubbed and screenshot, and playing a step backwards is just t decreasing.
//
//   step 1  t 0..1  push in toward the meteor radiant            (caption: "Let's take a look")
//   step 2  t 1..2  pull back to the telescope view
//   step 3  t 2..3  the telescope turns, the camera flies into the eyepiece, the iris opens on the star field, an asteroid streaks by
//   step 4  t 3..4  the camera swings round and chases the asteroid, then dollies in to reveal the galaxy

export type V3 = [number, number, number]

export const STEP_COUNT = 4
/** seconds each step takes when played at full length */
export const STEP_SECONDS = [4.6, 3.6, 9.5, 10.5]

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
function galaxyEndCamera(): V3 {
  const N = GALAXY_NORMAL
  const toViewer: V3 = [-GALAXY_DIR[0], -GALAXY_DIR[1], -GALAXY_DIR[2]]
  const d = toViewer[0] * N[0] + toViewer[1] * N[1] + toViewer[2] * N[2]
  const w: V3 = [toViewer[0] - N[0] * d, toViewer[1] - N[1] * d, toViewer[2] - N[2] * d]
  const wl = Math.hypot(...w) || 1
  const a = 0.86
  const dir: V3 = [N[0] * Math.cos(a) + (w[0] / wl) * Math.sin(a), N[1] * Math.cos(a) + (w[1] / wl) * Math.sin(a), N[2] * Math.cos(a) + (w[2] / wl) * Math.sin(a)]
  const gc: V3 = [GALAXY_DIR[0] * GALAXY_DIST, GALAXY_DIR[1] * GALAXY_DIST, GALAXY_DIR[2] * GALAXY_DIST]
  const dist = 470
  return [gc[0] + dir[0] * dist, gc[1] + dir[1] * dist, gc[2] + dir[2] * dist]
}
export const GALAXY_END_CAMERA = galaxyEndCamera()

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
}

const P0 = { pos: [0, 1.15, 3.8] as V3, look: [0, 1.52, 0] as V3, fov: 46 }
const P1 = { pos: [0.1, 1.05, 3.4] as V3, look: [-0.5 + 0.1, 1.05 + 6, 3.4 - 5] as V3, fov: 34 }

const sameNaN = (v: number) => (Number.isFinite(v) ? v : 0)

export function pose(tIn: number): Pose {
  const t = clamp(tIn, 0, STEP_COUNT)
  const base: Pose = {
    camPos: P0.pos,
    camLook: P0.look,
    fov: P0.fov,
    world: 'outside',
    telescopeYaw: TELESCOPE.yawStart,
    meteorRate: 0.25,
    meteorsOn: true,
    iris: null,
    blackout: 0,
    skyGain: 2.6,
    asteroid: { on: false, pos: [0, 0, 0], scale: 1, spin: 0 },
    galaxyOpacity: 0,
  }

  // steps 1 and 2: push in toward the radiant, then back out
  if (t <= 2) {
    const k = t <= 1 ? easeInOut(t) : easeInOut(2 - t)
    return {
      ...base,
      camPos: lerp3(P0.pos, P1.pos, k),
      camLook: lerp3(P0.look, P1.look, k),
      fov: lerp(P0.fov, P1.fov, k),
      meteorRate: lerp(0.25, 0.8, k),
    }
  }

  // step 3
  if (t <= 3) {
    const u = t - 2
    const turn = easeInOut(seg(u, 0, 0.5))
    const yaw = lerp(TELESCOPE.yawStart, TELESCOPE.yawEyepiece, turn)
    const eye = yawVec(eyeLensLocal(), yaw)
    const dir = yawVec([1, 0, 0], yaw) // the eyepiece axis, pointing out toward whoever looks in
    const stand: V3 = [eye[0] + dir[0] * 1.15, eye[1] + dir[1] * 1.15, eye[2] + dir[2] * 1.15]
    const press: V3 = [eye[0] + dir[0] * 0.035, eye[1] + dir[1] * 0.035, eye[2] + dir[2] * 0.035]
    const approach = easeInOut(seg(u, 0.05, 0.5))
    const push = easeInOut(seg(u, 0.5, 0.6))
    let camPos = lerp3(P0.pos, stand, approach)
    camPos = lerp3(camPos, press, push)
    // the camera keeps the whole telescope in view while it turns, then locks onto the eyepiece
    const lock = smooth(seg(u, 0.18, 0.5))
    const centre: V3 = [0, 1.45, 0]
    const camLook = lerp3(lerp3(P0.look, centre, smooth(seg(u, 0, 0.2))), eye, lock)
    const fov = lerp(P0.fov, 30, approach) - 14 * push

    // the cut into the round eyepiece view at u = 0.6, then the iris opens
    const cut = u >= 0.6
    if (!cut) {
      return {
        ...base,
        camPos,
        camLook,
        fov,
        telescopeYaw: yaw,
        meteorRate: lerp(0.25, 0.1, approach),
        blackout: smooth(seg(u, 0.55, 0.6)),
      }
    }
    const open = easeInOut(seg(u, 0.64, 0.9))
    const ast = seg(u, 0.74, 1)
    return {
      ...base,
      camPos: [0, 0, 0],
      camLook: [0.18, 0.2, -1],
      fov: lerp(34, 50, open),
      world: 'inside',
      telescopeYaw: yaw,
      meteorsOn: false,
      iris: lerp(0.2, 1.25, open),
      blackout: 1 - smooth(seg(u, 0.6, 0.66)),
      skyGain: 4.2,
      asteroid: {
        on: u >= 0.74,
        pos: [lerp(26, -14, easeInOut(ast)), lerp(7, 2.4, ast), lerp(-52, -34, ast)],
        scale: 3.4,
        spin: ast * 3.2,
      },
    }
  }

  // step 4: chase the asteroid, then dolly in to the galaxy
  const v = t - 3
  const gc: V3 = [GALAXY_DIR[0] * GALAXY_DIST, GALAXY_DIR[1] * GALAXY_DIST, GALAXY_DIR[2] * GALAXY_DIST]
  const chase = easeInOut(seg(v, 0, 0.5))
  const astPos: V3 = [
    lerp(-14, gc[0] * 0.55, chase) + lerp(0, 0, chase),
    lerp(2.4, gc[1] * 0.55 + 8, chase),
    lerp(-34, gc[2] * 0.55, chase),
  ]
  const approach = easeInOut(seg(v, 0.35, 1))
  const camPos = lerp3([0, 0, 0], GALAXY_END_CAMERA, approach)
  const lookFollow: V3 = [lerp(-14, astPos[0], smooth(v / 0.5)), lerp(2.4, astPos[1], smooth(v / 0.5)), lerp(-34, astPos[2], smooth(v / 0.5))]
  const camLook = lerp3(lookFollow, gc, smooth(seg(v, 0.3, 0.8)))
  const rock = 1 - smooth(seg(v, 0.55, 0.85))
  return {
    ...base,
    camPos,
    camLook,
    fov: lerp(50, 52, approach),
    world: 'galaxy',
    telescopeYaw: TELESCOPE.yawEyepiece,
    meteorsOn: false,
    iris: null,
    skyGain: lerp(4.2, 2.4, approach),
    asteroid: { on: rock > 0.001, pos: astPos, scale: lerp(3.4, 9, chase), spin: 3.2 + v * 4 },
    galaxyOpacity: smooth(seg(v, 0.12, 0.7)),
  }
}

/** the caption shown at rest after step k (k = 0 means the opening frame) */
export const CAPTIONS: (string | null)[] = [null, "Let's take a look", 'Something out there is worth a closer look.', null, null]

export const safeNumber = sameNaN
