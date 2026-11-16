import { isBadQuad } from './warp'
import type { Pt, Quad } from './types'

/** Working resolution: fine enough to place a corner, small enough to stay instant. */
const WORK = 480
/** A sheet's border must be a real step in brightness, not noise. */
const STEP = 12

/**
 * Auto crop. A document photo is a sheet on a desk, and every cheap way to find
 * it breaks on a real one:
 *
 *   - one global threshold dies when the lamp falls off across the frame;
 *   - one global threshold also dies on white paper on a pale desk;
 *   - a hull of the threshold blob follows a lamp hotspot out of the sheet.
 *
 * So the sheet is found three ways, cheapest first, and each candidate has to
 * prove it is a sheet before it is accepted:
 *
 *   1. flood        — fill the desk in from the frame border across small steps.
 *                     A lighting ramp is followed, the paper's border is not.
 *   2. edge ridge   — the four sides fitted to the strongest gradients, at two
 *                     cuts so a shadowed border and a crisp one both qualify.
 *   3. Otsu split   — hysteresis, which keeps a sheet whole under a shadow.
 *
 * A candidate must show a brightness step along its border (`sharp`), and the
 * edge candidates must have gradient points under every side (`support`). The
 * inverted field is tried second so a dark card on a light desk still works.
 * Returns null when nothing looks like a sheet, so the caller keeps the full
 * frame rather than guessing.
 */
export function detectQuad(bitmap: ImageBitmap): Quad | null {
  const scale = Math.min(1, WORK / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(8, Math.round(bitmap.width * scale))
  const h = Math.max(8, Math.round(bitmap.height * scale))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0, w, h)
  const px = ctx.getImageData(0, 0, w, h).data

  const luma = new Uint8Array(w * h)
  const inv = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    const v = ((px[o] * 299 + px[o + 1] * 587 + px[o + 2] * 114) / 1000) | 0
    luma[i] = v
    inv[i] = 255 - v
  }

  const k = 1 / scale
  const frame = bitmap.width * bitmap.height
  for (const field of [luma, inv]) {
    const q = quadFromLuma(field, w, h)
    if (!q || step(q, field, w, h) < STEP) continue
    // Back to source pixels, and reject anything that is not a plausible sheet.
    const out = q.map((p) => ({
      x: Math.min(bitmap.width, Math.max(0, p.x * k)),
      y: Math.min(bitmap.height, Math.max(0, p.y * k)),
    })) as Quad
    const area = Math.abs(
      out.reduce((acc, p, i) => {
        const n = out[(i + 1) % 4]
        return acc + p.x * n.y - n.x * p.y
      }, 0) / 2,
    )
    if (area < frame * 0.06 || area > frame * 0.98 || isBadQuad(out)) continue
    return out
  }
  return null
}

/**
 * The geometry, separated from the canvas so it can be checked without a DOM:
 * given a luma field, return the sheet's quad in that field's pixels.
 */
