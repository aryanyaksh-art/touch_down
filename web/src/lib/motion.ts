// Motion tokens. Curves come from Emil Kowalski's animation guidance (the `animate` skill):
// strong ease-out for anything entering or responding, strong ease-in-out for things already on screen.
export const EASE_OUT = [0.23, 1, 0.32, 1] as const
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const

export const reduceMotionQuery = '(prefers-reduced-motion: reduce)'
