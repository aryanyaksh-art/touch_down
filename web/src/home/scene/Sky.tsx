import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { BackSide, Color, LoadingManager, Mesh, MeshBasicMaterial, SRGBColorSpace, TextureLoader } from 'three'
import { stage } from '../stage'

/** NASA SVS Deep Star Maps (Tycho-2 and Gaia based): a real all-sky map on a sphere around the camera, drifting very slowly. */
export default function Sky({ url, hiUrl }: { url: string; hiUrl?: string }) {
  const tex = useLoader(TextureLoader, url)
  const mesh = useRef<Mesh>(null)
  const mat = useMemo(() => {
    tex.colorSpace = SRGBColorSpace
    tex.anisotropy = 4
    return new MeshBasicMaterial({ map: tex, side: BackSide, toneMapped: false, depthWrite: false, color: new Color(2.6, 2.6, 2.6) })
  }, [tex])

  // the sharp 8K map streams in behind the 4K one, so the page is usable straight away
  useEffect(() => {
    if (!hiUrl) return
    let live = true
    new TextureLoader(new LoadingManager()).load(hiUrl, (hi) => {
      if (!live) return
      hi.colorSpace = SRGBColorSpace
      hi.anisotropy = 4
      mat.map = hi
      mat.needsUpdate = true
    })
    return () => {
      live = false
    }
  }, [hiUrl, mat])

  useFrame(({ camera, clock }) => {
    const m = mesh.current
    if (!m) return
    m.position.copy(camera.position)
    // Earth turns about 15 degrees an hour; this is about 0.1 degree a second, enough to feel alive without being a ride
    m.rotation.y = clock.elapsedTime * 0.0016 + 0.9
    const g = stage.p.skyGain
    mat.color.setRGB(g, g, g)
  })

  return (
    <mesh ref={mesh} material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[2500, 96, 64]} />
    </mesh>
  )
}
