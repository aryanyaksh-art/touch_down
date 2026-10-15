import { ArrowLeft, ArrowRight } from '@phosphor-icons/react'

// Two small circles at the bottom centre: back and forward. They are the only controls on the page.
export default function StepButtons({
  canBack,
  canForward,
  playing,
  onBack,
  onForward,
}: {
  canBack: boolean
  canForward: boolean
  playing: boolean
  onBack: () => void
  onForward: () => void
}) {
  return (
    <nav className="steps" aria-label="Story steps" data-playing={playing}>
      <button type="button" className="step-btn" onClick={onBack} disabled={!canBack && !playing} aria-label={playing ? 'Skip to the end of this step' : 'Previous step'}>
        <ArrowLeft size={20} weight="regular" />
      </button>
      <button type="button" className="step-btn" onClick={onForward} disabled={!canForward && !playing} aria-label={playing ? 'Skip to the end of this step' : 'Next step'}>
        <ArrowRight size={20} weight="regular" />
      </button>
    </nav>
  )
}