export function quadFromLuma(luma: Uint8Array, w: number, h: number): Quad | null {
  const n = w * h
  const px = blur(luma, w, h)
  // A page border is a step; a lighting ramp is not. Every path must clear this,
  // or a vignette on an empty desk gets cropped as if it were paper.
  const ok = (q: Quad | null): Quad | null => (q && sharp(q, px, w, h) >= 4 ? q : null)
  // Path 1: flood the desk in from the frame border. It only crosses a local
  // brightness step, so a lighting ramp is followed straight through while the
  // paper's border stops it. A global threshold cannot do this: white paper on
  // a pale desk has no single level that separates them once the lamp falls off.
  const bg = background(px, w, h)
  const sheet = new Uint8Array(n)
  let bgN = 0
  for (let i = 0; i < n; i++) {
    if (bg[i]) bgN++
    else sheet[i] = 1
  }
  // Too little background means the flood started on the sheet and ate it.
  const frac = bgN / n
  if (frac > 0.04 && frac < 0.92) {
    const q = ok(quadOf(largest(sheet, null, w, h), w, h))
    if (q) return q
  }

  // Path 2: the sheet border as a gradient ridge. Reached when the flood leaked
  // through a border where paper and desk share a level (a pale desk under the
  // same lamp). The border is still the longest strong edge in the frame, and
  // ink only ever lies inside it, so the hull of the edge points is the sheet's
  // outline.
  for (const c of edgeQuads(px, w, h)) if (ok(c)) return c

  // Path 3: hysteresis on the Otsu split. A shadow across the sheet is followed
  // to the looser level, so it does not cut the sheet in half; a stricter pass
  // catches the case where the loose one grew past the sheet into the scene.
  const hist = new Uint32Array(256)
  for (let i = 0; i < n; i++) hist[px[i]]++
  const t = otsu(hist, n)
  const tl = Math.round(t * 0.72)

  const strict = new Uint8Array(n)
  const loose = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    if (px[i] > t) strict[i] = 1
    if (px[i] > tl) loose[i] = 1
  }
  return ok(quadOf(largest(loose, strict, w, h), w, h)) ?? ok(quadOf(largest(strict, null, w, h), w, h))
}

/**
 * A sheet border is a step: brightness jumps within a pixel or two. A threshold
 * that splits a smooth ramp (a lamp hotspot on a bare desk) has no such jump
 * anywhere on its border, which is what keeps a vignette from being cropped as
 * a page. Returns the median jump along the four sides.
 */
function sharp(q: Quad, f: Uint8Array, w: number, h: number): number {
  const jumps: number[] = []
  for (let i = 0; i < 4; i++) {
    const a = q[i]
    const b = q[(i + 1) % 4]
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const nx = -(b.y - a.y) / L
    const ny = (b.x - a.x) / L
    for (let s = 1; s < 16; s++) {
      const t = s / 16
      const cx = a.x + (b.x - a.x) * t
      const cy = a.y + (b.y - a.y) * t
      let prev = -1
      let best = 0
      for (let d = -5; d <= 5; d++) {
        const x = Math.round(cx + nx * d)
        const y = Math.round(cy + ny * d)
        if (x < 0 || y < 0 || x >= w || y >= h) {
          prev = -1
          continue
        }
        const v = f[y * w + x]
        if (prev >= 0) best = Math.max(best, Math.abs(v - prev))
        prev = v
      }
      jumps.push(best)
    }
  }
  jumps.sort((x, y) => x - y)
  return jumps[jumps.length >> 1]
}

/**
 * Sheet outlines from the strongest gradients, largest first: hull, then the
 * same line fit. Two cuts, because one has to serve both a crisp page edge and
 * a page whose shadowed side is only a 36-level step above the desk.
 */
function edgeQuads(px: Uint8Array, w: number, h: number): Quad[] {
  const n = w * h
  // One more blur only. A shadowed sheet's border is a 36-level step that three
  // passes spread below the desk's own grain; two keep it a ridge.
  const f = blur(px, w, h)
  const mag = new Uint8Array(n)
  const hist = new Uint32Array(256)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const gx =
        f[i - w + 1] + 2 * f[i + 1] + f[i + w + 1] - f[i - w - 1] - 2 * f[i - 1] - f[i + w - 1]
      const gy =
        f[i + w - 1] + 2 * f[i + w] + f[i + w + 1] - f[i - w - 1] - 2 * f[i - w] - f[i - w + 1]
      const g = Math.min(255, (Math.abs(gx) + Math.abs(gy)) >> 2)
      mag[i] = g
      hist[g]++
    }
  }
  // The 90th percentile is the paper edge: everything flatter is paper, desk or
  // ink, and ink only ever lies inside the sheet, so it cannot widen the hull.
  // The floor drops a smooth vignette, whose every pixel has a tiny gradient.
  const strong = Math.max(24, percentileOf(hist, n, 0.9))
  // A shadowed or pale border is shallower than that, so the same points are
  // retried against a cut relative to the frame's strongest edges. The larger
  // quad wins: a too-high cut can only under-cover the sheet, never over-cover
  // it, because ink is inside and the desk is outside.
  const weak = Math.max(2, percentileOf(hist, (w - 2) * (h - 2), 0.99) * 0.15)
  const out = [quadFromEdges(mag, strong, w, h), quadFromEdges(mag, weak, w, h)]
  return out.filter((q): q is Quad => !!q).sort((a, b) => areaOf(b) - areaOf(a))
}

