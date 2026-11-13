import type { Halaman } from './types'
import { renderPage } from './render'
import { toBlob } from './source'

const A4_W = 595.28
const A4_H = 841.89

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

export function defaultName(base = 'scan'): string {
  return `${base}-${stamp()}`
}

/** One PDF, one A4 page per Halaman, image fitted inside with no margin. Orientation follows the image. */
export async function buildPdf(pages: Halaman[], title: string): Promise<Blob> {
  // Lazy: pdf-lib is ~350KB and only needed on export, so it stays out of the first load.
  const { PDFDocument } = await import('pdf-lib')
  const pdf = await PDFDocument.create()
  pdf.setTitle(title)
  pdf.setCreator('Theonescan')
  for (const page of pages) {
    const canvas = await renderPage(page)
    const bytes = await toBlob(canvas, 'image/jpeg', 0.92).then((b) => b.arrayBuffer())
    const img = await pdf.embedJpg(bytes)
    const landscape = img.width > img.height
    const W = landscape ? A4_H : A4_W
    const H = landscape ? A4_W : A4_H
    const p = pdf.addPage([W, H])
    const s = Math.min(W / img.width, H / img.height)
    const w = img.width * s
    const h = img.height * s
    p.drawImage(img, { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h })
  }
  const out = await pdf.save()
  return new Blob([out as unknown as BlobPart], { type: 'application/pdf' })
}

export async function buildImages(pages: Halaman[], type: 'image/jpeg' | 'image/png'): Promise<File[]> {
  const ext = type === 'image/png' ? 'png' : 'jpg'
  const files: File[] = []
  for (let i = 0; i < pages.length; i++) {
    const canvas = await renderPage(pages[i])
    const blob = await toBlob(canvas, type, type === 'image/jpeg' ? 0.92 : undefined)
    files.push(new File([blob], `halaman-${i + 1}.${ext}`, { type }))
  }
  return files
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}