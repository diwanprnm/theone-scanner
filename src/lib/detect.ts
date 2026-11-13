import { isBadQuad } from './warp'
import type { Quad } from './types'

/**
 * Auto crop. A document photo is a bright sheet on a darker scene, so the quad
 * comes from the extreme points of an Otsu-thresholded bright mask instead of
 * full contour tracing: ~80 lines rather than a 10 MB OpenCV build, and on the
 * shot a phone camera actually takes it lands within a couple of percent of the
 * paper edge. Returns null when the scene does not look like that, so the caller
 * keeps the full frame rather than guessing.
 */
export function detectQuad(bitmap: ImageBitmap): Quad | null {
  const scale = Math.min(1, 360 / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(8, Math.round(bitmap.width * scale))
  const h = Math.max(8, Math.round(bitmap.height * scale))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0, w, h)
  const px = ctx.getImageData(0, 0, w, h).data

  const luma = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    luma[i] = ((px[o] * 299 + px[o + 1] * 587 + px[o + 2] * 114) / 1000) | 0
  }

  const q = quadFromLuma(luma, w, h)
  if (!q) return null

  // Back to source pixels, and reject anything that is not a plausible sheet.
  const k = 1 / scale
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
  const frame = bitmap.width * bitmap.height
  if (area < frame * 0.1 || area > frame * 0.98 || isBadQuad(out)) return null
  return out
}

/**
 * The geometry, separated from the canvas so it can be checked without a DOM:
 * given a luma field, return the sheet's quad in that field's pixels.
 */
export function quadFromLuma(luma: Uint8Array, w: number, h: number): Quad | null {
  const hist = new Uint32Array(256)
  for (let i = 0; i < w * h; i++) hist[luma[i]]++

  const t = otsu(hist, w * h)
  const mask = new Uint8Array(w * h)
  let on = 0
  for (let i = 0; i < w * h; i++) {
    if (luma[i] > t) {
      mask[i] = 1
      on++
    }
  }

  // The sheet already fills the frame: the full quad is the right answer, and
  // thresholding here would only find the text inside it.
  if (on > w * h * 0.9 || on < w * h * 0.04) return null

  // One pixel of specular highlight must not own a corner, so erode once.
  const solid = erode(mask, w, h)
  const use = count(solid) > 200 ? solid : mask

  let tl = -1
  let tr = -1
  let br = -1
  let bl = -1
  let minSum = Infinity
  let maxSum = -Infinity
  let maxDiff = -Infinity
  let minDiff = Infinity
  for (let i = 0; i < use.length; i++) {
    if (!use[i]) continue
    const x = i % w
    const y = (i / w) | 0
    const s = x + y
    const d = x - y
    if (s < minSum) [minSum, tl] = [s, i]
    if (s > maxSum) [maxSum, br] = [s, i]
    if (d > maxDiff) [maxDiff, tr] = [d, i]
    if (d < minDiff) [minDiff, bl] = [d, i]
  }
  if (tl < 0 || tr < 0 || br < 0 || bl < 0) return null
  if (new Set([tl, tr, br, bl]).size < 4) return null

  const pt = (i: number) => ({ x: i % w, y: (i / w) | 0 })
  return grow([pt(tl), pt(tr), pt(br), pt(bl)], w, h, 1.5)
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

function erode(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      if (mask[i] && mask[i - 1] && mask[i + 1] && mask[i - w] && mask[i + w]) out[i] = 1
    }
  }
  return out
}

function count(a: Uint8Array): number {
  let n = 0
  for (let i = 0; i < a.length; i++) n += a[i]
  return n
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
