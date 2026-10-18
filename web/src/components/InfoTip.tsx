import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Info } from '@phosphor-icons/react'
import { GLOSSARY, type TermKey } from '../lib/glossary'

const EASE_OUT = [0.23, 1, 0.32, 1] as const
const WIDTH = 300
const GAP = 8
const EDGE = 12

interface Place {
  left: number
  top: number
  origin: string
}

/** A small (i) button that opens a short plain-language explanation of a term or a result. Click or tap to open; click elsewhere
 *  or press Escape to close. The card is fixed to the viewport, clamped to it, and follows the button while the page scrolls. */
export default function InfoTip({ term }: { term: TermKey }) {
  const { title, body } = GLOSSARY[term]
  const reduce = useReducedMotion()
  const id = useId()
  const btn = useRef<HTMLButtonElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<Place | null>(null)
  // the card is rendered inside the landing view (which carries the colour variables), not inside whatever text the button sits in
  const [host, setHost] = useState<Element | null>(null)
  useLayoutEffect(() => setHost(btn.current?.closest('.lv') ?? document.body), [])

  // place the card under the button, or above it when there is no room below, and keep it inside the viewport
  const measure = useCallback(() => {
    if (!btn.current || !card.current) return
    const b = btn.current.getBoundingClientRect()
    // the button has scrolled out of view: the card has nothing to point at any more
    if (b.bottom < 0 || b.top > window.innerHeight) return setOpen(false)
    const w = Math.min(WIDTH, window.innerWidth - EDGE * 2)
    const h = card.current.offsetHeight
    const left = Math.min(Math.max(b.left + b.width / 2 - w / 2, EDGE), window.innerWidth - EDGE - w)
    const below = b.bottom + GAP + h <= window.innerHeight - EDGE || b.top - GAP - h < EDGE
    const top = below ? b.bottom + GAP : b.top - GAP - h
    setPlace({ left, top, origin: `${b.left + b.width / 2 - left}px ${below ? '0%' : '100%'}` })
  }, [])

  useLayoutEffect(() => {
    if (open) measure()
  }, [open, measure])

  useEffect(() => {
    if (!open) {
      setPlace(null)
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
      btn.current?.focus({ preventScroll: true })
    }
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node
      if (!btn.current?.contains(t) && !card.current?.contains(t)) setOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onPointer, true)
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onPointer, true)
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [open, measure])

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="tip-btn"
        aria-label={`About: ${title}`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        data-open={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Info size={13} weight="bold" aria-hidden="true" />
      </button>
      {host &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={card}
                id={id}
                role="note"
                className="tip-card"
                data-tip-open="true"
                style={{
                  left: place?.left ?? 0,
                  top: place?.top ?? 0,
                  width: Math.min(WIDTH, window.innerWidth - EDGE * 2),
                  transformOrigin: place?.origin ?? '50% 0%',
                  visibility: place ? 'visible' : 'hidden',
                }}
                initial={reduce ? { opacity: 0 } : { opacity: 0, transform: 'scale(0.96)' }}
                animate={{ opacity: 1, transform: 'scale(1)' }}
                exit={{ opacity: 0, transition: { duration: 0.1, ease: 'easeOut' } }}
                transition={{ duration: 0.16, ease: EASE_OUT }}
              >
                <div className="tip-title">{title}</div>
                <p>{body}</p>
              </motion.div>
            )}
          </AnimatePresence>,
          host,
        )}
    </>
  )
}
