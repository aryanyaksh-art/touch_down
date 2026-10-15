import { AnimatePresence, motion } from 'motion/react'

const EASE_OUT = [0.23, 1, 0.32, 1] as const

/** One short line in the upper sky. It arrives when a move has finished and leaves quickly when the next one starts. */
export default function Caption({ text, reduce }: { text: string | null; reduce: boolean }) {
  return (
    <div className="caption-wrap" aria-live="polite">
      <AnimatePresence mode="wait">
        {text && (
          <motion.p
            key={text}
            className="caption"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, filter: 'blur(6px)' }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, transition: { duration: 0.22, ease: 'easeOut' } }}
            transition={{ duration: 0.8, ease: EASE_OUT, delay: 0.15 }}
          >
            {text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
