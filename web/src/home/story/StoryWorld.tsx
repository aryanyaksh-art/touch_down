import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, DirectionalLight, DoubleSide, Float32BufferAttribute, Group, LineBasicMaterial,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, PointsMaterial, Vector2, type Object3D,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { stage } from '../stage'
import { BODY_ABOVE_HEAD, fromTo, storyPose, type Ground, type StoryPose } from './script'
import { buildHazardGrid, buildHeightfield, chooseSites, sampleHeight, type Heightfield, type StorySites } from './terrain'
import { LIFT, Ribbon, buildGridGeometries, revealMaterial } from './draped'

export const TERRAIN_URL = `${import.meta.env.BASE_URL}assets/models/nightingale_site.glb`
export const PROBE_URL = `${import.meta.env.BASE_URL}assets/models/osiris_rex.glb`

// The probe model's sampler head sits at (-2.48, 4.86, 0) with the arm pointing +y; turned upside down and shifted, the head becomes the origin.
const HEAD_IN_MODEL: [number, number, number] = [-2.48, 4.86, 0]

const smooth = (t: number) => t * t * (3 - 2 * t)
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

interface Analysis {
  hf: Heightfield
  ground: Ground
  sites: StorySites
}

/** Everything derived from the terrain mesh, computed once. */
const cache = new WeakMap<object, Analysis>()
function analyse(geometry: BufferGeometry): Analysis {
  const hit = cache.get(geometry)
  if (hit) return hit
  const hf = buildHeightfield(geometry.getAttribute('position').array, geometry.getIndex()!.array, 0.2)
  const sites = chooseSites(hf, buildHazardGrid(hf, 1.2))
  const out = { hf, sites, ground: { at: (x: number, z: number) => sampleHeight(hf, x, z), sites } }
  cache.set(geometry, out)
  return out
}

function useTerrainGeometry(): BufferGeometry {
  const gltf = useLoader(GLTFLoader, TERRAIN_URL)
  return useMemo(() => {
    let geo: BufferGeometry | null = null
    gltf.scene.traverse((o) => {
      if (!geo && (o as Mesh).isMesh) geo = (o as Mesh).geometry
    })
    const g = geo as BufferGeometry | null
    if (!g) throw new Error('terrain has no mesh')
    if (!g.getAttribute('normal')) g.computeVertexNormals()
    g.computeBoundingSphere()
    return g
  }, [gltf])
}

function useDisc(): CanvasTexture {
  return useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const x = c.getContext('2d')!
    x.fillStyle = '#fff'
    x.beginPath()
    x.arc(32, 32, 30, 0, Math.PI * 2)
    x.fill()
    return new CanvasTexture(c)
  }, [])
}

const NOISE_GLSL = /* glsl */ `
  float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
`

function useTerrainMaterial() {
  return useMemo(() => {
    const m = new MeshStandardMaterial({ color: '#4b4b4b', roughness: 1, metalness: 0, envMapIntensity: 0.05 })
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uFade = { value: new Vector2(19, 25) }
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\nuniform vec2 uFade;\n${NOISE_GLSL}`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
           float nz = vn(vWPos.xz * 2.2) * 0.45 + vn(vWPos.xz * 8.0) * 0.33 + vn(vWPos.xz * 27.0) * 0.22;
           diffuseColor.rgb *= 0.6 + 0.8 * nz;`,
        )
        .replace('#include <dithering_fragment>', 'gl_FragColor.rgb *= 1.0 - smoothstep(uFade.x, uFade.y, length(vWPos.xz));\n#include <dithering_fragment>')
    }
    return m
  }, [])
}

