import { openDB, type IDBPDatabase } from 'idb'
import type { Dokumen, Halaman } from './types'

/**
 * Storage: one IndexedDB database, two object stores.
 * `docs` holds metadata only (small, read on every list render);
 * `pages` holds Halaman records including the source Blob.
 * Splitting them keeps the library list fast when a Dokumen has 50 pages.
 */
interface Schema {
  docs: Dokumen
  pages: Halaman
}

const DB_NAME = 'theonescan'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null

function db(): Promise<IDBPDatabase<Schema>> {
  dbPromise ??= openDB<Schema>(DB_NAME, DB_VERSION, {
    upgrade(d) {
      d.createObjectStore('docs', { keyPath: 'id' })
      d.createObjectStore('pages', { keyPath: 'id' })
    },
  })
  return dbPromise
}

export async function listDocs(): Promise<Dokumen[]> {
  const all = await (await db()).getAll('docs')
  return all.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getDoc(id: string): Promise<Dokumen | undefined> {
  return (await db()).get('docs', id)
}

export async function getPage(id: string): Promise<Halaman | undefined> {
  return (await db()).get('pages', id)
}

export async function getPages(doc: Dokumen): Promise<Halaman[]> {
  const d = await db()
  const pages = await Promise.all(doc.pages.map((pid) => d.get('pages', pid)))
  return pages.filter((p): p is Halaman => !!p)
}

export async function putDoc(doc: Dokumen): Promise<void> {
  await (await db()).put('docs', doc)
}

export async function putPage(page: Halaman): Promise<void> {
  await (await db()).put('pages', page)
}

export async function deletePage(pageId: string): Promise<void> {
  await (await db()).delete('pages', pageId)
}

/** Delete a Dokumen and every Halaman Blob it owns. */
export async function deleteDoc(id: string): Promise<void> {
  const d = await db()
  const doc = await d.get('docs', id)
  if (!doc) return
  const tx = d.transaction(['docs', 'pages'], 'readwrite')
  const pagesStore = tx.objectStore('pages')
  await Promise.all(doc.pages.map((pid: string) => pagesStore.delete(pid)))
  await tx.objectStore('docs').delete(id)
  await tx.done
}

export async function storageEstimate(): Promise<{ used: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null
  const { usage = 0, quota = 0 } = await navigator.storage.estimate()
  return { used: usage, quota }
}

/** Ask the browser to keep this data; no-op where unsupported. */
export async function requestPersistence(): Promise<void> {
  try {
    await navigator.storage?.persist?.()
  } catch {
    // Storage stays best-effort; the Backup export is the real safety net.
  }
}

/** Live snapshot of every Dokumen + Halaman, for Backup and import. */
export async function dumpAll(): Promise<{ docs: Dokumen[]; pages: Halaman[] }> {
  const d = await db()
  const [docs, pages] = await Promise.all([d.getAll('docs'), d.getAll('pages')])
  return { docs, pages }
}