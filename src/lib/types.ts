// Domain types. See GLOSSARY.md — Dokumen -> Halaman -> Tangkapan -> Potong.

export type FilterName = 'original' | 'gray' | 'bw' | 'enhance'

/** Point in Tangkapan pixel coordinates. */
export interface Pt {
  x: number
  y: number
}

/** Corner order is fixed: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Pt, Pt, Pt, Pt]

export interface Size {
  w: number
  h: number
}

export interface Halaman {
  id: string
  /** Source Tangkapan dimensions. */
  size: Size
  /** Blob of the source Tangkapan (JPEG, max 2000px long edge). */
  src: Blob
  crop: Quad
  filter: FilterName
  /** 0 | 90 | 180 | 270, applied after warp, before filter. */
  rotation: number
}

export interface Dokumen {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  /** Ordered Halaman ids — order defines PDF page order. */
  pages: string[]
}

export const MAX_PAGES = 50
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
export const MAX_DIM = 2000
export const JPEG_QUALITY = 0.92