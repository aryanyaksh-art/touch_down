import { useFrame } from '@react-three/fiber'
import { PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { GALAXY_DIR, GALAXY_DIST, GALAXY_NORMAL, pose, storyBackdrop } from '../timeline'
import { stage } from '../stage'

/** Turns the timeline into a camera pose every frame, and drives the round eyepiece view and the cut to black. */
const GC = new Vector3(GALAXY_DIR[0] * GALAXY_DIST, GALAXY_DIR[1] * GALAXY_DIST, GALAXY_DIR[2] * GALAXY_DIST)
const N = new Vector3(...GALAXY_NORMAL)
const qa = new Quaternion()
const qb = new Quaternion()
const vA = new Vector3()
const vB = new Vector3()

export default function Rig() {
  useFrame(({ camera, clock, size }) => {
    stage.aspect = size.width / size.height
    const p = stage.mode === 'story' ? storyBackdrop() : pose(stage.t, stage.aspect)
    stage.p = p
    const cam = camera as PerspectiveCamera
    const sway = p.world === 'outside' ? 0.012 : 0
    cam.position.set(p.camPos[0] + Math.sin(clock.elapsedTime * 0.31) * sway, p.camPos[1] + Math.sin(clock.elapsedTime * 0.23) * sway, p.camPos[2])
    cam.up.set(p.up[0], p.up[1], p.up[2])
    cam.lookAt(p.camLook[0], p.camLook[1], p.camLook[2])
    // after the intro the visitor can orbit the galaxy: yaw about its axis, pitch about the horizontal, zoom along the view
    if (stage.mode === 'home' && stage.explore.on && stage.t >= 2.999) {
      const e = stage.explore
      if (!e.drag) e.yaw += 0.0004 // a slow turn while the visitor is not touching it
      vA.set(p.camPos[0], p.camPos[1], p.camPos[2]).sub(GC)
      qa.setFromAxisAngle(N, e.yaw)
      vA.applyQuaternion(qa)
      vB.crossVectors(N, vA).normalize()
      qb.setFromAxisAngle(vB, e.pitch)
      vA.applyQuaternion(qb).multiplyScalar(e.zoom)
      cam.position.copy(GC).add(vA)
      cam.up.copy(N)
      cam.lookAt(GC)
    }
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
