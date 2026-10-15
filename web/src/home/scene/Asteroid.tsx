import { useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { BufferGeometry, Group, Mesh } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { stage } from '../stage'

// The rock is the real shape of Bennu: NASA SVS global model (OLA v20, 3.4 million triangles) simplified to about 40,000 triangles.
// Normalised to a unit radius, so `scale` is its radius in scene units.

function useBennu(url: string): BufferGeometry {
  const gltf = useLoader(GLTFLoader, url)
  return useMemo(() => {
    let geo: BufferGeometry | null = null
    gltf.scene.traverse((o) => {
      if (!geo && (o as Mesh).isMesh) geo = (o as Mesh).geometry.clone()
    })
    const g: BufferGeometry = geo ?? new BufferGeometry()
    g.computeBoundingSphere()
    const s = g.boundingSphere
    if (s) {
      g.translate(-s.center.x, -s.center.y, -s.center.z)
      g.scale(1 / s.radius, 1 / s.radius, 1 / s.radius)
    }
    g.computeVertexNormals()
    return g
  }, [gltf])
}

function RockMaterial() {
  return <meshStandardMaterial color="#77736d" roughness={1} metalness={0} envMapIntensity={0.5} />
}

/** the asteroid that streaks past inside the telescope and that the camera then chases */
export function HeroAsteroid({ url }: { url: string }) {
  const geometry = useBennu(url)
  const ref = useRef<Group>(null)
  useFrame(({ clock }) => {
    const g = ref.current
    if (!g) return
    const a = stage.p.asteroid
    g.visible = a.on
    if (!a.on) return
    g.position.set(a.pos[0], a.pos[1], a.pos[2])
    g.scale.setScalar(a.scale)
    g.rotation.set(a.spin * 0.4 + 0.3, a.spin + clock.elapsedTime * 0.25, 0.4)
  })
  return (
    <group ref={ref} visible={false}>
      <mesh geometry={geometry}>
        <RockMaterial />
      </mesh>
    </group>
  )
}

const DRIFT = [
  { dir: [0.62, 0.42, -0.66], dist: 150, size: 1.5, rate: 0.012, seed: 1.2 },
  { dir: [-0.5, 0.6, -0.62], dist: 210, size: 2.4, rate: -0.008, seed: 2.7 },
  { dir: [0.05, 0.3, -0.95], dist: 120, size: 1.0, rate: 0.015, seed: 4.1 },
]

/** a few distant rocks drifting across the sky, always there, far too small to read as more than a tumbling speck of rock */
export function DriftRocks({ url }: { url: string }) {
  const geometry = useBennu(url)
  const refs = useRef<(Group | null)[]>([])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const on = stage.p.world === 'outside'
    DRIFT.forEach((d, i) => {
      const g = refs.current[i]
      if (!g) return
      g.visible = on
      const a = t * d.rate + d.seed
      const x = d.dir[0] * d.dist + Math.cos(a) * 30
      const y = d.dir[1] * d.dist + Math.sin(a * 1.3) * 8
      const z = d.dir[2] * d.dist
      g.position.set(x, y, z)
      g.rotation.set(t * 0.21 + d.seed, t * 0.33, t * 0.17)
      g.scale.setScalar(d.size)
    })
  })
  return (
    <>
      {DRIFT.map((_, i) => (
        <group key={i} ref={(el) => void (refs.current[i] = el)}>
          <mesh geometry={geometry}>
            <RockMaterial />
          </mesh>
        </group>
      ))}
    </>
  )
}
