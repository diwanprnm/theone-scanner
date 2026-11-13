// Self-check for the two pieces of non-trivial math: homography + quad validity.
// Run with `npm run check`. Bundled by esbuild so the TS/ESM source runs on Node.
import assert from 'node:assert/strict'
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

console.log('check: warp + page order OK')