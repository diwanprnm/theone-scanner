import type { FilterName } from './types'

/**
 * Apply a Filter in place on a 2D context. Pure pixel math, no dependencies.
 *
 * A phone photo of a page is ink plus a smooth lighting ramp (lamp, hand
 * shadow, vignette). Every filter here first divides by a local estimate of the
 * paper's brightness: that removes the ramp and leaves ink at its true density,
 * so one global decision is no longer fighting the lighting. It is what makes
 * B&W usable on a shadowed page.
 */
export function applyFilter(ctx: CanvasRenderingContext2D, filter: FilterName): void {
  if (filter === 'original') return
  const { width: w, height: h } = ctx.canvas
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  const n = w * h

  const luma = new Float32Array(n)
  for (let i = 0, p = 0; p < n; i += 4, p++) {
    luma[p] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000
  }

  // Paper level: a max filter wider than any pen stroke, so what survives is how
  // bright the paper is at that spot — ink is too thin to raise the window.
  const bg = maxFilter(luma, w, h, Math.max(6, Math.round(Math.min(w, h) / 16)))
  const flat = new Float32Array(n)
  for (let p = 0; p < n; p++) flat[p] = Math.min(255, (255 * luma[p]) / Math.max(1, bg[p]))

  if (filter === 'enhance') enhance(d, luma, bg, flat, n)
  else if (filter === 'gray') gray(d, flat, n)
  else bw(d, flat, w, h)
  ctx.putImageData(img, 0, 0)
}

/** Gray: flattened luma with a gentle stretch, so paper reads white. */
function gray(d: Uint8ClampedArray, flat: Float32Array, n: number): void {
  // Paper is ~97% of a page, so the stretch has to be driven by its own spread:
  // a 95th percentile lands mid-paper and leaves the page at a dull grey.
  const lo = percentile(flat, 0.005)
  const hi = percentile(flat, 0.99)
  const span = Math.max(32, hi - lo)
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const v = ((flat[p] - lo) * 255) / span
    d[i] = d[i + 1] = d[i + 2] = v
  }
}

/**
 * B&W: Sauvola local threshold. A pixel is ink when it is clearly darker than
 * its own neighbourhood, not darker than one number chosen for the whole photo —
 * that single number is why a shadowed page used to turn into a black blob.
 */
function bw(d: Uint8ClampedArray, flat: Float32Array, w: number, h: number): void {
  const n = w * h
  const r = Math.max(6, Math.round(Math.min(w, h) / 60))
  const mean = boxMean(flat, w, h, r)
  const sq = new Float32Array(n)
  for (let p = 0; p < n; p++) sq[p] = flat[p] * flat[p]
  const meanSq = boxMean(sq, w, h, r)

  const k = 0.22
  const out = new Uint8Array(n)
  for (let p = 0; p < n; p++) {
    const m = mean[p]
    const sd = Math.sqrt(Math.max(0, meanSq[p] - m * m))
    const t = m * (1 + k * (sd / 128 - 1))
    out[p] = flat[p] < t - 6 ? 1 : 0
  }
  despeckle(out, w, h)
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const v = out[p] ? 0 : 255
    d[i] = d[i + 1] = d[i + 2] = v
  }
}

/**
 * Enhance: the same flattening on the colour image (one gain for all three
 * channels, so hue survives), then a percentile stretch and a mild gray-world
 * pull. Removes the dull, yellow, uneven look of an indoor phone photo.
 */
function enhance(d: Uint8ClampedArray, luma: Float32Array, bg: Float32Array, flat: Float32Array, n: number): void {
  const lo = percentile(flat, 0.01)
  const hi = percentile(flat, 0.99)
  const span = Math.max(16, hi - lo)
  const gain = new Float32Array(n)
  for (let p = 0; p < n; p++) gain[p] = 255 / Math.max(1, bg[p])

  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const g = gain[p]
    for (let c = 0; c < 3; c++) d[i + c] = ((d[i + c] * g - lo) * 255) / span
  }
  // Gray-world, half strength: lamps make paper yellow, and paper is neutral.
  const mean = [0, 0, 0]
  for (let i = 0; i < d.length; i += 4) {
    mean[0] += d[i]
    mean[1] += d[i + 1]
    mean[2] += d[i + 2]
  }
  const target = (mean[0] + mean[1] + mean[2]) / (3 * n)
  if (target < 1) return
  const k = mean.map((m) => 1 + (target / Math.max(1, m / n) - 1) * 0.5)
  for (let i = 0; i < d.length; i += 4) {
    d[i] = d[i] * k[0]
    d[i + 1] = d[i + 1] * k[1]
    d[i + 2] = d[i + 2] * k[2]
  }
}

