import type { Halaman } from './types'
import { applyFilter } from './filters'
import { decode, normalizeSource } from './source'
import { targetSize, warpToCanvas } from './warp'

/** Cache of decoded Tangkapan bitmaps, keyed by Halaman id. */
const bitmapCache = new Map<string, Promise<ImageBitmap>>()

function getBitmap(page: Halaman): Promise<ImageBitmap> {
  let p = bitmapCache.get(page.id)
  if (!p) {
    p = decode(page.src)
    bitmapCache.set(page.id, p)
  }
  return p
}

export function dropBitmap(id: string): void {
  bitmapCache.get(id)?.then((b) => b.close()).catch(() => {})
  bitmapCache.delete(id)
}

/**
 * Render one Halaman at full source resolution: warp the Potong out of the
 * Tangkapan, rotate, then apply the Filter. This is what gets exported.
 */
export async function renderPage(page: Halaman): Promise<HTMLCanvasElement> {
  const bitmap = await getBitmap(page)
  const out = targetSize(page.crop, Math.max(bitmap.width, bitmap.height))
  const warped = warpToCanvas(bitmap, page.size, page.crop, out)
  const rotated = rotate(warped, page.rotation)
  applyFilter(rotated.getContext('2d', { willReadFrequently: true })!, page.filter)
  return rotated
}

/** Small JPEG used as the page strip thumbnail. */
export async function renderThumb(page: Halaman, maxEdge = 240): Promise<Blob> {
  const full = await renderPage(page)
  const scale = Math.min(1, maxEdge / Math.max(full.width, full.height))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(full.width * scale))
  c.height = Math.max(1, Math.round(full.height * scale))
  c.getContext('2d')!.drawImage(full, 0, 0, c.width, c.height)
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('Thumbnail gagal'))), 'image/jpeg', 0.8),
  )
}

function rotate(src: HTMLCanvasElement, deg: number): HTMLCanvasElement {
  const d = ((deg % 360) + 360) % 360
  if (d === 0) return src
  const swap = d === 90 || d === 270
  const c = document.createElement('canvas')
  c.width = swap ? src.height : src.width
  c.height = swap ? src.width : src.height
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.translate(c.width / 2, c.height / 2)
  ctx.rotate((d * Math.PI) / 180)
  ctx.drawImage(src, -src.width / 2, -src.height / 2)
  return c
}

export { normalizeSource }