import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Group, NormalBlending, PerspectiveCamera, Points, Quaternion, ShaderMaterial, Vector3 } from 'three'
import { mulberry32 } from '../../lib/model'
import { GALAXY_DIR, GALAXY_DIST, GALAXY_NORMAL, GALAXY_RADIUS } from '../timeline'
import { stage } from '../stage'

// A procedural barred-free spiral built star by star: an old yellow bulge, a thin disc with four logarithmic arms (two strong, two
// faint), young blue stars strung along the arms, pink star-forming knots, and dark dust lanes on the inner edge of each arm.
// Stars are additive soft points; the dust is drawn on top in dark, so it really darkens what is behind it.

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
  gl_PointSize = clamp(px, 1.0, 96.0);
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

function build(n: number) {
  const R = GALAXY_RADIUS
  const rng = mulberry32(8675309)
  const stars = { pos: [] as number[], col: [] as number[], size: [] as number[], alpha: [] as number[] }
  const dust = { pos: [] as number[], col: [] as number[], size: [] as number[], alpha: [] as number[] }
  const push = (b: typeof stars, x: number, y: number, z: number, c: [number, number, number], s: number, a: number) => {
    b.pos.push(x, y, z)
    b.col.push(c[0], c[1], c[2])
    b.size.push(s)
    b.alpha.push(a)
  }
  const warm: [number, number, number] = [1.0, 0.76, 0.48]
  const cream: [number, number, number] = [1.0, 0.9, 0.78]
  const white: [number, number, number] = [0.92, 0.93, 1.0]
  const blue: [number, number, number] = [0.58, 0.74, 1.0]
  const mix = (a: [number, number, number], b: [number, number, number], k: number): [number, number, number] => [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
  ]
  const armAngle = (arm: number, r: number) => (arm * Math.PI) / 2 + Math.log(1 + (r / R) * 9) * 2.1

  // the bulge: an old, round, yellow population
  const nBulge = Math.floor(n * 0.2)
  for (let i = 0; i < nBulge; i++) {
    const r = Math.abs(randn(rng)) * R * 0.085
    const th = rng() * Math.PI * 2
    const ph = Math.acos(2 * rng() - 1)
    const c = mix(warm, cream, rng() * 0.6)
    push(stars, r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.7, r * Math.sin(ph) * Math.sin(th), c, 0.7 + rng() * 1.2, 0.5 + rng() * 0.5)
  }

  // the disc
  const nDisc = Math.floor(n * 0.7)
  for (let i = 0; i < nDisc; i++) {
    const u = rng()
    const h = R * 0.3
    const r = Math.min(R * 1.02, -Math.log(1 - u * (1 - Math.exp(-R / h))) * h)
    const rn = r / R
    const armW = rng() < 0.7
    const arm = armW ? (rng() < 0.7 ? Math.floor(rng() * 2) * 2 : 1 + Math.floor(rng() * 2) * 2) : -1
    const th = arm >= 0 ? armAngle(arm, r) + randn(rng) * (0.13 + 0.2 * rn) : rng() * Math.PI * 2
    const y = randn(rng) * R * (0.006 + 0.02 * (1 - rn) * (1 - rn))
    const young = arm >= 0 && rng() < 0.55 * rn + 0.1
    let c: [number, number, number]
    if (young) c = mix(white, blue, 0.35 + rng() * 0.65)
    else c = mix(mix(warm, cream, smoothstep(0.0, 0.25, rn)), white, smoothstep(0.2, 0.9, rn) * (0.5 + 0.5 * rng()))
    const bright = young ? 0.8 + rng() * 0.6 : 0.4 + rng() * 0.6
    push(stars, Math.cos(th) * r, y, Math.sin(th) * r, c, (young ? 0.9 : 0.6) + rng() * 1.5, bright)
  }

  // star-forming knots: pink clouds with a few hot stars inside, strung along the arms
  const nKnots = 140
  for (let k = 0; k < nKnots; k++) {
    const arm = Math.floor(rng() * 4)
    const r = R * (0.22 + rng() * 0.68)
    const th = armAngle(arm, r) + randn(rng) * 0.06
    const cx = Math.cos(th) * r
    const cz = Math.sin(th) * r
    const cy = randn(rng) * R * 0.004
    const sz = 6 + rng() * 12
    push(stars, cx, cy, cz, [1.0, 0.36, 0.58], sz * 2.0, 0.07 + rng() * 0.08)
    const m = 6 + Math.floor(rng() * 10)
    for (let j = 0; j < m; j++) {
      push(stars, cx + randn(rng) * sz * 0.4, cy + randn(rng) * 1.2, cz + randn(rng) * sz * 0.4, [0.75, 0.85, 1.0], 1.2 + rng() * 1.4, 0.9)
    }
  }

  // diffuse light: the soft blue-white glow of unresolved young stars along the arms, and the warm glow of the disc itself
  for (let i = 0; i < 7000; i++) {
    const arm = rng() < 0.7 ? Math.floor(rng() * 2) * 2 : 1 + Math.floor(rng() * 2) * 2
    const r = R * (0.1 + Math.pow(rng(), 0.9) * 0.88)
    const th = armAngle(arm, r) + randn(rng) * (0.1 + 0.12 * (r / R))
    push(stars, Math.cos(th) * r, randn(rng) * 1.5, Math.sin(th) * r, mix([0.8, 0.86, 1.0], [0.6, 0.72, 1.0], rng()), 18 + rng() * 22, 0.012 + rng() * 0.022)
  }
  for (let i = 0; i < 3500; i++) {
    const r = Math.min(R, -Math.log(1 - rng() * 0.97) * R * 0.3)
    const th = rng() * Math.PI * 2
    push(stars, Math.cos(th) * r, randn(rng) * 1.2, Math.sin(th) * r, [1.0, 0.82, 0.62], 26 + rng() * 30, 0.008 + rng() * 0.014)
  }

  // the dust lanes: dark, on the inner edge of each arm
  const nDust = 1700
  for (let i = 0; i < nDust; i++) {
    const arm = Math.floor(rng() * 4)
    const r = R * (0.16 + Math.pow(rng(), 0.9) * 0.56)
    const th = armAngle(arm, r) - 0.15 + randn(rng) * 0.04
    push(dust, Math.cos(th) * r, randn(rng) * 1.3, Math.sin(th) * r, [0.025, 0.014, 0.01], 5 + rng() * 9, (0.12 + rng() * 0.14) * (1 - (r / R) * 0.9))
  }

  // the glow of the unresolved core and a faint halo
  for (let i = 0; i < 4; i++) push(stars, 0, 0, 0, [1.0, 0.78, 0.52], 60 - i * 12, 0.16)
  const nHalo = Math.floor(n * 0.03)
  for (let i = 0; i < nHalo; i++) {
    const r = R * (0.15 + rng() * 0.9)
    const th = rng() * Math.PI * 2
    const ph = Math.acos(2 * rng() - 1)
    push(stars, r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.8, r * Math.sin(ph) * Math.sin(th), mix(warm, white, 0.5), 0.6 + rng(), 0.22)
  }

  const mkGeo = (b: typeof stars) => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(b.pos), 3))
    g.setAttribute('aColor', new BufferAttribute(new Float32Array(b.col), 3))
    g.setAttribute('aSize', new BufferAttribute(new Float32Array(b.size), 1))
    g.setAttribute('aAlpha', new BufferAttribute(new Float32Array(b.alpha), 1))
    return g
  }
  return { stars: mkGeo(stars), dust: mkGeo(dust) }
}
function smoothstep(a: number, b: number, x: number) {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return k * k * (3 - 2 * k)
}

export default function Galaxy({ lite }: { lite: boolean }) {
  const group = useRef<Group>(null)
  const starPts = useRef<Points>(null)
  const dustPts = useRef<Points>(null)

  const { stars, dust, starMat, dustMat } = useMemo(() => {
    const { stars, dust } = build(lite ? 52000 : 150000)
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

  // the disc lies perpendicular to GALAXY_NORMAL; the camera ends up about 50 degrees off that axis
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
    g.rotateY(clock.elapsedTime * 0.012)
    const fov = (camera as PerspectiveCamera).fov
    const scale = size.height / (2 * Math.tan((fov * Math.PI) / 360))
    for (const m of [starMat, dustMat]) {
      m.uniforms.uScale.value = scale
      m.uniforms.uOpacity.value = p.galaxyOpacity
    }
  })

  return (
    <group ref={group} visible={false}>
      <points ref={starPts} geometry={stars} material={starMat} frustumCulled={false} renderOrder={1} />
      <points ref={dustPts} geometry={dust} material={dustMat} frustumCulled={false} renderOrder={2} />
    </group>
  )
}
