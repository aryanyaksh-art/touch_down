import { CanvasTexture, LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, SRGBColorSpace } from 'three'

// Small tileable surface textures made on the fly (an albedo and a normal map from one height field), so the ground, the concrete pad
// and the telescope's paint all carry real micro-detail without shipping image files.

function hash2(x: number, y: number, seed: number) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2147483647)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** value noise that tiles every `period` cells */
function vnoise(x: number, y: number, period: number, seed: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const m = (n: number) => ((n % period) + period) % period
  const a = hash2(m(xi), m(yi), seed)
  const b = hash2(m(xi + 1), m(yi), seed)
  const c = hash2(m(xi), m(yi + 1), seed)
  const d = hash2(m(xi + 1), m(yi + 1), seed)
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v
}

function fbm(x: number, y: number, period: number, seed: number, octaves = 5) {
  let amp = 0.5
  let f = 1
  let s = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    s += amp * vnoise(x * f, y * f, period * f, seed + i * 17)
    norm += amp
    amp *= 0.5
    f *= 2
  }
  return s / norm
}

/** tiling Worley (cellular) noise: distance to the nearest of one jittered point per cell. Gives pebbles and gravel. */
function worley(x: number, y: number, cells: number, seed: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  let best = 9
  let id = 0
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i
      const cy = yi + j
      const wx = ((cx % cells) + cells) % cells
      const wy = ((cy % cells) + cells) % cells
      const px = cx + hash2(wx, wy, seed)
      const py = cy + hash2(wx, wy, seed + 7)
      const d = Math.hypot(x - px, y - py)
      if (d < best) {
        best = d
        id = hash2(wx, wy, seed + 13)
      }
    }
  }
  return { d: best, id }
}

export interface SurfaceOptions {
  size?: number
  seed?: number
  /** albedo colour at height 0 and at height 1 (linear 0..1 per channel) */
  low: [number, number, number]
  high: [number, number, number]
  /** how the height field is built: fine pebbles, broad blotches or both */
  pebbles?: number // cells per tile
  pebbleWeight?: number
  blotch?: number // noise cells per tile
  blotchWeight?: number
  speck?: number // 0..1 amount of dark pits
  normalStrength?: number
  repeat: number
}

export function makeSurface(o: SurfaceOptions) {
  const N = o.size ?? 512
  const seed = o.seed ?? 3
  const height = new Float32Array(N * N)
  const tone = new Float32Array(N * N) // per-pebble brightness, so the stones are not all one grey
  const pc = o.pebbles ?? 0
  const bc = o.blotch ?? 8
  const pw = o.pebbleWeight ?? (pc ? 0.6 : 0)
  const bw = o.blotchWeight ?? 0.4
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N
      const v = y / N
      let h = 0
      let t = 0.5
      if (pc) {
        const a = worley(u * pc, v * pc, pc, seed)
        const b = worley(u * pc * 2.7, v * pc * 2.7, Math.round(pc * 2.7), seed + 40)
        const ha = (1 - Math.min(1, a.d * 1.3)) * (0.45 + 0.55 * a.id)
        const hb = (1 - Math.min(1, b.d * 1.3)) * (0.4 + 0.6 * b.id)
        h += pw * (0.62 * ha + 0.38 * hb)
        t = 0.62 * a.id + 0.38 * b.id
      }
      tone[y * N + x] = t
      h += bw * fbm(u * bc, v * bc, bc, seed + 31)
      h += 0.12 * fbm(u * 64, v * 64, 64, seed + 55, 2)
      height[y * N + x] = h
    }
  }
  let min = Infinity
  let max = -Infinity
  for (const h of height) {
    if (h < min) min = h
    if (h > max) max = h
  }
  const albedo = document.createElement('canvas')
  const normal = document.createElement('canvas')
  albedo.width = albedo.height = normal.width = normal.height = N
  const ac = albedo.getContext('2d')!
  const nc = normal.getContext('2d')!
  const ai = ac.createImageData(N, N)
  const ni = nc.createImageData(N, N)
  const strength = (o.normalStrength ?? 2.4) * N * 0.012
  const at = (x: number, y: number) => height[((y + N) % N) * N + ((x + N) % N)]
  const lin2srgb = (c: number) => Math.round(255 * Math.pow(Math.min(1, Math.max(0, c)), 1 / 2.2))
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const h = (height[y * N + x] - min) / (max - min)
      const k = (y * N + x) * 4
      const pit = o.speck ? (hash2(x, y, seed + 99) < o.speck * 0.02 ? 0.55 : 1) : 1
      const shade = (0.7 + 0.3 * hash2(x >> 1, y >> 1, seed + 5)) * pit
      const tn = 0.65 + 0.7 * tone[y * N + x]
      for (let c = 0; c < 3; c++) ai.data[k + c] = lin2srgb((o.low[c] + (o.high[c] - o.low[c]) * h) * shade * tn)
      ai.data[k + 3] = 255
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength
      const nx = -dx
      const ny = -dy
      const nl = Math.hypot(nx, ny, 1)
      ni.data[k] = Math.round((nx / nl * 0.5 + 0.5) * 255)
      ni.data[k + 1] = Math.round((ny / nl * 0.5 + 0.5) * 255)
      ni.data[k + 2] = Math.round((1 / nl * 0.5 + 0.5) * 255)
      ni.data[k + 3] = 255
    }
  }
  ac.putImageData(ai, 0, 0)
  nc.putImageData(ni, 0, 0)
  const map = new CanvasTexture(albedo)
  const normalMap = new CanvasTexture(normal)
  for (const t of [map, normalMap]) {
    t.wrapS = t.wrapT = RepeatWrapping
    t.repeat.set(o.repeat, o.repeat)
    t.anisotropy = 8
    t.minFilter = LinearMipmapLinearFilter
    t.generateMipmaps = true
  }
  map.colorSpace = SRGBColorSpace
  normalMap.colorSpace = NoColorSpace
  return { map, normalMap }
}

/** a small label plate: text on a dark engraved panel, as a texture */
export function makePlate(lines: string[], w = 512, h = 160) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = '#17181b'
  g.fillRect(0, 0, w, h)
  g.strokeStyle = '#6d7077'
  g.lineWidth = 3
  g.strokeRect(5, 5, w - 10, h - 10)
  g.fillStyle = '#d5d7db'
  g.textBaseline = 'middle'
  g.textAlign = 'center'
  lines.forEach((t, i) => {
    g.font = `${i === 0 ? 600 : 400} ${i === 0 ? 54 : 32}px "Geist Variable", system-ui, sans-serif`
    g.fillText(t, w / 2, h * (0.34 + i * 0.34))
  })
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}
