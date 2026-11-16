import { useEffect, useRef, useState } from 'react'
import { getPage, listDocs, putDoc, storageEstimate } from '../lib/db'
import { renderThumb } from '../lib/render'
import { createBackup, importBackup } from '../lib/backup'
import { download } from '../lib/export'
import { useInstall } from '../lib/install'
import CropMarks from './CropMarks'
import Icon from './Icon'
import type { Dokumen } from '../lib/types'

interface Props {
  activeId: string | null
  onOpen: (id: string) => void
}

export default function Library({ activeId, onOpen }: Props) {
  const [docs, setDocs] = useState<Dokumen[]>([])
  const [quota, setQuota] = useState<{ used: number; quota: number } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  // Long press opens the row menu; the tap that ends it must not open the doc.
  const [menu, setMenu] = useState<Dokumen | null>(null)
  const pressTimer = useRef<number | null>(null)
  const longPressed = useRef(false)
  const importRef = useRef<HTMLInputElement>(null)
  const { canInstall, installed, install, hint } = useInstall()

  const refresh = () => {
    listDocs().then(setDocs)
    storageEstimate().then(setQuota)
  }
  useEffect(refresh, [])

  const onBackup = async () => {
    const blob = await createBackup()
    download(blob, `theonescan-backup-${new Date().toISOString().slice(0, 10)}.zip`)
  }

  const onImport = async (file: File | undefined) => {
    if (!file) return
    try {
      const r = await importBackup(file)
      setMsg(`Dipulihkan: ${r.docs} dokumen, ${r.pages} halaman.`)
      refresh()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Impor gagal')
    }
  }

  // Indonesian decimal comma, and a value that never wraps the readout column.
  const size = (n: number) => {
    const [v, unit] = n >= 1073741824 ? [n / 1073741824, 'GB'] : [n / 1048576, 'MB']
    return `${v.toFixed(1).replace('.', ',')} ${unit}`
  }

  const startRename = (d: Dokumen) => {
    setDraft(d.name)
    setRenaming(d.id)
  }

  const endPress = () => {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current)
    pressTimer.current = null
  }

  const startPress = (d: Dokumen) => {
    longPressed.current = false
    endPress()
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true
      setMenu(d)
    }, 450)
  }

  const commitRename = async (d: Dokumen) => {
    setRenaming(null)
    const next = draft.trim().slice(0, 80)
    if (!next || next === d.name) return
    await putDoc({ ...d, name: next })
    refresh()
  }

  return (
    <div className="relative flex h-full flex-col">
      <CropMarks bottom="bottom-[62px]" />

      <header className="px-5 pt-5">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="display text-[30px]">Theonescan</h1>
          <nav className="flex items-center gap-3">
            <button onClick={onBackup} className="link-action inline-flex items-center gap-1">
              <Icon name="backup" size={11} />
              Backup
            </button>
            <button
              onClick={() => importRef.current?.click()}
              className="link-action inline-flex items-center gap-1"
            >
              <Icon name="import" size={11} />
              Impor
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/zip"
              className="hidden"
              onChange={(e) => {
                onImport(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </nav>
        </div>
      </header>

      <div className="mt-4 h-0.5 bg-ink" />

      <div className="grid grid-cols-3 px-5 py-3">
        <Readout value={String(docs.length).padStart(2, '0')} label="Dokumen" />
        <Readout
          value={quota ? size(quota.used) : '—'}
          label="Terpakai"
          className="border-l border-hair pl-3.5"
        />
        <Readout
          value={quota && quota.quota > 0 ? size(quota.quota) : '—'}
          label="Kuota"
          className="border-l border-hair pl-3.5"
        />
      </div>
      <div className="h-0.5 bg-ink" />

      {msg && (
        <div className="flex items-center justify-between border-b border-hair px-5 py-2 text-[12px]">
          <span className="text-ink-2">{msg}</span>
          <button onClick={() => setMsg(null)} className="px-1 text-ink-2" aria-label="Tutup pesan">
            <Icon name="close" size={12} />
          </button>
        </div>
      )}

      <main className="min-h-0 flex-1 overflow-y-auto">
        {docs.length === 0 ? (
          <p className="px-5 py-16 text-center text-[13px] text-ink-2">
            Belum ada dokumen. Mulai dari Scan baru.
          </p>
        ) : (
          <ul>
            {docs.map((d, i) => (
              <li key={d.id}>
                {renaming === d.id ? (
                  <div className="flex items-center gap-3 border-b border-hair py-2.5 pr-4">
                    <span className="num w-11 shrink-0 border-l-[3px] border-process pr-3 text-right text-[11px] text-process">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <DocThumb doc={d} />
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onFocus={(e) => e.currentTarget.select()}
                      onBlur={() => void commitRename(d)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void commitRename(d)
                        if (e.key === 'Escape') setRenaming(null)
                      }}
                      maxLength={80}
                      aria-label="Nama dokumen"
                      className="min-w-0 flex-1 border-b border-ink bg-transparent pb-0.5 text-[15px] font-medium outline-none"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-3 border-b border-hair pr-4">
                    <button
                      onClick={() => {
                        // A long press already opened the menu; swallow the tap.
                        if (longPressed.current) {
                          longPressed.current = false
                          return
                        }
                        onOpen(d.id)
                      }}
                      onPointerDown={() => startPress(d)}
                      onPointerUp={endPress}
                      onPointerLeave={endPress}
                      onPointerCancel={endPress}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setMenu(d)
                      }}
                      className={`flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-0 text-left ${
                        d.id === activeId ? 'bg-process-wash' : 'active:bg-plate'
                      }`}
                    >
                      {/* Record number: right-aligned in a fixed column so the digits form a spine. */}
                      <span
                        className={`num w-11 shrink-0 border-l-[3px] pr-3 text-right text-[11px] ${
                          d.id === activeId ? 'border-process text-process' : 'border-transparent text-ink-2'
                        }`}
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <DocThumb doc={d} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium">{d.name}</span>
                        <span className="num mt-0.5 block text-[10px] uppercase text-ink-2">
                          {String(d.pages.length).padStart(2, '0')} hal ·{' '}
                          {new Date(d.updatedAt).toLocaleString('id-ID', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </span>
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>

      <button onClick={() => onOpen('new')} className="bar-action shrink-0 gap-2">
        <Icon name="scan" size={15} />
        Scan baru
      </button>

      {/* Long press on a row: the only place rename lives without a visible button. */}
      {menu && (
        <div className="fixed inset-0 z-30 flex items-end bg-ink/45" onClick={() => setMenu(null)}>
          <div
            className="w-full border-t-2 border-ink bg-paper pb-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between gap-3 border-l-[3px] border-process px-5 py-3">
              <span className="truncate text-[15px] font-medium">{menu.name}</span>
              <button onClick={() => setMenu(null)} aria-label="Tutup" className="shrink-0 p-1 text-ink-2">
                <Icon name="close" size={12} />
              </button>
            </div>
            <div className="h-0.5 bg-ink" />
            <div className="mt-4 px-5">
              <button
                onClick={() => {
                  startRename(menu)
                  setMenu(null)
                }}
                className="bar-action gap-2"
              >
                <Icon name="pencil" size={15} />
                Ubah nama
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Install floats: it is the one action a browser-tab user cannot reach
          any other way, and it disappears once the app is on the home screen. */}
      {!installed && (
        <button
          onClick={() => void (canInstall ? install() : setMsg(hint))}
          aria-label="Pasang aplikasi"
          title="Pasang aplikasi"
          className="absolute bottom-[92px] right-4 z-20 flex h-12 w-12 items-center justify-center border-2 border-ink bg-paper text-ink active:bg-plate"
        >
          <Icon name="install" size={20} />
        </button>
      )}
    </div>
  )
}

function Readout({ value, label, className = '' }: { value: string; label: string; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="num truncate whitespace-nowrap text-[22px] font-bold leading-none">{value}</div>
      <div className="kicker mt-1">{label}</div>
    </div>
  )
}

/** First Halaman of a Dokumen, rendered small. Real content, not a grey placeholder. */
function DocThumb({ doc }: { doc: Dokumen }) {
  const [url, setUrl] = useState<string | null>(null)
  const first = doc.pages[0]
  useEffect(() => {
    if (!first) return
    let dead = false
    void (async () => {
      const p = await getPage(first)
      if (!p || dead) return
      const b = await renderThumb(p, 120)
      if (dead) return
      setUrl(URL.createObjectURL(b))
    })()
    return () => {
      dead = true
    }
  }, [first])
  // A Dokumen with no Halaman has nothing to show; an empty frame would read as
  // a broken image, so it states the count instead.
  if (!first) {
    return (
      <span className="num flex h-[52px] w-[40px] shrink-0 items-center justify-center border border-hair text-[9px] text-ink-2">
        00
      </span>
    )
  }
  return (
    <span className="flex h-[52px] w-[40px] shrink-0 items-center justify-center border border-ink bg-paper">
      {url ? <img src={url} alt="" className="h-full w-full object-contain" /> : null}
    </span>
  )
}
