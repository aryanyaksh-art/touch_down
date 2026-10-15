import { pose, type Pose } from './timeline'

/** Mutable state shared between the DOM controls and the 3D scene. Read every frame, so it never goes through React state. */
export const stage: {
  t: number
  p: Pose
  /** the element whose clip-path is the round eyepiece view */
  wrap: HTMLElement | null
  ring: HTMLElement | null
  black: HTMLElement | null
  lite: boolean
  aspect: number
} = {
  t: 0,
  p: pose(0),
  wrap: null,
  ring: null,
  black: null,
  lite: false,
  aspect: 16 / 9,
}

/** a phone or other weak device gets the same experience at lighter quality */
export const isLiteDevice = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px), (pointer: coarse)').matches
