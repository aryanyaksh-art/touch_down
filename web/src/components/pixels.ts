import { useEffect, useState } from 'react'

export type Pixels = Uint8ClampedArray | null

// Label images use two colours (see CLASS_RGBA in touchdown/analysis/export_replays.py): boulder and steep ground.
export function classify(px: Pixels, x: number, y: number): string {
  if (!px) return 'unknown'
  const i = (Math.floor(y) * 320 + Math.floor(x)) * 4
  if (px[i + 3] === 0) return 'safe ground'
  return px[i] > 230 ? 'boulder' : 'steep ground'
}

export function usePixels(src: string | null): Pixels {
  const [px, setPx] = useState<Pixels>(null)
  useEffect(() => {
    setPx(null)
    if (!src) return
    let live = true
    const img = new Image()
    img.onload = () => {
      if (!live) return
      const c = document.createElement('canvas')
      c.width = 320
      c.height = 240
      const g = c.getContext('2d')
      if (!g) return
      g.drawImage(img, 0, 0, 320, 240)
      setPx(g.getImageData(0, 0, 320, 240).data)
    }
    img.src = src
    return () => {
      live = false
    }
  }, [src])
  return px
}

