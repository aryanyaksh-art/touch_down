import { useState } from 'react'
import { Play } from '@phosphor-icons/react'

// The galaxy screen's controls: pick a landing (slider and number box, then Open) and start the story. The stars themselves are
// scenery now; the landings live behind this picker.
export default function GalaxyControls({
  count,
  disabled,
  onOpen,
  onStory,
}: {
  count: number
  disabled: boolean
  onOpen: (landingNumber: number) => void
  onStory: () => void
}) {
  const [n, setN] = useState<number | null>(null)
  const [text, setText] = useState('')
  const max = Math.max(1, count)

  const set = (v: number | null) => {
    setN(v)
    setText(v === null ? '' : String(v))
  }

  return (
    <div className="gbar" data-disabled={disabled}>
      <form
        className="picker"
        onSubmit={(e) => {
          e.preventDefault()
          if (n !== null) onOpen(n)
        }}
      >
        <label htmlFor="landing-slider">Landing</label>
        <input
          id="landing-slider"
          className="slider"
          type="range"
          min={1}
          max={max}
          step={1}
          value={n ?? 1}
          onChange={(e) => set(Number(e.target.value))}
          aria-valuetext={n === null ? 'none chosen' : `landing ${n}`}
        />
        <input
          className="seed-box"
          type="number"
          inputMode="numeric"
          min={1}
          max={max}
          placeholder={`1 to ${max}`}
          value={text}
          aria-label={`Landing number, 1 to ${max}`}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') return set(null)
            const v = Math.floor(Number(raw))
            if (Number.isNaN(v)) return
            const c = Math.max(1, Math.min(max, v))
            setN(c)
            setText(c === v ? raw : String(c))
          }}
        />
        <button type="submit" className="open-btn" disabled={n === null}>
          Open
        </button>
      </form>
      <button type="button" className="story-btn" onClick={onStory}>
        <Play size={14} weight="fill" /> Watch the story
      </button>
    </div>
  )
}
