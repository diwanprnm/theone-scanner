// Crop accuracy on a realistic page: take the reference page, project it onto a
// dark desk at a known quad (perspective, torn edge, spiral binding, shadow,
// noise, blur), then check what detectQuad returns against that known quad.
//
// Needs the dev server: it imports the TS module straight from /src.
import fs from 'node:fs'

const REF = 'C:/Users/asraf/AppData/Local/Temp/scanner-acc/ref/p1.jpg'

export default async function run(page) {
  const b64 = fs.readFileSync(REF).toString('base64')

  return page.evaluate(async (b64) => {
    const { detectQuad } = await import('/src/lib/detect.ts')

    // Generic 4-point homography: maps from[] onto to[]. warp.ts only exposes
    // unit-square -> quad, and this fixture needs frame-quad -> sheet rect.
    const homography = (from, to) => {
      const A = []
      const b = []
      for (let i = 0; i < 4; i++) {
        const { x: u, y: v } = from[i]
        const { x, y } = to[i]
        A.push([u, v, 1, 0, 0, 0, -u * x, -v * x])
        b.push(x)
        A.push([0, 0, 0, u, v, 1, -u * y, -v * y])
        b.push(y)
      }
      const M = A.map((r, i) => [...r, b[i]])
      for (let col = 0; col < 8; col++) {
        let piv = col
        for (let r = col + 1; r < 8; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r
        ;[M[col], M[piv]] = [M[piv], M[col]]
        if (Math.abs(M[col][col]) < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0]
        for (let r = col + 1; r < 8; r++) {
          const f = M[r][col] / M[col][col]
          if (!f) continue
          for (let k = col; k <= 8; k++) M[r][k] -= f * M[col][k]
        }
      }
      const x = new Array(8).fill(0)
      for (let r = 7; r >= 0; r--) {
        let s = M[r][8]
        for (let k = r + 1; k < 8; k++) s -= M[r][k] * x[k]
        x[r] = s / M[r][r]
      }
      return x
    }

    const load = (src) =>
      new Promise((res) => {
        const img = new Image()
        img.onload = () => res(img)
        img.src = src
      })
    const sheet = await load('data:image/jpeg;base64,' + b64)

    const W = 900
    const H = 1200
    const canvas = (w, h) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      return c
    }

    // Known quads, as fractions of the frame. 'fill' is the hard one: the page
    // covers most of the shot, which is how people actually photograph a page.
    // 'light-desk' is the other real failure: white paper on a pale table, so
    // the border is a 20-level step, not a 150-level one.
    const CASES = [
      { name: 'tilted', q: [[0.13, 0.09], [0.88, 0.14], [0.85, 0.9], [0.1, 0.86]] },
      { name: 'fill', q: [[0.03, 0.02], [0.97, 0.05], [0.96, 0.97], [0.02, 0.94]] },
      { name: 'skew', q: [[0.22, 0.04], [0.95, 0.2], [0.78, 0.97], [0.06, 0.8]] },
      { name: 'dark-paper', q: [[0.12, 0.08], [0.9, 0.12], [0.87, 0.92], [0.09, 0.88]], dark: true },
      {
        name: 'light-desk',
        q: [[0.08, 0.06], [0.94, 0.1], [0.91, 0.95], [0.05, 0.9]],
        desk: ['#c9bfae', '#9d9483'],
      },
      // Spiral binding: the left edge is loops, not a line.
      { name: 'spiral', q: [[0.14, 0.07], [0.92, 0.1], [0.89, 0.94], [0.11, 0.91]], spiral: true },
      // A hard shadow across the middle of the sheet.
      { name: 'shadow', q: [[0.1, 0.07], [0.91, 0.11], [0.88, 0.93], [0.07, 0.89]], shadow: true },
      // The worst real one: the page fills the frame and the desk is pale, so
      // there is almost no border left to find.
      {
        name: 'fill-light',
        q: [[0.02, 0.015], [0.98, 0.04], [0.97, 0.985], [0.015, 0.96]],
        desk: ['#c9bfae', '#9d9483'],
      },
      // Nothing to crop: an empty desk must come back as null, not as a guess.
      { name: 'empty', q: null, empty: true },
    ]

    const results = []
    for (const c of CASES) {
      const q = (c.q ?? []).map(([x, y]) => ({ x: x * W, y: y * H }))
      const photo = canvas(W, H)
      const px = photo.getContext('2d', { willReadFrequently: true })

      // Desk: dark wood-ish, with a vignette so it is not a flat fill.
      const dg = px.createRadialGradient(W * 0.5, H * 0.4, W * 0.2, W * 0.5, H * 0.5, W * 0.9)
      const desk = c.desk ?? ['#4a3f36', '#241c17']
      dg.addColorStop(0, desk[0])
      dg.addColorStop(1, desk[1])
      px.fillStyle = dg
      px.fillRect(0, 0, W, H)
      if (c.empty) {
        // No sheet at all: the detector must say so instead of inventing one.
        const final = canvas(W, H)
        final.getContext('2d').drawImage(photo, 0, 0)
        const bmp = await createImageBitmap(final)
        const got = detectQuad(bmp)
        bmp.close()
        results.push({ name: c.name, found: !!got, errPx: null, errPct: null, ms: 0 })
        continue
      }

      // Project the page into the quad with the same homography the app uses.
      const src = [
        { x: 0, y: 0 },
        { x: sheet.width, y: 0 },
        { x: sheet.width, y: sheet.height },
        { x: 0, y: sheet.height },
      ]
      // Inverse mapping: frame pixel -> sheet pixel, so the page lands in the quad.
      const H8 = homography(q, src)
      const tmp = canvas(W, H)
      const tx = tmp.getContext('2d', { willReadFrequently: true })
      const out = tx.createImageData(W, H)
      const sc = canvas(sheet.width, sheet.height)
      sc.getContext('2d', { willReadFrequently: true }).drawImage(sheet, 0, 0)
      const sd = sc.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, sheet.width, sheet.height).data
      const od = out.data
      const [a, b, cc, d, e, f, g, h] = H8
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const den = g * x + h * y + 1
          if (Math.abs(den) < 1e-9) continue
          const sx = ((a * x + b * y + cc) / den) | 0
          const sy = ((d * x + e * y + f) / den) | 0
          if (sx < 0 || sy < 0 || sx >= sheet.width || sy >= sheet.height) continue
          const si = (sy * sheet.width + sx) * 4
          const oi = (y * W + x) * 4
          od[oi] = sd[si]
          od[oi + 1] = sd[si + 1]
          od[oi + 2] = sd[si + 2]
          od[oi + 3] = 255
        }
      }
      tx.putImageData(out, 0, 0)
      px.drawImage(tmp, 0, 0)

      // Spiral binding: dark loops straddling the left edge, so the mask's
      // left boundary is scalloped rather than straight.
      if (c.spiral) {
        const [l0, l1] = [q[0], q[3]]
        px.fillStyle = '#2a2a2e'
        for (let i = 0; i < 14; i++) {
          const t = (i + 0.5) / 14
          const cx = l0.x + (l1.x - l0.x) * t
          const cy = l0.y + (l1.y - l0.y) * t
          px.beginPath()
          px.arc(cx, cy, 13, 0, Math.PI * 2)
          px.fill()
        }
      }

      // Lighting: a lamp at the top-left plus a hard shadow across the bottom.
      const img = px.getImageData(0, 0, W, H)
      const dd = img.data
      let seed = 11
      const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4
          const t = Math.min(1, Math.hypot(x / W - 0.2, y / H - 0.15) * 1.1)
          let gain = 1 - 0.5 * t
          // A hand shadow: a soft band across the lower third.
          const band = Math.exp(-((y / H - 0.72) ** 2) / 0.006) * 0.32
          gain *= 1 - band
          // A hard-edged shadow: the phone or the hand covers a slab of the page
          // with a step, not a gradient. This is what breaks a global threshold.
          if (c.shadow && y / H > 0.42 && y / H < 0.78 && x / W > 0.25) gain *= 0.55
          dd[i] *= gain
          dd[i + 1] *= gain
          dd[i + 2] *= gain * 0.97
          const nz = (rnd() - 0.5) * 14
          dd[i] += nz
          dd[i + 1] += nz
          dd[i + 2] += nz
          // A dark card on a lit desk: invert the whole scene, so the detector
          // has to take the inverted pass rather than the bright pass.
          if (c.dark) {
            dd[i] = 255 - dd[i]
            dd[i + 1] = 255 - dd[i + 1]
            dd[i + 2] = 255 - dd[i + 2]
          }
        }
      }
      px.putImageData(img, 0, 0)

      // Camera blur.
      const final = canvas(W, H)
      const fx = final.getContext('2d', { willReadFrequently: true })
      fx.filter = 'blur(0.7px)'
      fx.drawImage(photo, 0, 0)
      fx.filter = 'none'

      const bmp = await createImageBitmap(final)
      const t0 = performance.now()
      const got = detectQuad(bmp)
      const ms = performance.now() - t0
      bmp.close()

      const err = got
        ? Math.max(...got.map((p, i) => Math.hypot(p.x - q[i].x, p.y - q[i].y)))
        : null
      results.push({
        name: c.name,
        found: !!got,
        errPx: err === null ? null : +err.toFixed(1),
        errPct: err === null ? null : +((err / Math.max(W, H)) * 100).toFixed(2),
        ms: +ms.toFixed(0),
      })

      // Keep the last frame for the eye, with the found quad drawn on it.
      if (c.name === 'fill') {
        const g2 = final.getContext('2d')
        g2.lineWidth = 4
        g2.strokeStyle = '#00e0ff'
        g2.beginPath()
        if (got) {
          got.forEach((p, i) => (i ? g2.lineTo(p.x, p.y) : g2.moveTo(p.x, p.y)))
          g2.closePath()
        }
        g2.stroke()
        g2.strokeStyle = '#ff3b30'
        g2.beginPath()
        q.forEach((p, i) => (i ? g2.lineTo(p.x, p.y) : g2.moveTo(p.x, p.y)))
        g2.closePath()
        g2.stroke()
        final.id = 'dbg'
        final.style.cssText = 'position:fixed;left:0;top:0;z-index:9999;width:900px'
        document.body.appendChild(final)
      }
    }
    return results
  }, b64)
}
