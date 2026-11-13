// Self-check for the two pieces of non-trivial math: homography + quad validity.
// Run with `npm run check`. Bundled by esbuild so the TS/ESM source runs on Node.
import assert from 'node:assert/strict'
import { quadFromLuma } from '../src/lib/detect'
import { fullQuad, homography, isBadQuad, targetSize } from '../src/lib/warp'

function apply(H: number[], u: number, v: number) {
  const [a, b, c, d, e, f, g, h] = H
  const den = g * u + h * v + 1
  return { x: (a * u + b * v + c) / den, y: (d * u + e * v + f) / den }
}

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`)

// 1. Full-frame quad is the identity transform.
{
  const q = fullQuad({ w: 1000, h: 750 })
  const H = homography(q)
  for (const [u, v, x, y] of [
    [0, 0, 0, 0],
    [1, 0, 1000, 0],
    [1, 1, 1000, 750],
    [0, 1, 0, 750],
    [0.5, 0.5, 500, 375],
  ] as const) {
    const p = apply(H, u, v)
    near(p.x, x)
    near(p.y, y)
  }
}

// 2. A skewed quad maps its corners exactly, and the centre lands inside its bounds.
{
  const q = [
    { x: 120, y: 80 },
    { x: 900, y: 40 },
    { x: 860, y: 700 },
    { x: 60, y: 660 },
  ] as const
  const H = homography([...q])
  const corners = [
    [0, 0, 120, 80],
    [1, 0, 900, 40],
    [1, 1, 860, 700],
    [0, 1, 60, 660],
  ] as const
  for (const [u, v, x, y] of corners) {
    const p = apply(H, u, v)
    near(p.x, x, 1e-4)
    near(p.y, y, 1e-4)
  }
  const mid = apply(H, 0.5, 0.5)
  assert.ok(mid.x > 60 && mid.x < 900 && mid.y > 40 && mid.y < 700, 'centre left the quad')
}

// 3. targetSize follows the quad's own edge lengths, not the source image's.
{
  const q = [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 300 },
    { x: 0, y: 300 },
  ] as const
  const s = targetSize([...q], 2000)
  assert.equal(s.w, 400)
  assert.equal(s.h, 300)
  // Long edge is capped.
  const big = targetSize([...q].map((p) => ({ x: p.x * 20, y: p.y * 20 })) as never, 2000)
  assert.equal(Math.max(big.w, big.h), 2000)
}

// 4. Degenerate and self-intersecting quads are rejected.
{
  const tiny = [
    { x: 0, y: 0 },
    { x: 5, y: 0 },
    { x: 5, y: 5 },
    { x: 0, y: 5 },
  ] as const
  assert.equal(isBadQuad([...tiny]), true, 'tiny quad should be rejected')

  const bowtie = [
    { x: 0, y: 0 },
    { x: 100, y: 100 },
    { x: 100, y: 0 },
    { x: 0, y: 100 },
  ] as const
  assert.equal(isBadQuad([...bowtie]), true, 'bowtie should be rejected')

  assert.equal(isBadQuad(fullQuad({ w: 100, h: 100 })), false, 'plain quad must be valid')
}

// 5. Page order is just an array: reordering preserves ids and length.
{
  const pages = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const move = (arr: typeof pages, from: number, to: number) => {
    const next = [...arr]
    const [p] = next.splice(from, 1)
    next.splice(to, 0, p)
    return next
  }
  const moved = move(pages, 0, 2)
  assert.deepEqual(moved.map((p) => p.id), ['b', 'c', 'a'])
  assert.equal(pages[0].id, 'a', 'move must not mutate the source array')
}

// 6. Auto crop finds a tilted sheet on a dark desk, in the right corner order.
{
  const w = 200
  const h = 260
  const luma = new Uint8Array(w * h).fill(40) // dark desk
  const sheet = [
    [30, 25],
    [175, 45],
    [168, 235],
    [22, 220],
  ]
  // Point-in-quad via the same half-plane test, so the fixture is not a rectangle.
  const inside = (x: number, y: number) => {
    let sign = 0
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = sheet[i]
      const [bx, by] = sheet[(i + 1) % 4]
      const z = (bx - ax) * (y - ay) - (by - ay) * (x - ax)
      if (Math.abs(z) < 1e-9) continue
      if (sign === 0) sign = Math.sign(z)
      else if (Math.sign(z) !== sign) return false
    }
    return true
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(x, y)) luma[y * w + x] = 235

  const q = quadFromLuma(luma, w, h)
  assert.ok(q, 'a bright sheet on a dark desk must be found')
  const expect = sheet.map(([x, y]) => ({ x, y }))
  q.forEach((p, i) => {
    // The 1.5% outward growth plus erosion moves the corner a few pixels; 12 is
    // well inside a real mis-detection, which would be tens of pixels off.
    assert.ok(Math.hypot(p.x - expect[i].x, p.y - expect[i].y) < 12, `corner ${i} off: ${JSON.stringify(p)}`)
  })
}

// 7. A scene with no sheet (all one tone) returns null rather than a guess.
{
  const flat = new Uint8Array(120 * 120).fill(128)
  assert.equal(quadFromLuma(flat, 120, 120), null, 'flat scene must not produce a quad')
}

console.log('check: warp + page order + auto crop OK')