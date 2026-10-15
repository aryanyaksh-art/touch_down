import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three'
import { makeSurface } from './procTex'
import { stage } from '../stage'

// value noise for the hill's shape
function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}
function noise(x: number, y: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  return hash(xi, yi) * (1 - u) * (1 - v) + hash(xi + 1, yi) * u * (1 - v) + hash(xi, yi + 1) * (1 - u) * v + hash(xi + 1, yi + 1) * u * v
}
function fbm(x: number, y: number) {
  let a = 0.5
  let f = 1
  let s = 0
  for (let i = 0; i < 4; i++) {
    s += a * noise(x * f, y * f)
    f *= 2.07
    a *= 0.5
  }
  return s
}
const hillHeight = (x: number, z: number) => {
  const r = Math.hypot(x, z)
  return -Math.pow(r / 64, 2) * 7.5 + (fbm(x * 0.06, z * 0.06) - 0.5) * 2.4 * Math.min(1, r / 6) + (fbm(x * 0.9, z * 0.9) - 0.5) * 0.12 * Math.min(1, r / 4) - 0.02
}
function rng32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PAD_R = 1.5

/** A dark hilltop at night: gravel with real pebble relief, a concrete pad with anchor bolts under the telescope, stones,
 *  and a far ridge for the skyline. Everything is lit by the same low moon as the telescope. */
export default function Ground() {
  const group = useRef<Group>(null)
  const stones = useRef<InstancedMesh>(null)
  const placed = useRef(false)

  const gravel = useMemo(
    () => makeSurface({ seed: 11, low: [0.012, 0.012, 0.013], high: [0.075, 0.072, 0.068], pebbles: 22, pebbleWeight: 0.85, blotch: 5, blotchWeight: 0.5, speck: 0.4, normalStrength: 3.0, repeat: 90 }),
    [],
  )
  const concrete = useMemo(
    () => makeSurface({ seed: 5, low: [0.03, 0.031, 0.033], high: [0.1, 0.1, 0.105], pebbles: 0, blotch: 5, blotchWeight: 0.8, speck: 1.6, normalStrength: 1.2, repeat: 2 }),
    [],
  )

  const hill = useMemo(() => {
    const g = new PlaneGeometry(260, 260, 200, 200)
    g.rotateX(-Math.PI / 2)
    const pos = g.getAttribute('position') as BufferAttribute
    for (let i = 0; i < pos.count; i++) pos.setY(i, hillHeight(pos.getX(i), pos.getZ(i)))
    g.computeVertexNormals()
    return g
  }, [])

  const ridge = useMemo(() => {
    const N = 360
    const R = 330
    const verts: number[] = []
    const idx: number[] = []
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2
      const h = 9 + fbm(Math.cos(a) * 3.1 + 5, Math.sin(a) * 3.1 + 5) * 34 + fbm(a * 24, 3) * 4
      verts.push(Math.cos(a) * R, -30, Math.sin(a) * R, Math.cos(a) * R, h - 22, Math.sin(a) * R)
      if (i < N) {
        const b = i * 2
        idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3)
      }
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(verts, 3))
    g.setIndex(idx)
    return g
  }, [])

  const stoneGeo = useMemo(() => {
    const g = new IcosahedronGeometry(1, 3)
    const pos = g.getAttribute('position') as BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      const k = 0.74 + 0.4 * noise(x * 1.7 + 11, z * 1.7 + y * 1.3) + 0.08 * noise(x * 7, z * 7 + y * 5)
      pos.setXYZ(i, x * k, y * k * 0.6, z * k)
    }
    g.computeVertexNormals()
    return g
  }, [])

  const padEdge = useMemo(() => new CylinderGeometry(PAD_R + 0.03, PAD_R + 0.06, 0.1, 64), [])
  const padTop = useMemo(() => new CylinderGeometry(PAD_R, PAD_R + 0.02, 0.07, 64), [])

  useFrame(() => {
    if (group.current) group.current.visible = stage.p.world === 'outside'
    if (placed.current) return
    const s = stones.current
    if (!s) return
    placed.current = true
    const rng = rng32(1234567)
    const mat = new Matrix4()
    const q = new Quaternion()
    const axis = new Vector3()
    for (let i = 0; i < s.count; i++) {
      const bigOnes = i < 70
      const r = (bigOnes ? 2.4 : 1.7) + Math.pow(rng(), i % 3 === 0 ? 0.5 : 0.8) * (bigOnes ? 15 : 22)
      const a = rng() * Math.PI * 2
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      const size = bigOnes ? 0.12 + Math.pow(rng(), 2) * 0.5 : 0.02 + Math.pow(rng(), 2.2) * 0.17
      axis.set(rng() - 0.5, 1, rng() - 0.5).normalize()
      q.setFromAxisAngle(axis, rng() * Math.PI * 2)
      mat.compose(new Vector3(x, hillHeight(x, z) + size * 0.05, z), q, new Vector3(size * (0.8 + rng() * 0.7), size, size * (0.8 + rng() * 0.7)))
      s.setMatrixAt(i, mat)
    }
    s.instanceMatrix.needsUpdate = true
  })

  const bolts = [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (i / 6) * Math.PI * 2 + 0.3
    return [Math.cos(a) * (PAD_R - 0.16), 0.045, Math.sin(a) * (PAD_R - 0.16)] as [number, number, number]
  })

  return (
    <group ref={group}>
      <mesh geometry={hill} receiveShadow>
        <meshStandardMaterial map={gravel.map} normalMap={gravel.normalMap} normalScale={[1.8, 1.8]} roughness={0.95} metalness={0} envMapIntensity={0.15} />
      </mesh>
      {/* the concrete pad: weathered slab with a chamfered edge and six anchor bolts */}
      <mesh geometry={padEdge} position={[0, -0.02, 0]}>
        <meshStandardMaterial map={concrete.map} normalMap={concrete.normalMap} roughness={0.9} envMapIntensity={0.3} />
      </mesh>
      <mesh geometry={padTop} position={[0, 0.0, 0]}>
        <meshStandardMaterial map={concrete.map} normalMap={concrete.normalMap} normalScale={[0.8, 0.8]} roughness={0.82} envMapIntensity={0.45} />
      </mesh>
      {bolts.map((p, i) => (
        <group key={i} position={p}>
          <mesh position={[0, 0.012, 0]}>
            <cylinderGeometry args={[0.022, 0.022, 0.016, 6]} />
            <meshStandardMaterial color="#7c8087" metalness={1} roughness={0.4} envMapIntensity={1.2} />
          </mesh>
          <mesh position={[0, 0.002, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.006, 20]} />
            <meshStandardMaterial color="#5c5f65" metalness={1} roughness={0.5} envMapIntensity={1} />
          </mesh>
        </group>
      ))}
      <instancedMesh ref={stones} args={[stoneGeo, undefined, 1800]}>
        <meshStandardMaterial map={gravel.map} normalMap={gravel.normalMap} color="#2a2a2c" roughness={0.9} metalness={0} envMapIntensity={0.3} />
      </instancedMesh>
      <mesh geometry={ridge}>
        <meshBasicMaterial color="#030304" side={DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  )
}
