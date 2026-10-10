import { useEffect, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { X } from '@phosphor-icons/react'
import Starfield from './Starfield'
import { EASE_OUT } from '../lib/motion'

interface Props {
  origin: { x: number; y: number }
  reduce: boolean
  onClose: () => void
  /** changes when the landing changes inside the same open overlay (tour steps) */
  contentKey: string | number
  /** +1 forward, -1 back; sets which way the content slides inside a tour */
  direction: number
  header: ReactNode
  children: ReactNode
  footer?: ReactNode
}

// The overlay unfolds out of the star you clicked: a circular clip-path grows from the star's screen
// position to cover the page. Closing shrinks it back to the star. Spatial consistency, not decoration.
export default function LandingOverlay({ origin, reduce, onClose, contentKey, direction, header, children, footer }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const w = window.innerWidth
  const h = window.innerHeight
  const R = Math.hypot(Math.max(origin.x, w - origin.x), Math.max(origin.y, h - origin.y)) + 12
  const closed = `circle(0px at ${origin.x}px ${origin.y}px)`
  const open = `circle(${R}px at ${origin.x}px ${origin.y}px)`

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    closeRef.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      prev?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.div
      className="overlay"
      role="dialog"
      aria-modal="true"
      initial={reduce ? { opacity: 0 } : { clipPath: closed }}
      animate={reduce ? { opacity: 1 } : { clipPath: open }}
      exit={reduce ? { opacity: 0 } : { clipPath: closed }}
      transition={{ duration: reduce ? 0.18 : 0.7, ease: EASE_OUT }}
    >
      <Starfield paused={false} inline />
      <motion.div
        ref={bodyRef}
        className="overlay-body"
        initial={reduce ? false : { opacity: 0, transform: 'scale(0.965)', filter: 'blur(6px)' }}
        animate={{ opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' }}
        exit={{ opacity: 0, transition: { duration: 0.15 } }}
        transition={{ duration: 0.5, delay: reduce ? 0 : 0.2, ease: EASE_OUT }}
        // once settled, drop the transform and filter so nothing keeps a compositing layer or traps position: fixed
        onAnimationComplete={() => {
          const el = bodyRef.current
          if (el) {
            el.style.transform = 'none'
            el.style.filter = 'none'
          }
        }}
      >
        <div className="overlay-inner">
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={contentKey}
              custom={direction}
              initial={{ opacity: 0, transform: `translateX(${direction * 36}px)` }}
              animate={{ opacity: 1, transform: 'translateX(0px)' }}
              exit={{ opacity: 0, transform: `translateX(${direction * -36}px)`, transition: { duration: 0.14 } }}
              transition={{ duration: 0.32, ease: EASE_OUT }}
            >
              {header}
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
      <button ref={closeRef} type="button" className="overlay-close" onClick={onClose} aria-label="Close and return to the sky">
        <X size={20} weight="regular" />
      </button>
      {footer}
    </motion.div>
  )
}
