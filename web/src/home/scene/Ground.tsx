import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, DoubleSide, Float32BufferAttribute, Group, IcosahedronGeometry, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, Vector3 } from 'three'
import { useRef } from 'react'
import { stage } from '../stage'

// small value noise so the hill and the far ridge are not smooth maths
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
  return (
    hash(xi, yi) * (1 - u) * (1 - v) + hash(xi + 1, yi) * u * (1 - v) + hash(xi, yi + 1) * (1 - u) * v + hash(xi + 1, yi + 1) * u * v
  )
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

/** A dark hilltop: the ground the telescope stands on, falling away to a ridge line on the horizon. */
export default function Ground() {
  const group = useRef<Group>(null)

  const hill = useMemo(() => {
    const g = new PlaneGeometry(260, 260, 160, 160)
    g.rotateX(-Math.PI / 2)
    const pos = g.getAttribute('position') as BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const r = Math.hypot(x, z)
      const crown = -Math.pow(r / 64, 2) * 7.5
      const bumps = (fbm(x * 0.06, z * 0.06) - 0.5) * 2.4 * Math.min(1, r / 6)
      const fine = (fbm(x * 0.9, z * 0.9) - 0.5) * 0.14
      pos.setY(i, crown + bumps + fine - 0.02)
    }
    g.computeVertexNormals()
    return g
  }, [])

  // the far ridge: a wall whose top edge follows noise, so the sky meets a real skyline
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

  // pebbles and stones scattered over the hilltop, so the ground has scale and the moonlight has something to catch
  const stones = useRef<InstancedMesh>(null)
  const stoneGeo = useMemo(() => {
    const g = new IcosahedronGeometry(1, 2)
    const pos = g.getAttribute('position') as BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      const k = 0.78 + 0.34 * noise(x * 2.3 + 11, z * 2.3 + y * 1.7)
      pos.setXYZ(i, x * k, y * k * 0.62, z * k)
    }
    g.computeVertexNormals()
    return g
  }, [])
  const placed = useRef(false)

  useFrame(() => {
    if (group.current) group.current.visible = stage.p.world === 'outside'
    const m = stones.current
    if (m && !placed.current) {
      placed.current = true
      const rng = (() => {
        let a = 1234567
        return () => {
          a = (a + 0x6d2b79f5) | 0
          let t = Math.imul(a ^ (a >>> 15), 1 | a)
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296
        }
      })()
      const mat = new Matrix4()
      const q = new Quaternion()
      for (let i = 0; i < m.count; i++) {
        const r = 0.9 + Math.pow(rng(), 0.7) * 16
        const a = rng() * Math.PI * 2
        const x = Math.cos(a) * r
        const z = Math.sin(a) * r
        const size = (0.025 + Math.pow(rng(), 3) * 0.3) * (1 + r * 0.02)
        const rise = -Math.pow(r / 64, 2) * 7.5 + (fbm(x * 0.06, z * 0.06) - 0.5) * 2.4 * Math.min(1, r / 6)
        q.setFromAxisAngle(new Vector3(rng(), rng(), rng()).normalize(), rng() * Math.PI * 2)
        mat.compose(new Vector3(x, rise + size * 0.1, z), q, new Vector3(size * (0.8 + rng() * 0.6), size, size * (0.8 + rng() * 0.6)))
        m.setMatrixAt(i, mat)
      }
      m.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <group ref={group}>
      <mesh geometry={hill} receiveShadow>
        <meshStandardMaterial color="#030304" roughness={1} metalness={0} envMapIntensity={0.05} />
      </mesh>
      <instancedMesh ref={stones} args={[stoneGeo, undefined, 420]}>
        <meshStandardMaterial color="#0d0d0f" roughness={0.95} metalness={0} envMapIntensity={0.3} />
      </instancedMesh>
      <mesh geometry={ridge}>
        <meshBasicMaterial color="#030304" side={DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  )
}
