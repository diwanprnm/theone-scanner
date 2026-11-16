// Measure the filters against the CamScanner reference page.
//
// The reference is already the target look: white paper, black ink. To get a
// realistic input we degrade it into a phone photo (lamp falloff, warm cast,
// slight blur, sensor noise), run each filter, and score ink recovery and paper
// whiteness against the reference itself.
//
// Needs the dev server (it imports the TS module straight from /src).
import fs from 'node:fs'

const REF = 'C:/Users/asraf/AppData/Local/Temp/scanner-acc/ref/p1.jpg'

export default async function run(page) {
  const b64 = fs.readFileSync(REF).toString('base64')

  const results = await page.evaluate(async (b64) => {
    const { applyFilter } = await import('/src/lib/filters.ts')

    const load = (src) =>
      new Promise((res) => {
        const img = new Image()
        img.onload = () => res(img)
        img.src = src
      })
    const ref = await load('data:image/jpeg;base64,' + b64)

    const W = 760
    const H = Math.round((ref.height / ref.width) * W)
    const canvas = (w, h) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      return c
    }

    const base = canvas(W, H)
    const bx = base.getContext('2d', { willReadFrequently: true })
    bx.drawImage(ref, 0, 0, W, H)
    const refData = bx.getImageData(0, 0, W, H).data

    const lumaOf = (data, p) => {
      const i = p * 4
      return (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000
    }
    // The reference is the ground truth: its ink is whatever reads dark.
    const refInk = new Uint8Array(W * H)
    for (let p = 0; p < W * H; p++) refInk[p] = lumaOf(refData, p) < 110 ? 1 : 0

    // Degrade into a phone photo: lamp at top-left, warm cast, noise.
    const photo = canvas(W, H)
    const px = photo.getContext('2d', { willReadFrequently: true })
    const d = new Uint8ClampedArray(refData)
    let seed = 7
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4
        const t = Math.min(1, Math.hypot(x / W - 0.15, y / H - 0.1) * 1.15)
        const gain = 1 - 0.62 * t
        d[i] = d[i] * gain * 1.04 + 10
        d[i + 1] = d[i + 1] * gain
        d[i + 2] = d[i + 2] * gain * 0.9
        const n = (rnd() - 0.5) * 12
        d[i] += n
        d[i + 1] += n
        d[i + 2] += n
      }
    }
    px.putImageData(new ImageData(d, W, H), 0, 0)
    const blurred = canvas(W, H)
    const cx = blurred.getContext('2d', { willReadFrequently: true })
    cx.filter = 'blur(0.6px)'
    cx.drawImage(photo, 0, 0)
    cx.filter = 'none'

    const score = (data) => {
      let hit = 0
      let inkN = 0
      let falseInk = 0
      let paper = 0
      let paperN = 0
      // Paper flatness across a 6x8 grid: a shadowed page has a wide spread even
      // where there is no ink, and that spread is exactly what looks "messy".
      const grid = Array.from({ length: 6 * 8 }, () => [])
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const p = y * W + x
          const yv = lumaOf(data, p)
          if (refInk[p]) {
            inkN++
            if (yv < 110) hit++
          } else {
            paper += yv
            paperN++
            if (yv < 110) falseInk++
            grid[Math.min(7, Math.floor((y / H) * 8)) * 6 + Math.min(5, Math.floor((x / W) * 6))].push(yv)
          }
        }
      }
      const means = grid.filter((g) => g.length).map((g) => g.reduce((a, b) => a + b, 0) / g.length)
      const avg = means.reduce((a, b) => a + b, 0) / means.length
      const sd = Math.sqrt(means.reduce((a, m) => a + (m - avg) ** 2, 0) / means.length)
      return {
        inkRecall: +((hit / Math.max(1, inkN)) * 100).toFixed(1),
        falseInk: +((falseInk / Math.max(1, paperN)) * 100).toFixed(2),
        paperWhite: +(paper / Math.max(1, paperN)).toFixed(1),
        paperEvenness: +(100 - sd).toFixed(1),
      }
    }

    const out = {}
    const panels = []
    for (const f of ['original', 'gray', 'bw', 'enhance']) {
      const c = canvas(W, H)
      const g = c.getContext('2d', { willReadFrequently: true })
      g.drawImage(blurred, 0, 0)
      const t0 = performance.now()
      applyFilter(g, f)
      const ms = performance.now() - t0
      out[f] = { ...score(g.getImageData(0, 0, W, H).data), ms: +ms.toFixed(0) }
      panels.push({ label: f, c })
    }
    out.__ref = score(refData)
    out.__input = score(cx.getImageData(0, 0, W, H).data)
    out.__size = `${W}x${H}`

    // Side-by-side sheet for the eye as well as the numbers: 2 wide so the
    // screenshot fits, at half scale so the whole page is visible.
    const cols = 2
    const s = 0.55
    const tw = Math.round(W * s)
    const th = Math.round(H * s)
    const rows = Math.ceil((panels.length + 1) / cols)
    const strip = canvas(tw * cols, th * rows)
    const sx = strip.getContext('2d')
    sx.fillStyle = '#111'
    sx.fillRect(0, 0, strip.width, strip.height)
    ;[{ label: 'input', c: blurred }, ...panels].forEach(({ label, c }, i) => {
      const x = (i % cols) * tw
      const y = Math.floor(i / cols) * th
      sx.drawImage(c, x, y, tw, th)
      sx.fillStyle = 'rgba(0,0,0,.7)'
      sx.fillRect(x, y, tw, 26)
      sx.fillStyle = '#fff'
      sx.font = 'bold 18px sans-serif'
      sx.fillText(label, x + 10, y + 19)
    })
    document.body.appendChild(strip)
    strip.style.cssText = `position:fixed;left:0;top:0;z-index:9999;width:${tw * cols}px`
    return { out, size: { w: tw * cols, h: th * rows } }
  }, b64)

  await page.setViewportSize({ width: results.size.w, height: results.size.h })
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'qa/14-filters.png' })
  return results.out
}