function quadFromEdges(mag: Uint8Array, cut: number, w: number, h: number): Quad | null {
  const n = w * h
  const pts: Pt[] = []
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      if (mag[i] < cut) continue
      // Keep only the ridge: a pixel as strong as its neighbours in the gradient
      // direction. Ink is inside the sheet, so it cannot widen the hull.
      if (mag[i] >= mag[i - 1] && mag[i] >= mag[i + 1] && mag[i] >= mag[i - w] && mag[i] >= mag[i + w])
        pts.push({ x, y })
    }
  }
  if (pts.length < 40 || pts.length > n * 0.2) return null
  const hullPts = convexHull(pts)
  if (hullPts.length < 4) return null
  let q = extremes(hullPts)
  if (!q) return null
  const edge = (p: Pt) => p.x < 1.5 || p.y < 1.5 || p.x > w - 2.5 || p.y > h - 2.5
  if (q.filter(edge).length >= 2) return null
  for (let it = 0; it < 2; it++) {
    const next = refine(q, pts)
    if (!next || isBadQuad(next) || moved(q, next) > 6) break
    q = next
  }
  // Every side must be an edge most of the way. A bright lamp in the corner
  // pulls the hull out to it, and the side that then cuts across the paper has
  // no edge points under it at all. A sheet rotated past 45° has short sides
  // with few points on them, so the bar is 40%.
  if (support(q, pts) < 0.4) return null
  const out = grow(order(q), w, h, 0.5)
  const area = areaOf(out)
  if (!(area > n * 0.03 && area < n * 0.97)) return null
  return out
}

/** Worst side coverage: the fraction of a side with an edge point beside it. */
function support(q: Quad, pts: Pt[]): number {
  let worst = 1
  for (let i = 0; i < 4; i++) {
    const a = q[i]
    const b = q[(i + 1) % 4]
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const tol = Math.max(2, L * 0.03)
    const bins = new Uint8Array(20)
    for (const p of pts) {
      if (segDist(p, a, b) > tol) continue
      const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (L * L)
      if (t < 0 || t > 1) continue
      bins[Math.min(19, (t * 20) | 0)] = 1
    }
    worst = Math.min(worst, bins.reduce((s, v) => s + v, 0) / 20)
  }
  return worst
}

function percentileOf(hist: Uint32Array, total: number, q: number): number {
  const cut = Math.floor(total * q)
  let acc = 0
  for (let v = 0; v < 256; v++) {
    acc += hist[v]
    if (acc >= cut) return v
  }
  return 255
}

/**
 * Everything reachable from the frame border across small brightness steps.
 * Illumination changes smoothly, so it follows the lamp; paper is a step, so it
 * stops there. Direction-agnostic: dark paper on a lit desk floods the same way.
 */
