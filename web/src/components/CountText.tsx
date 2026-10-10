import { useEffect, useRef } from 'react'
import { animate, useInView, useReducedMotion } from 'motion/react'
import { EASE_OUT } from '../lib/motion'

// Counts the first number in `value` up from zero when it scrolls into view, keeping the prefix,
// suffix and decimal places ("91.9%", "0.39 m"). Monospace digits keep the width steady while it runs.
export default function CountText({ value, duration = 1.1 }: { value: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '0px 0px -8% 0px' })
  const reduce = useReducedMotion()
  const m = value.match(/-?\d[\d,]*\.?\d*/)
  const num = m ? parseFloat(m[0].replace(/,/g, '')) : NaN
  const decimals = m && m[0].includes('.') ? m[0].split('.')[1].length : 0
  const grouped = !!m && m[0].includes(',')
  const pre = m ? value.slice(0, m.index) : value
  const post = m ? value.slice((m.index ?? 0) + m[0].length) : ''
  const fmt = (v: number) => (grouped ? v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : v.toFixed(decimals))

  useEffect(() => {
    const el = ref.current
    if (!el || !inView || reduce || !m || Number.isNaN(num)) return
    const controls = animate(0, num, {
      duration,
      ease: EASE_OUT,
      onUpdate: (v) => {
        el.textContent = pre + fmt(v) + post
      },
    })
    return () => controls.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, value, reduce])

  const start = !m || reduce ? value : pre + fmt(0) + post
  return <span ref={ref}>{start}</span>
}
