// Ground analysis for the story scenes. Pure functions over the decimated Nightingale tile (metres, +y up, see
// docs/website_revamp.md): a height field rasterised from the triangles, a per-cell hazard map in the spirit of the
// real one (rocks that stand clear of the local ground), and a deterministic choice of where each scene takes place.
// This is illustrative, not the mission's hazard definition: the thresholds below are the story's own.

export interface Heightfield {
  x0: number
  z0: number
  cell: number
  nx: number
  nz: number
  h: Float32Array
}

/** Rasterise triangles into a top-surface height field (the highest surface at each cell, so no overhangs). */
export function buildHeightfield(pos: ArrayLike<number>, idx: ArrayLike<number>, cell = 0.2): Heightfield {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (let i = 0; i < pos.length; i += 3) {
    minX = Math.min(minX, pos[i]); maxX = Math.max(maxX, pos[i])
    minZ = Math.min(minZ, pos[i + 2]); maxZ = Math.max(maxZ, pos[i + 2])
  }
  const nx = Math.ceil((maxX - minX) / cell) + 1
  const nz = Math.ceil((maxZ - minZ) / cell) + 1
  const h = new Float32Array(nx * nz).fill(-1e9)
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3
    const ax = pos[a], az = pos[a + 2], ay = pos[a + 1]
    const bx = pos[b], bz = pos[b + 2], by = pos[b + 1]
    const cx = pos[c], cz = pos[c + 2], cy = pos[c + 1]
    const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)
    if (Math.abs(den) < 1e-12) continue
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - minX) / cell))
    const i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx, cx) - minX) / cell))
    const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - minZ) / cell))
    const j1 = Math.min(nz - 1, Math.ceil((Math.max(az, bz, cz) - minZ) / cell))
    for (let j = j0; j <= j1; j++) {
      const pz = minZ + j * cell
      for (let i = i0; i <= i1; i++) {
        const px = minX + i * cell
        const l1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / den
        const l2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / den
        const l3 = 1 - l1 - l2
        if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue
        const y = l1 * ay + l2 * by + l3 * cy
        const k = j * nx + i
        if (y > h[k]) h[k] = y
      }
    }
  }
  // close the small holes left between slivers by averaging the neighbours that do have a value
  for (let pass = 0; pass < 3; pass++) {
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i
        if (h[k] > -1e8) continue
        let s = 0, n = 0
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = i + di, jj = j + dj
            if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue
            const v = h[jj * nx + ii]
            if (v > -1e8) { s += v; n++ }
          }
        }
        if (n) h[k] = s / n
      }
    }
  }
  return { x0: minX, z0: minZ, cell, nx, nz, h }
}

export function sampleHeight(hf: Heightfield, x: number, z: number): number {
  const fx = (x - hf.x0) / hf.cell
  const fz = (z - hf.z0) / hf.cell
  const i = Math.max(0, Math.min(hf.nx - 2, Math.floor(fx)))
  const j = Math.max(0, Math.min(hf.nz - 2, Math.floor(fz)))
  const tx = Math.max(0, Math.min(1, fx - i))
  const tz = Math.max(0, Math.min(1, fz - j))
  const g = (ii: number, jj: number) => {
    const v = hf.h[jj * hf.nx + ii]
    return v < -1e8 ? 0 : v
  }
  const a = g(i, j) * (1 - tx) + g(i + 1, j) * tx
  const b = g(i, j + 1) * (1 - tx) + g(i + 1, j + 1) * tx
  return a * (1 - tz) + b * tz
}

export interface HazardGrid {
  /** hazard cell size in metres */
  g: number
  x0: number
  z0: number
  nx: number
  nz: number
  /** 0 = clear, 1 = a rock or steep ground */
  hazard: Uint8Array
  /** height of the tallest rock above the local ground in each cell, metres */
  rock: Float32Array
}

/** A rock counts as a hazard when it stands this far clear of the plane fitted to the ground around it. */
export const ROCK_HEIGHT_M = 0.28
export const SLOPE_LIMIT_DEG = 24

