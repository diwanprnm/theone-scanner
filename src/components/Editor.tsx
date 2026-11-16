import { useCallback, useEffect, useMemo, useState } from 'react'
import Capture from './Capture'
import CropEditor from './CropEditor'
import ExportPanel from './ExportPanel'
import PageStrip from './PageStrip'
import PageView from './PageView'
import Icon from './Icon'
import {
  deleteDoc,
  deletePage,
  getDoc,
  getPages,
  putDoc,
  putPage,
  requestPersistence,
} from '../lib/db'
import { dropBitmap } from '../lib/render'
import { defaultName } from '../lib/export'
import type { Dokumen, Halaman, Quad } from '../lib/types'

interface Props {
  id: string
  onBack: () => void
}

type Mode = 'view' | 'capture' | 'crop' | 'export'

export default function Editor({ id, onBack }: Props) {
  const [doc, setDoc] = useState<Dokumen | null>(null)
  const [pages, setPages] = useState<Halaman[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('view')
  const [toast, setToast] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let dead = false
    void requestPersistence()
    ;(async () => {
      if (id === 'new') {
        const fresh: Dokumen = {
          id: crypto.randomUUID(),
          name: defaultName(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          pages: [],
        }
        await putDoc(fresh)
        if (dead) return
        // Replace the URL without adding a history entry: the new id is canonical.
        history.replaceState(null, '', `#/doc/${fresh.id}`)
        setDoc(fresh)
        setMode('capture')
        return
      }
      const d = await getDoc(id)
      if (!d) {
        if (!dead) setNotFound(true)
        return
      }
      const ps = await getPages(d)
      if (dead) return
      setDoc(d)
      setPages(ps)
      setActiveId(ps[0]?.id ?? null)
    })()
    return () => {
      dead = true
    }
  }, [id])

  const save = useCallback(
    async (next: Dokumen, nextPages: Halaman[]) => {
      const touched = { ...next, pages: nextPages.map((p) => p.id), updatedAt: Date.now() }
      setDoc(touched)
      setPages(nextPages)
      await putDoc(touched)
    },
    [],
  )

  const flash = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(null), 2500)
  }

  const addPages = async (added: Halaman[]) => {
    if (!doc) return
    for (const p of added) await putPage(p)
    const next = [...pages, ...added]
    setActiveId(added[added.length - 1]?.id ?? activeId)
    await save(doc, next)
    setMode('view')
    flash(`${added.length} halaman ditambahkan`)
  }

  const updatePage = async (patch: Partial<Halaman>) => {
    if (!doc || !activeId) return
    const next = pages.map((p) => (p.id === activeId ? { ...p, ...patch } : p))
    const changed = next.find((p) => p.id === activeId)!
    await putPage(changed)
    await save(doc, next)
  }

  const saveCrop = (crop: Quad) => {
    void updatePage({ crop })
    setMode('view')
  }

  const move = (from: number, to: number) => {
    if (!doc || to < 0 || to >= pages.length) return
    const next = [...pages]
    const [p] = next.splice(from, 1)
    next.splice(to, 0, p)
    void save(doc, next)
  }

  const remove = async (pageId: string) => {
    if (!doc) return
    if (!confirm('Hapus halaman ini?')) return
    const next = pages.filter((p) => p.id !== pageId)
    await deletePage(pageId)
    dropBitmap(pageId)
    setActiveId(next[0]?.id ?? null)
    if (next.length === 0) {
      await deleteDoc(doc.id)
      onBack()
      return
    }
    await save(doc, next)
  }

  // Header and export sheet share this; the Library list renames via putDoc itself.
  const rename = (name: string) => {
    if (!doc || name === doc.name) return
    void save({ ...doc, name }, pages)
    flash('Nama dokumen diubah')
  }

  const active = useMemo(() => pages.find((p) => p.id === activeId) ?? null, [pages, activeId])

  // Rename inline: a dialog for one field is more taps than the field itself.
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const startRename = () => {
    if (!doc) return
    setDraft(doc.name)
    setEditing(true)
  }

  const commitRename = async () => {
    setEditing(false)
    if (!doc) return
    const next = draft.trim().slice(0, 80)
    if (!next || next === doc.name) return
    rename(next)
  }

  if (notFound) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-5 text-center">
        <p className="text-[13px] text-ink-2">Dokumen tidak ditemukan (mungkin sudah dihapus).</p>
        <button onClick={onBack} className="bar-outline max-w-[220px]">
          Kembali
        </button>
      </div>
    )
  }

  if (!doc) return <div className="flex h-full items-center justify-center text-[13px] text-ink-2">Memuat…</div>

  if (mode === 'capture') {
    return (
      <Capture
        pageCount={pages.length}
        onExceed={() => flash('Maksimal 50 halaman')}
        onCancel={() => {
          setMode('view')
          if (pages.length === 0) {
            // Q23: a Dokumen with no Halaman is never kept.
            void deleteDoc(doc.id).then(onBack)
          }
        }}
        onPages={(added) => void addPages(added)}
      />
    )
  }

  if (mode === 'crop' && active) {
    return (
      <CropEditor
        page={active}
        pageIndex={pages.findIndex((p) => p.id === active.id)}
        onSave={saveCrop}
        onCancel={() => setMode('view')}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 px-4 pb-2 pt-4">
        <div className="flex items-center justify-between gap-3">
          <button onClick={onBack} className="link-action inline-flex shrink-0 items-center gap-1">
            <Icon name="left" size={11} />
            Kembali
          </button>
          <div className="min-w-0 flex-1 text-center">
            {editing ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => void commitRename()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void commitRename()
                  if (e.key === 'Escape') setEditing(false)
                }}
                maxLength={80}
                aria-label="Nama dokumen"
                className="w-full border-b border-ink bg-transparent pb-0.5 text-center text-[14px] font-medium leading-tight outline-none"
              />
            ) : (
              <button
                onClick={startRename}
                className="mx-auto flex max-w-full items-center gap-1.5"
                aria-label={`Ubah nama ${doc.name}`}
              >
                <span className="truncate text-[14px] font-medium leading-tight">{doc.name}</span>
                <Icon name="pencil" size={13} className="text-ink-2" />
              </button>
            )}
            <div className="num mt-0.5 text-[10px] text-ink-2">
              {String(pages.findIndex((p) => p.id === activeId) + 1).padStart(2, '0')} /{' '}
              {String(pages.length).padStart(2, '0')}
            </div>
          </div>
          <button
            disabled={pages.length === 0}
            onClick={() => setMode('export')}
            className="display inline-flex shrink-0 items-center gap-1.5 border border-ink px-2.5 py-1.5 text-[12px] text-ink active:bg-plate disabled:opacity-40"
          >
            <Icon name="export" size={12} />
            Ekspor
          </button>
        </div>
      </header>
      <div className="h-0.5 shrink-0 bg-ink" />

      {/* In the flow, right under the header rule: a floating toast either covered
          the action bar or the page strip, and 2,5 s of layout shift is cheaper. */}
      {toast && (
        <div className="shrink-0 border-b border-hair bg-plate px-4 py-1.5 text-center text-[12px] text-ink">
          {toast}
        </div>
      )}

      {pages.length > 0 && (
        <PageStrip
          pages={pages}
          activeId={activeId}
          onSelect={setActiveId}
          onMove={move}
          onDelete={(pid) => void remove(pid)}
          onAdd={() => setMode('capture')}
        />
      )}

      {active ? (
        <PageView
          page={active}
          onChange={(patch) => void updatePage(patch)}
          onCrop={() => setMode('crop')}
          onDelete={() => void remove(active.id)}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5">
          <p className="text-[13px] text-ink-2">Dokumen ini belum punya halaman.</p>
          <button onClick={() => setMode('capture')} className="bar-action max-w-[260px] gap-2">
            <Icon name="scan" size={15} />
            Scan halaman pertama
          </button>
        </div>
      )}

      {mode === 'export' && (
        <ExportPanel
          pages={pages}
          suggested={doc.name}
          onRename={rename}
          onClose={() => setMode('view')}
        />
      )}
    </div>
  )
}