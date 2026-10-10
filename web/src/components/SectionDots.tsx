import { useEffect, useState } from 'react'

export interface Section {
  id: string
  label: string
}

// Fixed navigation down the right edge. The dot for the section in view fills in.
export default function SectionDots({ sections, onGo }: { sections: Section[]; onGo: (id: string) => void }) {
  const [active, setActive] = useState(sections[0].id)

  useEffect(() => {
    const seen = new Map<string, number>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.intersectionRatio)
        let best = ''
        let bestRatio = -1
        // the section covering the most of the viewport wins; ties go to the earlier one
        for (const s of sections) {
          const r = seen.get(s.id) ?? 0
          if (r > bestRatio + 1e-6) {
            best = s.id
            bestRatio = r
          }
        }
        if (best) setActive(best)
      },
      { threshold: [0, 0.1, 0.25, 0.4, 0.6, 0.8, 1], rootMargin: '-30% 0px -30% 0px' },
    )
    for (const s of sections) {
      const el = document.getElementById(s.id)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [sections])

  return (
    <nav className="dots" aria-label="Sections">
      {sections.map((s) => (
        <button key={s.id} type="button" className={s.id === active ? 'dot on' : 'dot'} onClick={() => onGo(s.id)} aria-label={s.label} aria-current={s.id === active ? 'true' : undefined}>
          <span className="dot-label">{s.label}</span>
          <span className="dot-mark" />
        </button>
      ))}
    </nav>
  )
}