function Probe({ scene, group, flames, flameMat }: { scene: Object3D; group: React.RefObject<Group | null>; flames: React.RefObject<Group | null>; flameMat: MeshBasicMaterial }) {
  const burners: [number, number][] = [[0.9, -1.3], [3.7, -1.3], [0.9, 1.3], [3.7, 1.3]]
  return (
    <group ref={group} visible={false}>
      <group position={[-HEAD_IN_MODEL[0], HEAD_IN_MODEL[1], 0]}>
        <primitive object={scene} rotation={[Math.PI, 0, 0]} />
      </group>
      <group ref={flames}>
        {burners.map(([x, z]) => (
          <mesh key={`${x},${z}`} position={[x, 2.85, z]} rotation={[Math.PI, 0, 0]} material={flameMat}>
            <coneGeometry args={[0.16, 1.15, 14, 1, true]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/** The 3D scenes of the story: the real Nightingale ground, the OSIRIS-REx model and flat white overlays, all driven by `storyPose`. */
export default function StoryWorld({ onReady }: { onReady: () => void }) {
  const terrain = useTerrainGeometry()
  const probeGltf = useLoader(GLTFLoader, PROBE_URL)
  const disc = useDisc()
  const terrainMat = useTerrainMaterial()
  const an = useMemo(() => analyse(terrain), [terrain])
  const probeScene = useMemo(() => {
    const s = probeGltf.scene.clone(true)
    s.traverse((o) => {
      const m = o as Mesh
      if (m.isMesh) {
        m.castShadow = true
        m.receiveShadow = true
        const mats = Array.isArray(m.material) ? m.material : [m.material]
        mats.forEach((mt) => ((mt as MeshStandardMaterial).envMapIntensity = 0.6))
      }
    })
    return s
  }, [probeGltf])

  useEffect(() => {
    onReady()
  }, [onReady])

  const sun = useRef<DirectionalLight>(null)
  const probe = useRef<Group>(null)
  const flames = useRef<Group>(null)
  const flameMat = useMemo(() => new MeshBasicMaterial({ color: '#ffdca6', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }), [])

  // overlays
  const patchGrid = useMemo(() => {
    const p = an.sites.patch
    return buildGridGeometries(an.hf, { x0: p.x0, z0: p.z0, cols: p.cols, rows: p.rows, g: p.g, hazard: p.hazard })
  }, [an])
  const oldGrid = useMemo(() => {
    // a small map around the rock the map missed: the cells come from the ground, with the missed rock's own cell forced clear
    const { old } = an.sites
    const g = 1.2, cols = 7, rows = 5
    const x0 = old.x - (cols * g) / 2, z0 = old.z - (rows * g) / 2
    const hazard = new Uint8Array(cols * rows)
    const hg = buildHazardGrid(an.hf, g)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = Math.floor((x0 + c * g - hg.x0) / g + 0.5), j = Math.floor((z0 + r * g - hg.z0) / g + 0.5)
        hazard[r * cols + c] = hg.hazard[j * hg.nx + i] ?? 0
      }
    }
    hazard[2 * cols + 3] = 0
    return buildGridGeometries(an.hf, { x0, z0, cols, rows, g, hazard })
  }, [an])
  const mats = useMemo(() => ({ pl: revealMaterial('line'), pf: revealMaterial('fill'), po: revealMaterial('outline'), ol: revealMaterial('line'), of: revealMaterial('fill') }), [])
  const ringRibbon = useMemo(() => new Ribbon(72), [])
  const rockRibbon = useMemo(() => new Ribbon(96), [])
  const ring5Ribbon = useMemo(() => new Ribbon(72), [])
  const ringMat = useMemo(() => new MeshBasicMaterial({ color: '#f4f4f5', transparent: true, opacity: 0, depthWrite: false, side: DoubleSide }), [])
  const rockMat = useMemo(() => new MeshBasicMaterial({ color: '#f4f4f5', transparent: true, opacity: 0, depthWrite: false, side: DoubleSide }), [])
  const ring5Mat = useMemo(() => new MeshBasicMaterial({ color: '#f4f4f5', transparent: true, opacity: 0, depthWrite: false, side: DoubleSide }), [])
  const ring5Group = useRef<Group>(null)

  // the camera cone of scene 0
  const cone = useMemo(() => {
    const pos = new Float32Array(8 * 2 * 3)
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    const tri = new Float32Array(4 * 3 * 3)
    const f = new BufferGeometry()
    f.setAttribute('position', new BufferAttribute(tri, 3))
    return { lines: g, faces: f, pos, tri }
  }, [])
  const coneLineMat = useMemo(() => new LineBasicMaterial({ color: '#f4f4f5', transparent: true, opacity: 0, depthWrite: false }), [])
  const coneFaceMat = useMemo(() => new MeshBasicMaterial({ color: '#f4f4f5', transparent: true, opacity: 0, depthWrite: false, side: DoubleSide }), [])

  // dust
  const dust = useMemo(() => {
    const N = 44
    const seedv: [number, number, number][] = []
    let s = 7
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2
      const sp = 0.4 + rnd() * 1.6
      seedv.push([Math.cos(a) * sp, 0.2 + rnd() * 0.9, Math.sin(a) * sp])
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(new Float32Array(N * 3), 3))
    return { geo: g, seedv, N }
  }, [])
  const dustMat = useMemo(() => new PointsMaterial({ color: '#cfcac2', size: 0.28, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, map: disc, alphaTest: 0.2 }), [disc])

  // camera hand-over between scenes
  const last = useRef<{ cam: StoryPose; scene: number; at: number } | null>(null)
  const from = useRef<{ p: ReturnType<typeof fromTo>; at: number } | null>(null)
  const sunDir = useRef<[number, number, number]>([0.8, 0.3, 0.5])
  const target = useRef({ x: 0, z: 0 })
  const lastScene = useRef(-1)

  useFrame(({ clock, camera, size }) => {
    const st = stage.story
    if (!st.started || stage.mode !== 'story') return
    const aspect = size.width / size.height
    const now = clock.elapsedTime
    const cur = storyPose(st.scene, st.u, an.ground, aspect)

    // blend the camera from where the last scene ended
    if (lastScene.current !== st.scene) {
      if (last.current) from.current = { p: fromTo(last.current.cam, last.current.cam, 0), at: now }
      lastScene.current = st.scene
    }
    let cam = fromTo(cur, cur, 0)
    if (from.current) {
      const k = smooth(clamp01((now - from.current.at) / 1.3))
      cam = fromTo({ ...cur, ...from.current.p } as StoryPose, cur, k)
      if (k >= 1) from.current = null
    }
    const pose: StoryPose = { ...cur, ...cam }
    last.current = { cam: pose, scene: st.scene, at: now }
    stage.storyPose = pose
    void camera

    // sun: fixed azimuth, elevation from the script; it follows the scene so the shadow map always covers the action
    const el = (pose.sunElev * Math.PI) / 180
    const az = 2.35
    sunDir.current = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)]
    target.current.x += (pose.look[0] - target.current.x) * 0.2
    target.current.z += (pose.look[2] - target.current.z) * 0.2
    const L = sun.current
    if (L) {
      L.position.set(target.current.x + sunDir.current[0] * 60, sunDir.current[1] * 60, target.current.z + sunDir.current[2] * 60)
      L.target.position.set(target.current.x, 0, target.current.z)
      L.target.updateMatrixWorld()
      L.intensity = 7 * Math.min(1, 0.35 + pose.sunElev / 22)
    }
    terrainMat.color.set('#4b4b4b').multiplyScalar(pose.ground)

    // probe
    const P = probe.current
    if (P) {
      P.visible = pose.probe.on
      P.position.set(...pose.probe.pos)
      P.rotation.set(pose.probe.tiltX, 0, pose.probe.tiltZ)
    }
    flameMat.opacity = pose.probe.flame * (0.5 + 0.12 * Math.sin(now * 60))
    if (flames.current) flames.current.scale.set(1, 0.7 + pose.probe.flame * 0.5 + 0.2 * Math.sin(now * 53), 1)

    // grid overlays: scenes 2 and 3 use the patch, scene 6 the small map around the missed rock
    const showPatch = st.scene === 2 || st.scene === 3
    mats.pl.uniforms.uShow.value = showPatch ? pose.grid.show : 0
    mats.pl.uniforms.uHot.value = showPatch ? pose.grid.hot : 0
    mats.pf.uniforms.uShow.value = showPatch ? pose.grid.show : 0
    mats.pf.uniforms.uHot.value = showPatch ? pose.grid.hot : 0
    mats.po.uniforms.uShow.value = st.scene === 1 ? pose.outlines : 0
    const showOld = st.scene === 6
    mats.ol.uniforms.uShow.value = showOld ? pose.grid.show : 0
    mats.ol.uniforms.uHot.value = showOld ? pose.grid.hot : 0
    mats.of.uniforms.uShow.value = showOld ? pose.grid.show : 0
    mats.of.uniforms.uHot.value = showOld ? pose.grid.hot : 0

    // target ring and detector outline, laid over the ground
    ringMat.opacity = pose.ring.a * 0.95
    if (pose.ring.a > 0.01) ringRibbon.set(an.hf, pose.ring.x, pose.ring.z, pose.ring.r, 0.09, 2)
    rockMat.opacity = pose.rockOutline.a * 0.95
    if (pose.rockOutline.a > 0.01) rockRibbon.set(an.hf, pose.rockOutline.x, pose.rockOutline.z, 0.95, 0.09, 4)
    ring5Mat.opacity = pose.ring5.a * 0.8
    if (ring5Group.current) {
      ring5Group.current.visible = pose.ring5.a > 0.01
      ring5Group.current.position.set(pose.ring5.x, pose.ring5.y, pose.ring5.z)
    }

    // camera cone
    coneLineMat.opacity = pose.frustum * 0.85
    coneFaceMat.opacity = pose.frustum * 0.07
    if (pose.frustum > 0.01) {
      const ax = pose.probe.pos[0] + 2.0, ay = pose.probe.pos[1] + BODY_ABOVE_HEAD - 1.0, az2 = pose.probe.pos[2]
      const p = an.sites.patch
      const x0 = p.x0, x1 = p.x0 + p.cols * p.g, z0 = p.z0, z1 = p.z0 + p.rows * p.g
      const y = (x: number, z: number) => sampleHeight(an.hf, x, z) + LIFT
      const c: [number, number, number][] = [[x0, y(x0, z0), z0], [x1, y(x1, z0), z0], [x1, y(x1, z1), z1], [x0, y(x0, z1), z1]]
      let o = 0
      for (let i = 0; i < 4; i++) {
        cone.pos.set([ax, ay, az2, ...c[i]], o); o += 6
        cone.pos.set([...c[i], ...c[(i + 1) % 4]], o); o += 6
        cone.tri.set([ax, ay, az2, ...c[i], ...c[(i + 1) % 4]], i * 9)
      }
      ;(cone.lines.getAttribute('position') as BufferAttribute).needsUpdate = true
      ;(cone.faces.getAttribute('position') as BufferAttribute).needsUpdate = true
      cone.lines.computeBoundingSphere()
      cone.faces.computeBoundingSphere()
    }

    // dust at the contact point
    const dt = pose.dust.t
    dustMat.opacity = dt > 0 ? 0.7 * (1 - dt) : 0
    if (dt > 0) {
      const arr = dust.geo.getAttribute('position') as BufferAttribute
      const gy = an.ground.at(pose.dust.x, pose.dust.z)
      for (let i = 0; i < dust.N; i++) {
        const v = dust.seedv[i]
        const e = 1 - Math.pow(1 - dt, 2.2)
        arr.setXYZ(i, pose.dust.x + v[0] * e * 2.6, gy + 0.15 + v[1] * e * 2.4, pose.dust.z + v[2] * e * 2.6)
      }
      arr.needsUpdate = true
      dust.geo.computeBoundingSphere()
    }

    if (stage.flash) stage.flash.style.opacity = pose.flash.toFixed(3)
    if (stage.black) stage.black.style.opacity = pose.dip.toFixed(3)
  })

  // static ring5 geometry (a flat circle that is moved as a group)
  useEffect(() => {
    ring5Ribbon.set(null, 0, 0, 1.9, 0.07, 2, 0)
  }, [ring5Ribbon])

  return (
    <>
      <ambientLight intensity={0.02} color="#aab4d0" />
      <directionalLight
        ref={sun}
        intensity={4}
        color="#fff8f0"
        castShadow
        shadow-mapSize={stage.lite ? [1024, 1024] : [2048, 2048]}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-camera-near={1}
        shadow-camera-far={160}
        shadow-bias={-0.0006}
        shadow-normalBias={0.04}
      />
      <mesh geometry={terrain} material={terrainMat} receiveShadow castShadow />
      <Probe scene={probeScene} group={probe} flames={flames} flameMat={flameMat} />
      <lineSegments geometry={patchGrid.lines} material={mats.pl} renderOrder={3} frustumCulled={false} />
      <mesh geometry={patchGrid.fills} material={mats.pf} renderOrder={2} frustumCulled={false} />
      <lineSegments geometry={patchGrid.outlines} material={mats.po} renderOrder={4} frustumCulled={false} />
      <lineSegments geometry={oldGrid.lines} material={mats.ol} renderOrder={3} frustumCulled={false} />
      <mesh geometry={oldGrid.fills} material={mats.of} renderOrder={2} frustumCulled={false} />
      <mesh geometry={ringRibbon.geometry} material={ringMat} renderOrder={5} frustumCulled={false} />
      <mesh geometry={rockRibbon.geometry} material={rockMat} renderOrder={5} frustumCulled={false} />
      <group ref={ring5Group} visible={false}>
        <mesh geometry={ring5Ribbon.geometry} material={ring5Mat} renderOrder={5} frustumCulled={false} />
      </group>
      <lineSegments geometry={cone.lines} material={coneLineMat} renderOrder={6} frustumCulled={false} />
      <mesh geometry={cone.faces} material={coneFaceMat} renderOrder={6} frustumCulled={false} />
      <points geometry={dust.geo} material={dustMat} renderOrder={6} frustumCulled={false} />
    </>
  )
}