function background(px: Uint8Array, w: number, h: number): Uint8Array {
  const n = w * h
  const bg = new Uint8Array(n)
  const stack = new Int32Array(n)
  let sp = 0
  const push = (i: number) => {
    if (!bg[i]) {
      bg[i] = 1
      stack[sp++] = i
    }
  }
  for (let x = 0; x < w; x++) {
    push(x)
    push((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    push(y * w)
    push(y * w + w - 1)
  }
  // The step is measured two pixels out, not one: the 3x3 blur spreads a soft
  // paper edge (a shadowed sheet on a dark desk) into four 9-level steps, which
  // a one-pixel test walks straight through. Across two pixels that same border
  // is still 36, while a lamp ramp is under 1.
  const T = 14
  const step = (a: number, b: number) => Math.abs(px[a] - px[b]) <= T
  while (sp) {
    const i = stack[--sp]
    const x = i % w
    if (x > 1 && !bg[i - 1] && step(i, i - 2)) push(i - 1)
    if (x < w - 2 && !bg[i + 1] && step(i, i + 2)) push(i + 1)
    if (i >= 2 * w && !bg[i - w] && step(i, i - 2 * w)) push(i - w)
    if (i < n - 2 * w && !bg[i + w] && step(i, i + 2 * w)) push(i + w)
  }
  return bg
}

function quadOf(comp: Component | null, w: number, h: number): Quad | null {
  const n = w * h
  if (!comp || comp.area < n * 0.03 || comp.area > n * 0.97) return null
  const hullPts = convexHull(comp.pts)
  if (hullPts.length < 4) return null
  let q = extremes(hullPts)
  if (!q) return null
  // A quad whose corners all sit on the frame border is a threshold split of the
  // scene (a lit wall, a horizon), not a sheet inside the photo.
  const edge = (p: Pt) => p.x < 1.5 || p.y < 1.5 || p.x > w - 2.5 || p.y > h - 2.5
  if (q.filter(edge).length >= 3) return null
  // A sheet's hull *is* its quad; a lamp hotspot is a disc, and the quad
  // inscribed in a disc covers only 2/π of it. 0.8 separates the two without
  // rejecting a sheet whose edge is scalloped or bitten by a shadow.
  if (areaOf(q) < areaOf(hullPts) * 0.8) return null
  // Two passes is enough: the first snaps each side to the hull, the second
  // re-assigns points to the corrected sides.
  for (let it = 0; it < 2; it++) {
    const next = refine(q, comp.pts)
    if (!next || isBadQuad(next) || moved(q, next) > 6) break
    q = next
  }
  return grow(order(q), w, h, 0.5)
}

/** Largest corner displacement between two quads: a snap that big is a bad fit. */
function moved(a: Quad, b: Quad): number {
  return Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)))
}

function areaOf(p: Pt[]): number {
  let a = 0
  for (let i = 0; i < p.length; i++) {
    const b = p[(i + 1) % p.length]
    a += p[i].x * b.y - b.x * p[i].y
  }
  return Math.abs(a) / 2
}

/** Mean luma inside the quad minus the mean in the ring just outside it. */
function step(q: Quad, luma: Uint8Array, w: number, h: number): number {
  const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4
  const cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4
  const at = (f: number) =>
    q.map((p) => ({ x: cx + (p.x - cx) * f, y: cy + (p.y - cy) * f })) as Quad
  const inner = at(0.85)
  const bandIn = at(1.04)
  const bandOut = at(1.22)
  let si = 0
  let ni = 0
  let so = 0
  let no = 0
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const v = luma[y * w + x]
      if (inside(inner, x, y)) {
        si += v
        ni++
      } else if (inside(bandOut, x, y) && !inside(bandIn, x, y)) {
        so += v
        no++
      }
    }
  }
  if (!ni) return -Infinity
  if (!no) return Infinity
  return si / ni - so / no
}

function inside(q: Quad, x: number, y: number): boolean {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = q[i]
    const b = q[(i + 1) % 4]
    const z = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x)
    if (z === 0) continue
    const s = z > 0 ? 1 : -1
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}

interface Component {
  area: number
  /** Boundary pixels only: the hull ignores everything inside them. */
  pts: Pt[]
}

/**
 * Largest 4-connected blob of `mask`. When `seeds` is given, a blob only counts
 * if it also contains enough pixels from that stricter mask, which is what makes
 * the loose mask's growth safe: it can extend a real sheet, not invent one.
 */
