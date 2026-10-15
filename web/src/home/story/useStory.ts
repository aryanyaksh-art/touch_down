import { useCallback, useEffect, useRef, useState } from 'react'
import { stage } from '../stage'
import { SCENES } from './script'

/** Plays the seven story scenes one press at a time. A second press while a scene is playing jumps to its end. */
export function useStory(reduce: boolean) {
  const [started, setStarted] = useState(false)
  const [scene, setScene] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [line, setLine] = useState(0)
  const [done, setDone] = useState(false)
  const raf = useRef(0)
  const sceneRef = useRef(0)

  const stop = useCallback(() => cancelAnimationFrame(raf.current), [])

  const play = useCallback(
    (i: number) => {
      stop()
      sceneRef.current = i
      stage.story.scene = i
      setScene(i)
      setLine(0)
      setDone(false)
      if (reduce) {
        // no camera moves: show the finished frame
        stage.story.u = 1
        setPlaying(false)
        setDone(true)
        window.setTimeout(() => setLine(stage.storyPose?.line ?? 0), 80)
        return
      }
      stage.story.u = 0
      setPlaying(true)
      const t0 = performance.now()
      const ms = SCENES[i].seconds * 1000
      const tick = (now: number) => {
        const u = Math.min(1, (now - t0) / ms)
        stage.story.u = u
        const l = stage.storyPose?.line ?? 0
        setLine((prev) => (prev === l ? prev : l))
        if (u < 1) raf.current = requestAnimationFrame(tick)
        else {
          setPlaying(false)
          setDone(true)
        }
      }
      raf.current = requestAnimationFrame(tick)
    },
    [reduce, stop],
  )

  const skip = useCallback(() => {
    stop()
    stage.story.u = 1
    setPlaying(false)
    setDone(true)
    window.setTimeout(() => setLine(stage.storyPose?.line ?? 0), 60)
  }, [stop])

  const start = useCallback(() => {
    stage.story.started = true
    setStarted(true)
    play(0)
  }, [play])

  const next = useCallback(() => {
    if (playing) return skip()
    if (sceneRef.current < SCENES.length - 1) play(sceneRef.current + 1)
  }, [playing, play, skip])

  const prev = useCallback(() => {
    if (playing) return skip()
    if (sceneRef.current > 0) play(sceneRef.current - 1)
  }, [playing, play, skip])

  const replay = useCallback(() => play(sceneRef.current), [play])

  const reset = useCallback(() => {
    stop()
    stage.story.started = false
    stage.story.u = 0
    stage.story.scene = 0
    stage.storyPose = null
    sceneRef.current = 0
    setStarted(false)
    setPlaying(false)
    setScene(0)
    setLine(0)
    setDone(false)
  }, [stop])

  useEffect(() => stop, [stop])

  // dev only: freeze the story at a scene and progress, for screenshots
  const debugSet = useCallback(
    (i: number, u: number) => {
      stop()
      stage.story.started = true
      stage.story.scene = i
      stage.story.u = u
      sceneRef.current = i
      setStarted(true)
      setScene(i)
      setPlaying(false)
      setDone(u >= 1)
    },
    [stop],
  )

  return { started, scene, playing, line, done, start, next, prev, replay, reset, debugSet }
}
