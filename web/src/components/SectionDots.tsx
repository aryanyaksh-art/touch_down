export interface Section {
  id: string
  label: string
}

// Fixed navigation down the right edge. The dot for the section in view fills in; the parent decides which one that is.
export default function SectionDots({ sections, active, onGo }: { sections: Section[]; active: string; onGo: (id: string) => void }) {
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