function largest(mask: Uint8Array, seeds: Uint8Array | null, w: number, h: number): Component | null {
  const n = w * h
  const label = new Int32Array(n).fill(-1)
  const stack = new Int32Array(n)
  const area: number[] = []
  const hits: number[] = []
  for (let s = 0; s < n; s++) {
    if (!mask[s] || label[s] >= 0) continue
    const id = area.length
    area.push(0)
    hits.push(0)
    let sp = 0
    stack[sp++] = s
    label[s] = id
    while (sp) {
      const i = stack[--sp]
      area[id]++
      if (seeds && seeds[i]) hits[id]++
      const x = i % w
      const y = (i / w) | 0
      if (x > 0 && mask[i - 1] && label[i - 1] < 0) {
        label[i - 1] = id
        stack[sp++] = i - 1
      }
      if (x < w - 1 && mask[i + 1] && label[i + 1] < 0) {
        label[i + 1] = id
        stack[sp++] = i + 1
      }
      if (y > 0 && mask[i - w] && label[i - w] < 0) {
        label[i - w] = id
        stack[sp++] = i - w
      }
      if (y < h - 1 && mask[i + w] && label[i + w] < 0) {
        label[i + w] = id
        stack[sp++] = i + w
      }
    }
  }

  let best = -1
  let bestArea = 0
  for (let id = 0; id < area.length; id++) {
    if (seeds && hits[id] < Math.max(20, area[id] * 0.02)) continue
    if (area[id] > bestArea) {
      bestArea = area[id]
      best = id
    }
  }
  if (best < 0) return null

  const pts: Pt[] = []
  for (let i = 0; i < n; i++) {
    if (label[i] !== best) continue
    const x = i % w
    const y = (i / w) | 0
    if (
      x === 0 ||
      y === 0 ||
      x === w - 1 ||
      y === h - 1 ||
      !mask[i - 1] ||
      !mask[i + 1] ||
      !mask[i - w] ||
      !mask[i + w]
    )
      pts.push({ x, y })
  }
  return { area: bestArea, pts }
}

function convexHull(pts: Pt[]): Pt[] {
  if (pts.length < 3) return pts
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Pt[] = []
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop()
    lower.push(q)
  }
  const upper: Pt[] = []
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop()
    upper.push(q)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

/**
 * Seed corners from the hull: the farthest-apart pair, then the points farthest
 * to either side of that diagonal. Independent of the sheet's rotation, unlike
 * the extremes of x+y and x−y, which collapse to a line past 45°.
 */
function extremes(hull: Pt[]): Quad | null {
  let a = hull[0]
  let b = hull[0]
  let best = -1
  for (let i = 0; i < hull.length; i++) {
    for (let j = i + 1; j < hull.length; j++) {
      const d = Math.hypot(hull[i].x - hull[j].x, hull[i].y - hull[j].y)
      if (d > best) {
        best = d
        a = hull[i]
        b = hull[j]
      }
    }
  }
  const dx = b.x - a.x
  const dy = b.y - a.y
  let hi = hull[0]
  let lo = hull[0]
  let maxD = -Infinity
  let minD = Infinity
  for (const p of hull) {
    const d = dx * (p.y - a.y) - dy * (p.x - a.x)
    if (d > maxD) [maxD, hi] = [d, p]
    if (d < minD) [minD, lo] = [d, p]
  }
  const q = [a, hi, b, lo] as Quad
  return new Set(q.map((p) => `${p.x},${p.y}`)).size === 4 ? q : null
}

interface Line {
  x: number
  y: number
  dx: number
  dy: number
}

/**
 * Relabel the corners as TL, TR, BR, BL: sort around the centroid for a valid
 * cycle, force clockwise winding (screen y grows down), then start at the
 * corner nearest the top-left. A sheet photographed upside down comes back
 * right side up.
 */
function order(q: Quad): Quad {
  const cx = q.reduce((a, p) => a + p.x, 0) / 4
  const cy = q.reduce((a, p) => a + p.y, 0) / 4
  let p = [...q].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx))
  const area = p.reduce((acc, a, i) => {
    const b = p[(i + 1) % 4]
    return acc + a.x * b.y - b.x * a.y
  }, 0)
  if (area < 0) p = [p[0], p[3], p[2], p[1]]
  let s = 0
  for (let i = 1; i < 4; i++) if (p[i].x + p[i].y < p[s].x + p[s].y) s = i
  return [...p.slice(s), ...p.slice(0, s)] as Quad
}

