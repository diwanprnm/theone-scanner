import type { FilterName } from './types'

/** Apply a Filter in place on a 2D context. Pure pixel math, no dependencies. */
export function applyFilter(ctx: CanvasRenderingContext2D, filter: FilterName): void {
  if (filter === 'original') return
  const { width: w, height: h } = ctx.canvas
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data

  if (filter === 'enhance') {
    enhance(d)
  } else if (filter === 'gray' || filter === 'bw') {
    // Luma (Rec.601) so green-heavy scans do not turn muddy.
    let min = 255
    let max = 0
    const luma = new Uint8ClampedArray(w * h)
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const y = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000
      luma[p] = y
      if (y < min) min = y
      if (y > max) max = y
    }
    const span = Math.max(1, max - min)
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      let v = ((luma[p] - min) * 255) / span
      if (filter === 'bw') v = v > 150 ? 255 : 0 // ponytail: fixed threshold; Otsu if scans wash out
      d[i] = d[i + 1] = d[i + 2] = v
    }
  }
  ctx.putImageData(img, 0, 0)
}

/**
 * Enhance = per-channel histogram stretch + gray-world white balance.
 * Stretch removes the dull low-contrast look of phone photos; gray-world
 * removes the yellow tint of indoor lamps.
 */
function enhance(d: Uint8ClampedArray): void {
  const n = d.length / 4
  // 1. Per-channel percentiles at 1% / 99% to ignore specular highlights and deep shadows.
  const lo = [0, 0, 0]
  const hi = [255, 255, 255]
  for (let ch = 0; ch < 3; ch++) {
    const hist = new Uint32Array(256)
    for (let i = ch; i < d.length; i += 4) hist[d[i]]++
    const cut = Math.max(1, Math.floor(n * 0.01))
    let acc = 0
    for (let v = 0; v < 256; v++) {
      acc += hist[v]
      if (acc >= cut) {
        lo[ch] = v
        break
      }
    }
    acc = 0
    for (let v = 255; v >= 0; v--) {
      acc += hist[v]
      if (acc >= cut) {
        hi[ch] = v
        break
      }
    }
    if (hi[ch] - lo[ch] < 16) {
      lo[ch] = 0
      hi[ch] = 255
    }
  }
  // 2. Stretch each channel.
  for (let i = 0; i < d.length; i += 4) {
    for (let ch = 0; ch < 3; ch++) {
      const span = hi[ch] - lo[ch] || 1
      d[i + ch] = ((d[i + ch] - lo[ch]) * 255) / span
    }
  }
  // 3. Gray-world: pull channel means to their average (mild, half-strength).
  const mean = [0, 0, 0]
  for (let i = 0; i < d.length; i += 4) {
    mean[0] += d[i]
    mean[1] += d[i + 1]
    mean[2] += d[i + 2]
  }
  mean[0] /= n
  mean[1] /= n
  mean[2] /= n
  const target = (mean[0] + mean[1] + mean[2]) / 3
  if (target < 1) return
  const gain = mean.map((m) => 1 + (target / Math.max(1, m) - 1) * 0.5)
  for (let i = 0; i < d.length; i += 4) {
    d[i] = d[i] * gain[0]
    d[i + 1] = d[i + 1] * gain[1]
    d[i + 2] = d[i + 2] * gain[2]
  }
}