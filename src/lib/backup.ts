import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate'
import type { Dokumen, Halaman } from './types'
import { dumpAll, putDoc, putPage } from './db'

/**
 * Backup format: one zip, `backup.json` manifest plus `pages/<id>.jpg` for every Blob.
 * Version is bumped only when the manifest shape changes incompatibly.
 */
interface Manifest {
  version: 1
  docs: Dokumen[]
  pages: Omit<Halaman, 'src'>[]
}

export async function createBackup(): Promise<Blob> {
  const { docs, pages } = await dumpAll()
  const files: Record<string, Uint8Array> = {}
  const manifest: Manifest = { version: 1, docs, pages: [] }
  for (const p of pages) {
    const { src, ...meta } = p
    manifest.pages.push(meta)
    files[`pages/${p.id}.jpg`] = new Uint8Array(await src.arrayBuffer())
  }
  files['backup.json'] = strToU8(JSON.stringify(manifest))
  return new Blob([zipSync(files, { level: 0 }) as unknown as BlobPart], { type: 'application/zip' })
}

export interface ImportResult {
  docs: number
  pages: number
}

/** Merge a Backup into the library, replacing any Dokumen with the same id. */
export async function importBackup(file: File): Promise<ImportResult> {
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()))
  const raw = zip['backup.json']
  if (!raw) throw new Error('File bukan backup Theonescan')
  const manifest = JSON.parse(strFromU8(raw)) as Manifest
  if (manifest.version !== 1) throw new Error('Versi backup tidak didukung')

  for (const meta of manifest.pages) {
    const bytes = zip[`pages/${meta.id}.jpg`]
    if (!bytes) continue
    const page: Halaman = { ...meta, src: new Blob([bytes.slice().buffer], { type: 'image/jpeg' }) }
    await putPage(page)
  }
  for (const doc of manifest.docs) await putDoc(doc)
  return { docs: manifest.docs.length, pages: manifest.pages.length }
}