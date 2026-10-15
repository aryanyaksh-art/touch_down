// Flat white overlays laid over the real ground: the hazard grid, the rock outlines, rings. All sample the height field so they follow the
// terrain instead of floating over it.
import { BufferAttribute, BufferGeometry, DoubleSide, Float32BufferAttribute, ShaderMaterial, Uint16BufferAttribute } from 'three'
import { sampleHeight, type Heightfield } from './terrain'

export const LIFT = 0.1

export interface GridSpec {
  x0: number
  z0: number
  cols: number
  rows: number
  g: number
  hazard: Uint8Array
}

/** Material for the grid pieces. `uShow` brings the whole thing in cell by cell, `uHot` fills the hazard cells the same way. */
export function revealMaterial(kind: 'line' | 'fill' | 'outline'): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: kind === 'fill' ? -4 : -2,
    polygonOffsetUnits: kind === 'fill' ? -4 : -2,
    uniforms: { uShow: { value: 0 }, uHot: { value: 0 }, uGain: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aT; attribute float aH;
      varying float vT; varying float vH;
      void main(){ vT = aT; vH = aH; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uShow; uniform float uHot; uniform float uGain;
      varying float vT; varying float vH;
      void main(){
        float show = clamp(uShow * 1.7 - vT * 0.7, 0.0, 1.0);
        float hot = clamp(uHot * 1.7 - vT * 0.7, 0.0, 1.0);
        float a = 0.0;
        ${kind === 'line' ? 'a = show * mix(0.30, 0.95, vH * hot);' : ''}
        ${kind === 'fill' ? 'a = hot * vH * 0.46;' : ''}
        ${kind === 'outline' ? 'a = show * 0.95;' : ''}
        if (a < 0.003) discard;
        gl_FragColor = vec4(vec3(0.96), a * uGain);
      }`,
  })
}

function pushSeg(pos: number[], t: number[], h: number[], hf: Heightfield, ax: number, az: number, bx: number, bz: number, order: number, haz: number) {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25))
  for (let i = 0; i < n; i++) {
    const x0 = ax + ((bx - ax) * i) / n, z0 = az + ((bz - az) * i) / n
    const x1 = ax + ((bx - ax) * (i + 1)) / n, z1 = az + ((bz - az) * (i + 1)) / n
    pos.push(x0, sampleHeight(hf, x0, z0) + LIFT, z0, x1, sampleHeight(hf, x1, z1) + LIFT, z1)
    t.push(order, order)
    h.push(haz, haz)
  }
}

export function buildGridGeometries(hf: Heightfield, s: GridSpec) {
  const lp: number[] = [], lt: number[] = [], lh: number[] = []
  const op: number[] = [], ot: number[] = [], oh: number[] = []
  const fp: number[] = [], ft: number[] = [], fh: number[] = []
  const at = (c: number, r: number) => (c < 0 || r < 0 || c >= s.cols || r >= s.rows ? 0 : s.hazard[r * s.cols + c])
  const span = s.cols + s.rows - 2
  for (let r = 0; r < s.rows; r++) {
    for (let c = 0; c < s.cols; c++) {
      const haz = at(c, r)
      const order = (c + r) / span
      const x0 = s.x0 + c * s.g, z0 = s.z0 + r * s.g, x1 = x0 + s.g, z1 = z0 + s.g
      const m = 0.05 // a hairline gap between cells so the grid reads as cells
      pushSeg(lp, lt, lh, hf, x0 + m, z0 + m, x1 - m, z0 + m, order, haz)
      pushSeg(lp, lt, lh, hf, x1 - m, z0 + m, x1 - m, z1 - m, order, haz)
      pushSeg(lp, lt, lh, hf, x1 - m, z1 - m, x0 + m, z1 - m, order, haz)
      pushSeg(lp, lt, lh, hf, x0 + m, z1 - m, x0 + m, z0 + m, order, haz)
      // outline of the hazard region: only the edges that face a clear cell
      if (haz) {
        if (!at(c, r - 1)) pushSeg(op, ot, oh, hf, x0, z0, x1, z0, order, 1)
        if (!at(c + 1, r)) pushSeg(op, ot, oh, hf, x1, z0, x1, z1, order, 1)
        if (!at(c, r + 1)) pushSeg(op, ot, oh, hf, x1, z1, x0, z1, order, 1)
        if (!at(c - 1, r)) pushSeg(op, ot, oh, hf, x0, z1, x0, z0, order, 1)
        const N = 4
        for (let j = 0; j < N; j++) {
          for (let i = 0; i < N; i++) {
            const ax = x0 + m + ((s.g - 2 * m) * i) / N, bx = x0 + m + ((s.g - 2 * m) * (i + 1)) / N
            const az = z0 + m + ((s.g - 2 * m) * j) / N, bz = z0 + m + ((s.g - 2 * m) * (j + 1)) / N
            const y = (x: number, z: number) => sampleHeight(hf, x, z) + LIFT * 1.4
            fp.push(ax, y(ax, az), az, bx, y(bx, az), az, bx, y(bx, bz), bz, ax, y(ax, az), az, bx, y(bx, bz), bz, ax, y(ax, bz), bz)
            for (let k = 0; k < 6; k++) { ft.push(order); fh.push(1) }
          }
        }
      }
    }
  }
  const mk = (p: number[], t: number[], h: number[]) => {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(p, 3))
    g.setAttribute('aT', new Float32BufferAttribute(t, 1))
    g.setAttribute('aH', new Float32BufferAttribute(h, 1))
    return g
  }
  return { lines: mk(lp, lt, lh), outlines: mk(op, ot, oh), fills: mk(fp, ft, fh) }
}

/** A closed ribbon (flat strip) that can be re-laid over the ground each frame. */
export class Ribbon {
  readonly geometry = new BufferGeometry()
  private readonly pos: Float32Array
  private readonly n: number
  constructor(n = 72) {
    this.n = n
    this.pos = new Float32Array(n * 2 * 3)
    const idx: number[] = []
    for (let i = 0; i < n; i++) {
      const a = i * 2, b = ((i + 1) % n) * 2
      idx.push(a, a + 1, b, a + 1, b + 1, b)
    }
    this.geometry.setAttribute('position', new BufferAttribute(this.pos, 3))
    this.geometry.setIndex(new Uint16BufferAttribute(idx, 1))
    this.geometry.boundingSphere = null
  }
  /** a rounded square (power 4) or circle (power 2) of half-size r, width w, at (cx, cz) draped on the ground (or flat at y if given) */
  set(hf: Heightfield | null, cx: number, cz: number, r: number, w: number, power = 2, flatY?: number) {
    const n = this.n
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const ca = Math.cos(a), sa = Math.sin(a)
      const k = Math.pow(Math.pow(Math.abs(ca), power) + Math.pow(Math.abs(sa), power), 1 / power)
      for (let side = 0; side < 2; side++) {
        const rr = (r + (side ? w / 2 : -w / 2)) / k
        const x = cx + ca * rr, z = cz + sa * rr
        const y = flatY ?? (hf ? sampleHeight(hf, x, z) + LIFT : 0)
        const o = (i * 2 + side) * 3
        this.pos[o] = x
        this.pos[o + 1] = y
        this.pos[o + 2] = z
      }
    }
    ;(this.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true
    this.geometry.computeBoundingSphere()
  }
}
