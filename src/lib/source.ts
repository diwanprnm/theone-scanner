import { detectQuad } from './detect'
import { JPEG_QUALITY, MAX_DIM, type Halaman, type Quad, type Size } from './types'
import { fullQuad } from './warp'

/** Downscale a decoded image to MAX_DIM long edge and encode as JPEG. */
export async function normalizeSource(bitmap: ImageBitmap): Promise<{ blob: Blob; size: Size }> {
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  const blob = await toBlob(canvas, 'image/jpeg', JPEG_QUALITY)
  return { blob, size: { w, h } }
}

export function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encode gagal'))), type, quality),
  )
}

export async function decode(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob, { imageOrientation: 'from-image' })
}

export function newHalaman(src: Blob, size: Size, crop: Quad = fullQuad(size)): Halaman {
  return {
    id: crypto.randomUUID(),
    size,
    src,
    crop,
    filter: 'original',
    rotation: 0,
  }
}

/**
 * Load an uploaded File into a Halaman, rejecting formats the browser cannot decode.
 * The crop is detected on the *stored* (downscaled) copy, so its coordinates are
 * in the same space as `size` — detecting on the original would land the quad
 * outside the image for any photo over 2000px.
 */
export async function halamanFromFile(file: File): Promise<Halaman> {
  const bitmap = await decode(file)
  try {
    const { blob, size } = await normalizeSource(bitmap)
    const small = await decode(blob)
    try {
      return newHalaman(blob, size, detectQuad(small) ?? fullQuad(size))
    } finally {
      small.close()
    }
  } finally {
    bitmap.close()
  }
}