import { AnimatePresence, motion } from 'motion/react'
import { ArrowCounterClockwise, ArrowLeft, ArrowRight, ArrowUpRight, X } from '@phosphor-icons/react'
import { SCENES } from './script'

const EASE_OUT = [0.23, 1, 0.32, 1] as const

interface Props {
  scene: number
  line: number
  playing: boolean
  done: boolean
  reduce: boolean
  canSeeReal: boolean
  onPrev: () => void
  onNext: () => void
  onReplay: () => void
  onExit: () => void
  onSeeReal: () => void
}

/** The story's controls: the part and step at the top, one caption, and back / replay / forward circles at the bottom. */
export default function StoryUI({ scene, line, playing, done, reduce, canSeeReal, onPrev, onNext, onReplay, onExit, onSeeReal }: Props) {
  const def = SCENES[scene]
  const text = def.lines[Math.min(line, def.lines.length - 1)]
  const first = SCENES.findIndex((s) => s.part === def.part)
  const inPart = SCENES.filter((s) => s.part === def.part).length
  const last = scene === SCENES.length - 1
  return (
    <>
      <div className="story-top">
        <button type="button" className="back-link top" onClick={onExit}>
          <X size={14} /> Leave the story
        </button>
        <div className="story-part" aria-hidden="true">
          <span>{def.part}</span>
          <span className="story-dots">
            {Array.from({ length: inPart }, (_, i) => (
              <i key={i} data-on={i + first === scene} data-past={i + first < scene} />
            ))}
          </span>
        </div>
      </div>

      <div className="caption-wrap low" aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${scene}-${line}`}
            className="story-cap"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, filter: 'blur(6px)' }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, transition: { duration: 0.2, ease: 'easeOut' } }}
            transition={{ duration: 0.7, ease: EASE_OUT, delay: line === 0 ? 0.35 : 0.05 }}
          >
            {def.title && line === 0 && <p className="story-title">{def.title}</p>}
            <p className="caption small">{text}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {canSeeReal && done && def.example && (
          <motion.button
            type="button"
            className="real-btn"
            onClick={onSeeReal}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
          >
            See a real one <ArrowUpRight size={15} />
          </motion.button>
        )}
      </AnimatePresence>

      <nav className="steps" aria-label="Story steps" data-playing={playing}>
        <button type="button" className="step-btn" onClick={onPrev} disabled={scene === 0 && !playing} aria-label={playing ? 'Skip to the end of this scene' : 'Previous scene'}>
          <ArrowLeft size={20} />
        </button>
        <button type="button" className="step-btn" onClick={onReplay} aria-label="Replay this scene">
          <ArrowCounterClockwise size={20} />
        </button>
        <button
          type="button"
          className="step-btn"
          onClick={last && !playing ? onExit : onNext}
          aria-label={playing ? 'Skip to the end of this scene' : last ? 'Back to the galaxy' : 'Next scene'}
        >
          {last && !playing ? <X size={20} /> : <ArrowRight size={20} />}
        </button>
      </nav>
      <p className="sr-only">{def.label}</p>
    </>
  )
}
