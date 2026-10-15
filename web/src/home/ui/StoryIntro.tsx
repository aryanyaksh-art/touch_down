import { motion } from 'motion/react'
import { ArrowLeft, Play } from '@phosphor-icons/react'

const EASE_OUT = [0.23, 1, 0.32, 1] as const

/** The story opens on a plain night sky: a title and one circle to start. */
export default function StoryIntro({ onStart, onBack, reduce }: { onStart: () => void; onBack: () => void; reduce: boolean }) {
  return (
    <div className="story-intro">
      <motion.h1
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, filter: 'blur(6px)' }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.25 }}
      >
        Watch the story
      </motion.h1>
      <motion.button
        type="button"
        className="step-btn big"
        onClick={onStart}
        aria-label="Start the story"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.7 }}
      >
        <Play size={26} weight="fill" />
      </motion.button>
      <button type="button" className="back-link" onClick={onBack}>
        <ArrowLeft size={14} /> Back to the galaxy
      </button>
    </div>
  )
}