/** Snap the four sides to the boundary points, then take their intersections. */
function refine(q: Quad, pts: Pt[]): Quad | null {
  const meanSide = q.reduce((a, p, i) => a + Math.hypot(p.x - q[(i + 1) % 4].x, p.y - q[(i + 1) % 4].y), 0) / 4
  const tol = Math.max(2, meanSide * 0.04)
  const lines: Line[] = []
  for (let i = 0; i < 4; i++) {
    const a = q[i]
    const b = q[(i + 1) % 4]
    const near = pts.filter((p) => segDist(p, a, b) < tol)
    const l = fitLine(near)
    if (!l) return null
    lines.push(l)
  }
  const out: Pt[] = []
  for (let i = 0; i < 4; i++) {
    const p = isect(lines[(i + 3) % 4], lines[i])
    if (!p) return null
    out.push(p)
  }
  return out as Quad
}

/** Total least squares: the major axis through the centroid. */
function fitLine(pts: Pt[]): Line | null {
  const n = pts.length
  if (n < 6) return null
  let mx = 0
  let my = 0
  for (const p of pts) {
    mx += p.x
    my += p.y
  }
  mx /= n
  my /= n
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (const p of pts) {
    const dx = p.x - mx
    const dy = p.y - my
    sxx += dx * dx
    syy += dy * dy
    sxy += dx * dy
  }
  sxx /= n
  syy /= n
  sxy /= n
  const tr = sxx + syy
  const det = sxx * syy - sxy * sxy
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det))
  const l1 = tr / 2 + disc
  const l2 = tr / 2 - disc
  // A blob has no direction; a paper edge is long and thin.
  if (l1 < 1e-6 || l2 > l1 / 4) return null
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  return { x: mx, y: my, dx: Math.cos(th), dy: Math.sin(th) }
}

function isect(a: Line, b: Line): Pt | null {
  const den = a.dx * b.dy - a.dy * b.dx
  if (Math.abs(den) < 1e-6) return null
  const t = ((b.x - a.x) * b.dy - (b.y - a.y) * b.dx) / den
  return { x: a.x + a.dx * t, y: a.y + a.dy * t }
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const L = dx * dx + dy * dy
  const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function blur(luma: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const y0 = y > 0 ? y - 1 : 0
    const y1 = y < h - 1 ? y + 1 : h - 1
    for (let x = 0; x < w; x++) {
      const x0 = x > 0 ? x - 1 : 0
      const x1 = x < w - 1 ? x + 1 : w - 1
      const s =
        luma[y0 * w + x0] + luma[y0 * w + x] + luma[y0 * w + x1] +
        luma[y * w + x0] + luma[y * w + x] + luma[y * w + x1] +
        luma[y1 * w + x0] + luma[y1 * w + x] + luma[y1 * w + x1]
      out[y * w + x] = (s / 9) | 0
    }
  }
  return out
}

/** Otsu: the threshold that maximises between-class variance of a 256-bin histogram. */
function otsu(hist: Uint32Array, total: number): number {
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0
  let wB = 0
  let best = 0
  let bestVar = -1
  for (let i = 0; i < 256; i++) {
    wB += hist[i]
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sumB += i * hist[i]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const v = wB * wF * (mB - mF) * (mB - mF)
    if (v > bestVar) {
      bestVar = v
      best = i
    }
  }
  return best
}

/** Push the corners out by `pct` from the centroid, so the cut keeps the paper edge. */
function grow(q: Quad, w: number, h: number, pct: number): Quad {
  const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4
  const cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4
  const f = 1 + pct / 100
  return q.map((p) => ({
    x: Math.min(w - 1, Math.max(0, cx + (p.x - cx) * f)),
    y: Math.min(h - 1, Math.max(0, cy + (p.y - cy) * f)),
  })) as Quad
}
