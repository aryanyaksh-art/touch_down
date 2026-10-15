import { useFrame } from '@react-three/fiber'
import { PerspectiveCamera } from 'three'
import { pose } from '../timeline'
import { stage } from '../stage'

/** Turns the timeline into a camera pose every frame, and drives the round eyepiece view and the cut to black. */
export default function Rig() {
  useFrame(({ camera, clock, size }) => {
    stage.aspect = size.width / size.height
    const p = pose(stage.t, stage.aspect)
    stage.p = p
    const cam = camera as PerspectiveCamera
    const sway = p.world === 'outside' ? 0.012 : 0
    cam.position.set(p.camPos[0] + Math.sin(clock.elapsedTime * 0.31) * sway, p.camPos[1] + Math.sin(clock.elapsedTime * 0.23) * sway, p.camPos[2])
    cam.lookAt(p.camLook[0], p.camLook[1], p.camLook[2])
    if (Math.abs(cam.fov - p.fov) > 1e-4) {
      cam.fov = p.fov
      cam.updateProjectionMatrix()
    }
    const short = Math.min(size.width, size.height)
    const half = 0.5 * Math.hypot(size.width, size.height)
    const r = p.iris === null ? null : p.iris * short
    if (stage.wrap) stage.wrap.style.clipPath = r === null || r >= half ? 'none' : `circle(${r.toFixed(1)}px at 50% 50%)`
    if (stage.ring) {
      const show = r !== null && r < half
      stage.ring.style.opacity = show ? '1' : '0'
      if (show && r !== null) {
        stage.ring.style.width = stage.ring.style.height = `${(r * 2).toFixed(1)}px`
      }
    }
    if (stage.black) stage.black.style.opacity = p.blackout.toFixed(3)
  })
  return null
}