export function buildHazardGrid(hf: Heightfield, g = 1.2): HazardGrid {
  const nx = Math.floor((hf.nx * hf.cell) / g)
  const nz = Math.floor((hf.nz * hf.cell) / g)
  const hazard = new Uint8Array(nx * nz)
  const rock = new Float32Array(nx * nz)
  const per = Math.max(2, Math.round(g / hf.cell))
  for (let cj = 1; cj < nz - 1; cj++) {
    for (let ci = 1; ci < nx - 1; ci++) {
      // plane fitted to the ring of cells around this one (the ground), then the tallest thing inside the cell above it
      const px: number[] = [], pz: number[] = [], py: number[] = []
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue
          const i0 = Math.floor(((ci + di) * g) / hf.cell)
          const j0 = Math.floor(((cj + dj) * g) / hf.cell)
          const ys: number[] = []
          for (let b = 0; b < per; b += 2) for (let a = 0; a < per; a += 2) {
            const v = hf.h[(j0 + b) * hf.nx + (i0 + a)]
            if (v > -1e8) ys.push(v)
          }
          ys.sort((p, q) => p - q)
          if (!ys.length) continue
          px.push((ci + di + 0.5) * g); pz.push((cj + dj + 0.5) * g); py.push(ys[Math.floor(ys.length * 0.25)])
        }
      }
      if (py.length < 6) continue
      // least squares y = a x + b z + c
      let sx = 0, sz = 0, sy = 0, sxx = 0, szz = 0, sxz = 0, sxy = 0, szy = 0
      const n = py.length
      for (let k = 0; k < n; k++) { sx += px[k]; sz += pz[k]; sy += py[k]; sxx += px[k] * px[k]; szz += pz[k] * pz[k]; sxz += px[k] * pz[k]; sxy += px[k] * py[k]; szy += pz[k] * py[k] }
      const m = [[sxx, sxz, sx], [sxz, szz, sz], [sx, sz, n]]
      const r = [sxy, szy, sy]
      const det = (a: number[][]) => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0])
      const D = det(m)
      if (Math.abs(D) < 1e-9) continue
      const col = (c: number) => m.map((row, i) => row.map((v, j) => (j === c ? r[i] : v)))
      const A = det(col(0)) / D, B = det(col(1)) / D, C = det(col(2)) / D
      let top = 0
      const i0 = Math.floor((ci * g) / hf.cell), j0 = Math.floor((cj * g) / hf.cell)
      for (let b = 0; b < per; b++) for (let a = 0; a < per; a++) {
        const v = hf.h[(j0 + b) * hf.nx + (i0 + a)]
        if (v < -1e8) continue
        const x = (i0 + a) * hf.cell, z = (j0 + b) * hf.cell
        top = Math.max(top, v - (A * x + B * z + C))
      }
      const slope = (Math.atan(Math.hypot(A, B)) * 180) / Math.PI
      const k = cj * nx + ci
      rock[k] = top
      hazard[k] = top > ROCK_HEIGHT_M || slope > SLOPE_LIMIT_DEG ? 1 : 0
    }
  }
  return { g, x0: hf.x0, z0: hf.z0, nx, nz, hazard, rock }
}

export interface Site {
  /** world position of the point of interest on the ground */
  x: number
  z: number
}

export interface StorySites {
  /** the 10 by 5 patch used by the four "how a probe sees" scenes */
  patch: { cx: number; cz: number; cols: number; rows: number; g: number; x0: number; z0: number; hazard: Uint8Array; target: [number, number] }
  clean: Site
  back: Site
  old: Site
}

const cellCenter = (gr: HazardGrid, i: number, j: number): Site => ({ x: gr.x0 + (i + 0.5) * gr.g, z: gr.z0 + (j + 0.5) * gr.g })

