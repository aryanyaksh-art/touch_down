import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Group, NormalBlending, PerspectiveCamera, Quaternion, ShaderMaterial, Vector3 } from 'three'
import { mulberry32 } from '../../lib/model'
import { GALAXY_DIR, GALAXY_DIST, GALAXY_NORMAL, GALAXY_RADIUS } from '../timeline'
import { stage } from '../stage'

// A procedural barred spiral built star by star: an old yellow bulge and bar, a thin disc whose two strong arms leave the ends of the bar
// as logarithmic spirals (pitch about 21 degrees) with two faint secondary arms, clumpy and feathered rather than smooth, young blue
// stars and pink star-forming knots strung along the arms, dust lanes on the inner edge of each arm and along the bar, a gentle warp of
// the outer disc, a halo with globular clusters and a small companion galaxy. Stars are additive soft points; the dust is drawn on top
// in dark so it really darkens what is behind it.

const VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aAlpha;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float px = aSize * uScale / max(-mv.z, 1.0);
  gl_PointSize = clamp(px, 1.0, 120.0);
  vColor = aColor;
  vAlpha = aAlpha * (px < 1.0 ? px : 1.0);
}
`
const FRAG = /* glsl */ `
uniform float uOpacity;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = pow(max(1.0 - d, 0.0), 2.2);
  gl_FragColor = vec4(vColor, a * vAlpha * uOpacity);
}
`

function randn(rng: () => number) {
  return Math.sqrt(-2 * Math.log(Math.max(rng(), 1e-9))) * Math.cos(2 * Math.PI * rng())
}
function smoothstep(a: number, b: number, x: number) {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return k * k * (3 - 2 * k)
}
// smooth value noise in (angle, radius) space, used to make the arms clumpy
function hashN(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}
function vnoise(x: number, y: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  return hashN(xi, yi) * (1 - u) * (1 - v) + hashN(xi + 1, yi) * u * (1 - v) + hashN(xi, yi + 1) * (1 - u) * v + hashN(xi + 1, yi + 1) * u * v
}

type Buf = { pos: number[]; col: number[]; size: number[]; alpha: number[] }
const newBuf = (): Buf => ({ pos: [], col: [], size: [], alpha: [] })

function build(n: number) {
  const R = GALAXY_RADIUS
  const rng = mulberry32(8675309)
  const stars = newBuf()
  const dust = newBuf()
  const push = (b: Buf, x: number, y: number, z: number, c: [number, number, number], s: number, a: number) => {
    b.pos.push(x, y, z)
    b.col.push(c[0], c[1], c[2])
    b.size.push(s)
    b.alpha.push(a)
  }
  type C3 = [number, number, number]
  const warm: C3 = [1.0, 0.74, 0.46]
  const cream: C3 = [1.0, 0.9, 0.78]
  const white: C3 = [0.92, 0.93, 1.0]
  const blue: C3 = [0.55, 0.72, 1.0]
  const mix = (a: C3, b: C3, k: number): C3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]

  const BAR = 0.62 // the bar's angle
  const LB = R * 0.2 // half length of the bar
  const K = 3.3 // 1 / tan(pitch): about 17 degrees
  const armTheta = (arm: number, r: number) => BAR + arm * Math.PI + K * Math.log(Math.max(r, LB) / LB)
  const warp = (x: number, z: number) => {
    const rn = Math.hypot(x, z) / R
    return 0.05 * R * rn * rn * Math.sin(Math.atan2(z, x) - 0.4)
  }
  const place = (b: Buf, x: number, y: number, z: number, c: C3, s: number, a: number) => push(b, x, y + warp(x, z), z, c, s, a)

  // the bulge: an old, round, yellow population, a little flattened
  for (let i = 0; i < n * 0.1; i++) {
    const r = Math.abs(randn(rng)) * R * 0.075
    const th = rng() * Math.PI * 2
    const ph = Math.acos(2 * rng() - 1)
    place(stars, r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.65, r * Math.sin(ph) * Math.sin(th), mix(warm, cream, rng() * 0.6), 0.7 + rng() * 1.2, 0.5 + rng() * 0.5)
  }
  // the bar: a long, narrow ridge of the same old stars
  for (let i = 0; i < n * 0.08; i++) {
    const along = randn(rng) * LB * 0.55
    const across = randn(rng) * LB * 0.13
    const x = along * Math.cos(BAR) - across * Math.sin(BAR)
    const z = along * Math.sin(BAR) + across * Math.cos(BAR)
    place(stars, x, randn(rng) * R * 0.006, z, mix(warm, cream, rng() * 0.5), 0.7 + rng() * 1.1, 0.5 + rng() * 0.5)
  }

  // the disc: an exponential smooth component plus the arms
  for (let i = 0; i < n * 0.22; i++) {
    const r = Math.min(R, -Math.log(1 - rng() * 0.985) * R * 0.28)
    const rn = r / R
    const th = rng() * Math.PI * 2
    const c = mix(mix(warm, cream, smoothstep(0, 0.25, rn)), white, smoothstep(0.15, 0.9, rn) * (0.4 + 0.5 * rng()))
    place(stars, Math.cos(th) * r, randn(rng) * R * (0.006 + 0.014 * (1 - rn) * (1 - rn)), Math.sin(th) * r, c, 0.6 + rng() * 1.2, 0.3 + rng() * 0.5)
  }
  const nArms = Math.floor(n * 0.7)
  for (let i = 0; i < nArms; i++) {
    const strong = rng() < 0.66
    const arm = strong ? Math.floor(rng() * 2) : 2 + Math.floor(rng() * 2)
    const r0 = strong ? LB : R * 0.3
    const r = r0 * Math.exp(Math.pow(rng(), 0.82) * Math.log(R / r0))
    const rn = r / R
    // the secondary arms are the strong arms' opposite phase, offset, and start further out
    const th = armTheta(arm % 2, r) + (arm >= 2 ? Math.PI / 2 : 0) + randn(rng) * (0.1 + 0.14 * rn)
    // clumps: keep a star with a probability set by noise along the arm, so the arms are knotted and feathered
    const clump = vnoise(th * 5.2, r * 0.045) * 0.7 + vnoise(th * 17, r * 0.2) * 0.3
    if (rng() > (strong ? 0.38 : 0.2) + clump * 0.9) continue
    const young = rng() < 0.2 + 0.55 * rn
    const c = young ? mix(white, blue, 0.35 + rng() * 0.65) : mix(cream, white, rng() * 0.7)
    place(stars, Math.cos(th) * r, randn(rng) * R * 0.006, Math.sin(th) * r, c, (young ? 0.9 : 0.6) + rng() * 1.5, young ? 0.7 + rng() * 0.6 : 0.4 + rng() * 0.5)
  }
  // feathers and spurs: short branches leaving the arms at a shallow angle
  for (let k = 0; k < 90; k++) {
    const arm = Math.floor(rng() * 2)
    const r = R * (0.3 + rng() * 0.6)
    const th0 = armTheta(arm, r)
    const len = R * (0.05 + rng() * 0.12)
    const m = 40 + Math.floor(rng() * 70)
    for (let j = 0; j < m; j++) {
      const f = rng()
      const rr = r + f * len
      const th = th0 + 0.04 * (f * len) / R * 14 + randn(rng) * 0.02
      place(stars, Math.cos(th) * rr, randn(rng) * R * 0.004, Math.sin(th) * rr, mix(white, blue, rng()), 0.8 + rng() * 1.2, 0.6 + rng() * 0.5)
    }
  }

  // star-forming knots: a pink cloud with hot blue stars inside, strung along the strong arms
  for (let k = 0; k < 210; k++) {
    const arm = Math.floor(rng() * 2)
    const r = R * (0.24 + rng() * 0.7)
    const th = armTheta(arm, r) + randn(rng) * 0.04
    const cx = Math.cos(th) * r
    const cz = Math.sin(th) * r
    const sz = 5 + rng() * 11
    place(stars, cx, randn(rng) * 1.2, cz, [1.0, 0.36, 0.58], sz * 2.2, 0.06 + rng() * 0.08)
    const m = 6 + Math.floor(rng() * 10)
    for (let j = 0; j < m; j++) place(stars, cx + randn(rng) * sz * 0.4, randn(rng) * 1.2, cz + randn(rng) * sz * 0.4, [0.75, 0.86, 1.0], 1.2 + rng() * 1.4, 0.9)
  }

  // diffuse light: blue-white glow of unresolved young stars along the arms, the warm glow of the disc, and a glow in the bar
  for (let i = 0; i < 9000; i++) {
    const arm = rng() < 0.75 ? Math.floor(rng() * 2) : 2 + Math.floor(rng() * 2)
    const r = R * (0.12 + Math.pow(rng(), 0.9) * 0.86)
    const th = armTheta(arm % 2, r) + (arm >= 2 ? Math.PI / 2 : 0) + randn(rng) * (0.08 + 0.1 * (r / R))
    place(stars, Math.cos(th) * r, randn(rng) * 1.5, Math.sin(th) * r, mix([0.8, 0.86, 1.0], [0.6, 0.72, 1.0], rng()), 16 + rng() * 26, 0.006 + rng() * 0.012)
  }
  for (let i = 0; i < 3500; i++) {
    const r = Math.min(R, -Math.log(1 - rng() * 0.97) * R * 0.29)
    const th = rng() * Math.PI * 2
    place(stars, Math.cos(th) * r, randn(rng) * 1.2, Math.sin(th) * r, [1.0, 0.82, 0.62], 26 + rng() * 30, 0.008 + rng() * 0.012)
  }
  for (let i = 0; i < 700; i++) {
    const along = randn(rng) * LB * 0.5
    const x = along * Math.cos(BAR)
    const z = along * Math.sin(BAR)
    place(stars, x + randn(rng) * 3, randn(rng) * 2, z + randn(rng) * 3, [1.0, 0.8, 0.55], 14 + rng() * 16, 0.02 + rng() * 0.02)
  }

  // dust: soft, large, faint clouds along the inner edge of the arms and the bar, so the lanes read as smooth dark filaments
  for (let i = 0; i < 7000; i++) {
    const arm = rng() < 0.8 ? Math.floor(rng() * 2) : 2 + Math.floor(rng() * 2)
    const r = R * (0.24 + Math.pow(rng(), 0.9) * 0.55)
    const th = armTheta(arm % 2, r) + (arm >= 2 ? Math.PI / 2 : 0) - 0.12 + randn(rng) * 0.05
    const fil = vnoise(th * 7, r * 0.09)
    place(dust, Math.cos(th) * r, randn(rng) * 1.1, Math.sin(th) * r, [0.03, 0.017, 0.012], 10 + rng() * 20, (0.006 + rng() * 0.012) * (0.2 + fil) * (1 - (r / R) * 0.8))
  }
  for (let i = 0; i < 160; i++) {
    const along = (rng() - 0.5) * LB * 1.7
    const side = rng() < 0.5 ? -1 : 1
    const across = side * LB * 0.22 + randn(rng) * LB * 0.04
    const x = along * Math.cos(BAR) - across * Math.sin(BAR)
    const z = along * Math.sin(BAR) + across * Math.cos(BAR)
    place(dust, x, randn(rng) * 1, z, [0.03, 0.017, 0.012], 8 + rng() * 8, 0.012 + rng() * 0.016)
  }

  // the unresolved core and its nucleus
  for (let i = 0; i < 6; i++) place(stars, 0, 0, 0, [1.0, 0.78, 0.52], 80 - i * 12, 0.15)
  place(stars, 0, 0, 0, [1.0, 0.95, 0.85], 9, 1)

  // a faint stellar halo with globular clusters
  for (let i = 0; i < n * 0.03; i++) {
    const r = R * (0.12 + rng() * 0.95)
    const th = rng() * Math.PI * 2
    const ph = Math.acos(2 * rng() - 1)
    push(stars, r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.8, r * Math.sin(ph) * Math.sin(th), mix(warm, white, 0.5), 0.6 + rng(), 0.2)
  }
  for (let k = 0; k < 46; k++) {
    const r = R * (0.25 + rng() * 0.8)
    const th = rng() * Math.PI * 2
    const ph = Math.acos(2 * rng() - 1)
    const cx = r * Math.sin(ph) * Math.cos(th)
    const cy = r * Math.cos(ph) * 0.8
    const cz = r * Math.sin(ph) * Math.sin(th)
    for (let j = 0; j < 14; j++) push(stars, cx + randn(rng) * 1.6, cy + randn(rng) * 1.6, cz + randn(rng) * 1.6, [1.0, 0.86, 0.62], 1.2 + rng() * 1.5, 0.8)
  }

  // a small companion galaxy beyond the disc
  const comp: Vector3 = new Vector3(R * 1.32, R * 0.1, R * 0.46)
  for (let i = 0; i < 2600; i++) {
    const r = Math.abs(randn(rng)) * R * 0.075
    const th = rng() * Math.PI * 2
    push(stars, comp.x + Math.cos(th) * r, comp.y + randn(rng) * 2.5, comp.z + Math.sin(th) * r * 0.7, mix(warm, cream, rng()), 0.7 + rng() * 1.2, 0.4 + rng() * 0.4)
  }
  push(stars, comp.x, comp.y, comp.z, [1.0, 0.8, 0.58], 34, 0.14)

  const mkGeo = (b: Buf) => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(b.pos), 3))
    g.setAttribute('aColor', new BufferAttribute(new Float32Array(b.col), 3))
    g.setAttribute('aSize', new BufferAttribute(new Float32Array(b.size), 1))
    g.setAttribute('aAlpha', new BufferAttribute(new Float32Array(b.alpha), 1))
    return g
  }
  return { stars: mkGeo(stars), dust: mkGeo(dust) }
}

export default function Galaxy({ lite }: { lite: boolean }) {
  const group = useRef<Group>(null)

  const { stars, dust, starMat, dustMat } = useMemo(() => {
    const { stars, dust } = build(lite ? 70000 : 210000)
    const mk = (blending: typeof AdditiveBlending | typeof NormalBlending) =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending,
        uniforms: { uScale: { value: 1000 }, uOpacity: { value: 0 } },
      })
    return { stars, dust, starMat: mk(AdditiveBlending), dustMat: mk(NormalBlending) }
  }, [lite])

  // the disc lies perpendicular to GALAXY_NORMAL; the camera rolls so that axis ends up vertical on screen
  const tilt = useMemo(() => new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(...GALAXY_NORMAL)), [])

  useFrame(({ camera, clock, size }) => {
    const p = stage.p
    const g = group.current
    if (!g) return
    const on = p.galaxyOpacity > 0.001
    g.visible = on
    if (!on) return
    g.position.set(GALAXY_DIR[0] * GALAXY_DIST, GALAXY_DIR[1] * GALAXY_DIST, GALAXY_DIR[2] * GALAXY_DIST)
    g.quaternion.copy(tilt)
    g.rotateY(clock.elapsedTime * 0.01)
    const fov = (camera as PerspectiveCamera).fov
    const scale = size.height / (2 * Math.tan((fov * Math.PI) / 360))
    for (const m of [starMat, dustMat]) {
      m.uniforms.uScale.value = scale
      m.uniforms.uOpacity.value = p.galaxyOpacity
    }
  })

  return (
    <group ref={group} visible={false}>
      <points geometry={stars} material={starMat} frustumCulled={false} renderOrder={1} />
      <points geometry={dust} material={dustMat} frustumCulled={false} renderOrder={2} />
    </group>
  )
}
