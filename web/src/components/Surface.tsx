// The asteroid's surface in flat vector, shared by the end of the dive and the story scenes.
// Scene coordinates 1600 x 900; everything below y = 640 is ground.
const FAR = '#1d2247'
const NEAR = '#14183a'
const ROCK = '#262c55'
const ROCK_LIT = '#3a4275'

export function SurfaceArt() {
  return (
    <>
      <path d="M0,900 L0,690 Q200,640 420,676 T860,652 T1250,676 T1600,640 L1600,900 Z" fill={FAR} />
      <path d="M270,672 l26,-34 l44,-6 l30,26 l-6,16 z" fill={ROCK} />
      <path d="M270,672 l26,-34 l44,-6 l-16,22 z" fill={ROCK_LIT} />
      <path d="M1080,664 l18,-46 l52,-10 l34,34 l-8,24 z" fill={ROCK} />
      <path d="M1080,664 l18,-46 l52,-10 l-24,30 z" fill={ROCK_LIT} />
      <path d="M0,900 L0,770 Q260,724 540,760 T1080,744 T1600,756 L1600,900 Z" fill={NEAR} />
      <path d="M640,764 l22,-22 l38,-2 l18,20 l-4,10 z" fill={ROCK} />
      <path d="M1380,758 l16,-30 l36,-4 l22,24 l-6,12 z" fill={ROCK} />
    </>
  )
}