/** Pick the patch and the three landing sites from the ground itself, deterministically. */
export function chooseSites(hf: Heightfield, gr: HazardGrid, radius = 17): StorySites {
  const cols = 10, rows = 5
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= gr.nx || j >= gr.nz ? 1 : gr.hazard[j * gr.nx + i])
  const inside = (i: number, j: number) => {
    const c = cellCenter(gr, i, j)
    return Math.hypot(c.x, c.z) < radius
  }
  let best: { score: number; i: number; j: number; tx: number; tj: number } | null = null
  for (let j = 2; j < gr.nz - rows - 2; j++) {
    for (let i = 2; i < gr.nx - cols - 2; i++) {
      if (!inside(i + cols / 2, j + rows / 2)) continue
      let haz = 0
      for (let b = 0; b < rows; b++) for (let a = 0; a < cols; a++) haz += at(i + a, j + b)
      const f = haz / (cols * rows)
      if (f < 0.14 || f > 0.34) continue
      // the safest target: a clear cell whose eight neighbours are clear too, nearest the middle of the patch
      let bt: { d: number; a: number; b: number } | null = null
      for (let b = 1; b < rows - 1; b++) for (let a = 2; a < cols - 2; a++) {
        let ok = true
        for (let dj = -1; dj <= 1 && ok; dj++) for (let di = -1; di <= 1; di++) if (at(i + a + di, j + b + dj)) { ok = false; break }
        if (!ok) continue
        const d = Math.hypot(a - (cols - 1) / 2, b - (rows - 1) / 2)
        if (!bt || d < bt.d) bt = { d, a, b }
      }
      if (!bt) continue
      // spread of the hazards across the patch reads better than one clump
      let left = 0, right = 0, top = 0, bottom = 0
      for (let b = 0; b < rows; b++) for (let a = 0; a < cols; a++) {
        const hz = at(i + a, j + b)
        if (a < cols / 2) left += hz; else right += hz
        if (b < rows / 2) top += hz; else bottom += hz
      }
      const balance = 1 - Math.abs(left - right) / Math.max(1, left + right) * 0.6 - Math.abs(top - bottom) / Math.max(1, top + bottom) * 0.6
      const score = -Math.abs(f - 0.24) * 6 + balance * 1.2 - bt.d * 0.15 - Math.hypot(...[i + cols / 2, j + rows / 2].map((v, k) => (k ? gr.z0 + v * gr.g : gr.x0 + v * gr.g))) * 0.01
      if (!best || score > best.score) best = { score, i, j, tx: bt.a, tj: bt.b }
    }
  }
  if (!best) throw new Error('no suitable patch on the tile')
  const patchHaz = new Uint8Array(cols * rows)
  for (let b = 0; b < rows; b++) for (let a = 0; a < cols; a++) patchHaz[b * cols + a] = at(best.i + a, best.j + b)
  const p0 = cellCenter(gr, best.i, best.j)
  const patch = {
    cols, rows, g: gr.g,
    x0: gr.x0 + best.i * gr.g,
    z0: gr.z0 + best.j * gr.g,
    cx: gr.x0 + (best.i + cols / 2) * gr.g,
    cz: gr.z0 + (best.j + rows / 2) * gr.g,
    hazard: patchHaz,
    target: [best.tx, best.tj] as [number, number],
  }
  void p0
  const inPatch = (i: number, j: number) => i >= best!.i - 3 && i < best!.i + cols + 3 && j >= best!.j - 3 && j < best!.j + rows + 3

  // back-away site: the tallest isolated rock; old-map site: a smaller one the map could have missed
  let big: { h: number; i: number; j: number } | null = null
  for (let j = 3; j < gr.nz - 3; j++) for (let i = 3; i < gr.nx - 3; i++) {
    if (!inside(i, j) || inPatch(i, j)) continue
    const r = gr.rock[j * gr.nx + i]
    if (r < 0.4) continue
    let near = 0
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) if ((di || dj) && at(i + di, j + dj)) near++
    if (near > 12) continue // fairly isolated, so the camera can see it plainly
    if (!big || r > big.h) big = { h: r, i, j }
  }
  if (!big) big = { h: 0, i: best.i + 1, j: best.j + 1 }
  let small: { h: number; i: number; j: number } | null = null
  for (let j = 3; j < gr.nz - 3; j++) for (let i = 3; i < gr.nx - 3; i++) {
    if (!inside(i, j) || inPatch(i, j)) continue
    if (Math.hypot(i - big.i, j - big.j) < 6) continue
    const r = gr.rock[j * gr.nx + i]
    if (r < 0.3 || r > 0.5) continue
    let near = 0
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) if ((di || dj) && at(i + di, j + dj)) near++
    if (near > 3) continue
    const score = -near - Math.hypot(i - big.i, j - big.j) * 0.01 + r
    if (!small || score > small.h) small = { h: score, i, j }
  }
  if (!small) small = { h: 0, i: big.i + 7, j: big.j }
  const clean = cellCenter(gr, best.i + best.tx, best.j + best.tj)
  return { patch, clean, back: cellCenter(gr, big.i, big.j), old: cellCenter(gr, small.i, small.j) }
}
