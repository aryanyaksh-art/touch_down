import { pose, type Pose } from './timeline'
import type { StoryPose } from './story/script'

/** Mutable state shared between the DOM controls and the 3D scene. Read every frame, so it never goes through React state. */
export const stage: {
  t: number
  p: Pose
  /** the element whose clip-path is the round eyepiece view */
  wrap: HTMLElement | null
  ring: HTMLElement | null
  black: HTMLElement | null
  flash: HTMLElement | null
  lite: boolean
  aspect: number
  /** free look around the galaxy once the intro has ended */
  explore: { on: boolean; drag: boolean; yaw: number; pitch: number; zoom: number }
  /** which screen is drawn: the intro and galaxy, or the plain sky behind the story */
  mode: 'home' | 'story'
  /** the story: which scene is playing and how far through it, plus the pose the 3D scene last computed */
  story: { scene: number; u: number; started: boolean }
  storyPose: StoryPose | null
} = {
  t: 0,
  p: pose(0),
  wrap: null,
  ring: null,
  black: null,
  flash: null,
  lite: false,
  aspect: 16 / 9,
  explore: { on: false, drag: false, yaw: 0, pitch: 0, zoom: 1 },
  mode: 'home',
  story: { scene: 0, u: 0, started: false },
  storyPose: null,
}

/** a phone or other weak device gets the same experience at lighter quality */
export const isLiteDevice = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px), (pointer: coarse)').matches
