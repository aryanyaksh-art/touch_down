import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { BackSide, Color, DoubleSide, Mesh, MeshBasicMaterial, PMREMGenerator, PlaneGeometry, Scene, SphereGeometry } from 'three'

/** Moonlight and a small studio-free reflection environment, so the metal and glass of the telescope have something to reflect. */
export default function Lights() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    const env = new Scene()
    const dome = new Mesh(new SphereGeometry(30, 24, 16), new MeshBasicMaterial({ color: new Color(0.018, 0.022, 0.034), side: BackSide }))
    env.add(dome)
    const soft = (w: number, h: number, c: number, x: number, y: number, z: number, tint = [1, 1, 1.06]) => {
      const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: new Color(c * tint[0], c * tint[1], c * tint[2]), side: DoubleSide }))
      m.position.set(x, y, z)
      m.lookAt(0, 0, 0)
      env.add(m)
    }
    soft(14, 9, 7, -14, 11, 9) // the moon's softbox, up and to the left
    soft(3, 14, 3.2, 15, 4, -10) // a thin cool rim from behind
    soft(30, 2, 0.5, 0, 1, 20) // the faint horizon glow in front
    const pmrem = new PMREMGenerator(gl)
    const rt = pmrem.fromScene(env, 0.04)
    scene.environment = rt.texture
    return () => {
      scene.environment = null
      rt.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])

  return (
    <>
      <directionalLight position={[-6, 7, 5]} intensity={2.6} color="#e6ebff" />
      <directionalLight position={[7, 4, -8]} intensity={1.0} color="#b8c4ee" />
      <hemisphereLight args={['#14151a', '#030304', 0.4]} />
    </>
  )
}