/** Remove isolated pixels: one stray dot is a sensor artefact, not ink. */
function despeckle(m: Uint8Array, w: number, h: number): void {
  const copy = m.slice()
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      let on = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (copy[i + dy * w + dx]) on++
      if (copy[i] && on <= 2) m[i] = 0
      else if (!copy[i] && on >= 8) m[i] = 1
    }
  }
}

function percentile(a: Float32Array, q: number): number {
  const hist = new Uint32Array(256)
  for (let i = 0; i < a.length; i++) hist[Math.min(255, Math.max(0, a[i] | 0))]++
  const cut = Math.max(1, Math.floor(a.length * q))
  let acc = 0
  for (let v = 0; v < 256; v++) {
    acc += hist[v]
    if (acc >= cut) return v
  }
  return 255
}

/**
 * Separable max filter, centred window of radius r, monotonic deque: O(1) per
 * pixel regardless of radius, which is what lets r scale with the image.
 */
function maxFilter(a: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)
  const dq = new Int32Array(Math.max(w, h) + 1)
  for (let y = 0; y < h; y++) {
    const row = y * w
    let head = 0
    let tail = 0
    for (let i = 0; i <= r && i < w; i++) {
      while (tail > head && a[row + dq[tail - 1]] <= a[row + i]) tail--
      dq[tail++] = i
    }
    for (let x = 0; x < w; x++) {
      while (head < tail && dq[head] < x - r) head++
      tmp[row + x] = a[row + dq[head]]
      const add = x + r + 1
      if (add < w) {
        while (tail > head && a[row + dq[tail - 1]] <= a[row + add]) tail--
        dq[tail++] = add
      }
    }
  }
  for (let x = 0; x < w; x++) {
    let head = 0
    let tail = 0
    for (let i = 0; i <= r && i < h; i++) {
      while (tail > head && tmp[dq[tail - 1] * w + x] <= tmp[i * w + x]) tail--
      dq[tail++] = i
    }
    for (let y = 0; y < h; y++) {
      while (head < tail && dq[head] < y - r) head++
      out[y * w + x] = tmp[dq[head] * w + x]
      const add = y + r + 1
      if (add < h) {
        while (tail > head && tmp[dq[tail - 1] * w + x] <= tmp[add * w + x]) tail--
        dq[tail++] = add
      }
    }
  }
  return out
}

/** Separable box mean, centred window of radius r, clipped at the edges. */
function boxMean(a: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const row = y * w
    let sum = 0
    const first = Math.min(w - 1, r)
    for (let i = 0; i <= first; i++) sum += a[row + i]
    for (let x = 0; x < w; x++) {
      const lo = Math.max(0, x - r)
      const hi = Math.min(w - 1, x + r)
      tmp[row + x] = sum / (hi - lo + 1)
      // Slide: drop x-r, add x+r+1.
      if (x - r >= 0) sum -= a[row + x - r]
      if (x + r + 1 < w) sum += a[row + x + r + 1]
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0
    const first = Math.min(h - 1, r)
    for (let i = 0; i <= first; i++) sum += tmp[i * w + x]
    for (let y = 0; y < h; y++) {
      const lo = Math.max(0, y - r)
      const hi = Math.min(h - 1, y + r)
      out[y * w + x] = sum / (hi - lo + 1)
      if (y - r >= 0) sum -= tmp[(y - r) * w + x]
      if (y + r + 1 < h) sum += tmp[(y + r + 1) * w + x]
    }
  }
  return out
}
