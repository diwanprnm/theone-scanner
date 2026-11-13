import type { Pt, Quad, Size } from './types'

/**
 * Solve the 8-parameter projective transform mapping (0,0),(1,0),(1,1),(0,1)
 * onto the quad's four corners. Returns [a,b,c,d,e,f,g,h] for:
 *   x' = (a*u + b*v + c) / (g*u + h*v + 1)
 *   y' = (d*u + e*v + f) / (g*u + h*v + 1)
 */
export function homography(q: Quad): number[] {
  // Build 8x8 system A·p = b for the four corner correspondences.
  const src: Pt[] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ]
  const A: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = src[i]
    const { x, y } = q[i]
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x])
    b.push(x)
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y])
    b.push(y)
  }
  return solve(A, b)
}

/** Gaussian elimination with partial pivoting. Returns null-safe fallback on singularity. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0]
    ;[M[col], M[pivot]] = [M[pivot], M[col]]
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / M[col][col]
      if (f === 0) continue
      for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k]
    }
  }
  const x = new Array<number>(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n]
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]
    x[r] = s / M[r][r]
  }
  return x
}

/** Longest output edge, derived from the quad's own edge lengths so the warp is not stretched. */
export function targetSize(q: Quad, maxDim: number): Size {
  const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
  let w = Math.ceil(Math.max(dist(q[0], q[1]), dist(q[3], q[2])))
  let h = Math.ceil(Math.max(dist(q[0], q[3]), dist(q[1], q[2])))
  w = Math.max(1, w)
  h = Math.max(1, h)
  const scale = Math.min(1, maxDim / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) }
}

/**
 * Warp the quad out of `src` into a new canvas of `out` size by inverse sampling.
 * Inverts the homography so every destination pixel pulls from the source:
 * no gaps, no double-writes.
 */
export function warpToCanvas(
  src: CanvasImageSource & { width: number; height: number },
  srcSize: Size,
  q: Quad,
  out: Size,
): HTMLCanvasElement {
  const H = homography(q)
  const dst = document.createElement('canvas')
  dst.width = out.w
  dst.height = out.h
  const ctx = dst.getContext('2d')!
  const sctx = (() => {
    const c = document.createElement('canvas')
    c.width = srcSize.w
    c.height = srcSize.h
    const cx = c.getContext('2d', { willReadFrequently: true })!
    cx.drawImage(src, 0, 0)
    return cx
  })()
  const S = sctx.getImageData(0, 0, srcSize.w, srcSize.h)
  const D = ctx.createImageData(out.w, out.h)
  const sd = S.data
  const dd = D.data
  const [a, b, c, d, e, f, g, h] = H
  const sw = srcSize.w
  const sh = srcSize.h
  for (let y = 0; y < out.h; y++) {
    const v = y / out.h
    const rowOff = y * out.w * 4
    for (let x = 0; x < out.w; x++) {
      const u = x / out.w
      const den = g * u + h * v + 1
      if (Math.abs(den) < 1e-9) continue
      const sx = ((a * u + b * v + c) / den) | 0
      const sy = ((d * u + e * v + f) / den) | 0
      const o = rowOff + x * 4
      if (sx < 0 || sy < 0 || sx >= sw || sy >= sh) {
        dd[o] = 255
        dd[o + 1] = 255
        dd[o + 2] = 255
        dd[o + 3] = 255
        continue
      }
      const so = (sy * sw + sx) * 4
      dd[o] = sd[so]
      dd[o + 1] = sd[so + 1]
      dd[o + 2] = sd[so + 2]
      dd[o + 3] = sd[so + 3]
    }
  }
  ctx.putImageData(D, 0, 0)
  return dst
}

/** Quad covering the whole image, used as the default crop. */
export function fullQuad({ w, h }: Size): Quad {
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ]
}

/** True when the quad is degenerate (zero area or self-intersecting) and must be rejected. */
export function isBadQuad(q: Quad): boolean {
  const area = Math.abs(
    q.reduce((acc, p, i) => {
      const n = q[(i + 1) % 4]
      return acc + p.x * n.y - n.x * p.y
    }, 0) / 2,
  )
  if (area < 400) return true
  // Cross products of consecutive edges must all share a sign (convex, in order).
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = q[i]
    const b = q[(i + 1) % 4]
    const c = q[(i + 2) % 4]
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (Math.abs(z) < 1e-6) continue
    if (sign === 0) sign = Math.sign(z)
    else if (Math.sign(z) !== sign) return true
  }
  return false
}