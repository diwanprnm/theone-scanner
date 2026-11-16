import { useMemo, useState } from 'react'
import { buildImages, buildPdf, defaultName, download } from '../lib/export'
import { canShare, shareFiles } from '../lib/share'
import Icon from './Icon'
import type { Halaman } from '../lib/types'

type Format = 'pdf' | 'jpeg' | 'png'

interface Props {
  pages: Halaman[]
  /** Dokumen name, so renaming in the editor carries into the export filename. */
  suggested: string
  /** Renaming here renames the Dokumen too, not just the exported file. */
  onRename: (name: string) => void
  onClose: () => void
}

/** Export sheet: name, format, then Bagikan (WA etc.) or Unduh. */
export default function ExportPanel({ pages, suggested, onRename, onClose }: Props) {
  const [name, setName] = useState(suggested || defaultName())
  const [format, setFormat] = useState<Format>('pdf')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Estimate from the stored sources: close enough to warn about a big export.
  const est = useMemo(() => {
    const bytes = pages.reduce((n, p) => n + p.src.size, 0)
    const scaled = format === 'pdf' ? bytes * 0.9 : format === 'jpeg' ? bytes * 0.55 : bytes * 2.4
    return scaled >= 1048576 ? `${(scaled / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(scaled / 1024))} KB`
  }, [pages, format])

  const ext = format === 'png' ? '.PNG' : format === 'jpeg' ? '.JPG' : '.PDF'

  // Blur and every export path persist the name, so the Dokumen keeps it.
  const commit = () => {
    const next = name.trim().slice(0, 80)
    if (next && next !== suggested) onRename(next)
  }

  const make = async (): Promise<{ files: File[]; filename: string }> => {
    commit()
    const safe = name.trim() || defaultName()
    if (format === 'pdf') {
      const blob = await buildPdf(pages, safe)
      return { files: [new File([blob], `${safe}.pdf`, { type: 'application/pdf' })], filename: `${safe}.pdf` }
    }
    const type = format === 'png' ? 'image/png' : 'image/jpeg'
    const files = await buildImages(pages, type)
    return { files, filename: files.length === 1 ? files[0].name : safe }
  }

  const run = async (mode: 'share' | 'download') => {
    setBusy(true)
    setErr(null)
    try {
      const { files, filename } = await make()
      if (mode === 'share' && (await shareFiles(files, filename))) {
        onClose()
        return
      }
      if (files.length === 1) download(files[0], filename)
      else for (const f of files) download(f, f.name)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ekspor gagal')
    } finally {
      setBusy(false)
    }
  }

  const shareable = canShare([new File([], 'a.pdf', { type: 'application/pdf' })])

  return (
    <div className="fixed inset-0 z-20 flex items-end bg-ink/45" onClick={onClose}>
      <div
        className="max-h-full w-full overflow-y-auto border-t-2 border-ink bg-paper pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between gap-3 border-l-[3px] border-process px-5 py-3">
          <h2 className="display text-[22px]">Ekspor</h2>
          <span className="num text-[11px] text-ink-2">
            {String(pages.length).padStart(2, '0')} halaman
          </span>
        </div>
        <div className="h-0.5 bg-ink" />

        {/* The export parameters are readouts, not a list of labels. */}
        <div className="grid grid-cols-3 px-5 py-3">
          <Readout value="A4" label="Ukuran" />
          <Readout value="0,92" label="Kualitas" className="border-l border-hair pl-3.5" />
          <Readout value={est} label="Perkiraan" className="border-l border-hair pl-3.5" />
        </div>
        <div className="h-0.5 bg-ink" />

        <div className="px-5 pt-3">
          <label htmlFor="export-name" className="kicker block">
            Nama file
          </label>
          <div className="mt-1 flex items-baseline gap-2 border-b border-ink pb-1">
            <input
              id="export-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commit()
                  e.currentTarget.blur()
                }
              }}
              maxLength={80}
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
            />
            <span className="num shrink-0 text-[12px] text-ink-2">{ext}</span>
          </div>

          <div className="mt-3 flex items-center gap-3">
            {(['pdf', 'jpeg', 'png'] as Format[]).map((f, i) => (
              <span key={f} className="flex items-center gap-3">
                {i > 0 && <span className="text-[11px] text-hair">·</span>}
                <button
                  onClick={() => setFormat(f)}
                  aria-pressed={format === f}
                  className={`display border-b-2 pb-0.5 text-[14px] ${
                    format === f ? 'border-ink text-ink' : 'border-transparent text-ink-2'
                  }`}
                >
                  {f}
                </button>
              </span>
            ))}
          </div>

          <dl className="mt-3 text-[11px]">
            <Row label="Orientasi" value="Mengikuti halaman" />
            <Row label="Halaman" value={`Semua (${String(pages.length).padStart(2, '0')})`} mono />
          </dl>

          {err && <p className="mt-3 text-[12px] text-ink">{err}</p>}
        </div>

        <div className="mt-4 space-y-2 px-5">
          <button disabled={busy} onClick={() => run('download')} className="bar-action gap-2">
            <Icon name="download" size={15} />
            {busy ? 'Memproses…' : 'Unduh'}
          </button>
          {shareable && (
            <button disabled={busy} onClick={() => run('share')} className="bar-outline gap-2">
              <Icon name="share" size={13} />
              Bagikan ke WhatsApp
            </button>
          )}
        </div>

        <p className="mt-2 px-5 text-center text-[10px] text-ink-2">
          {shareable
            ? 'Bagikan membuka WhatsApp dan aplikasi lain di HP.'
            : 'Bagikan langsung tidak tersedia di browser ini. File akan diunduh.'}
        </p>
      </div>
    </div>
  )
}

function Readout({ value, label, className = '' }: { value: string; label: string; className?: string }) {
  return (
    <div className={className}>
      <div className="num text-[24px] font-bold leading-none">{value}</div>
      <div className="kicker mt-1">{label}</div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between border-t border-hair py-2">
      <dt className="uppercase text-ink-2">{label}</dt>
      <dd className={`${mono ? 'num' : 'font-medium'} text-ink`}>{value}</dd>
    </div>
  )
}
