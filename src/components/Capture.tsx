import { useEffect, useRef, useState } from 'react'
import { detectQuad } from '../lib/detect'
import { decode, halamanFromFile, normalizeSource, newHalaman } from '../lib/source'
import { fullQuad } from '../lib/warp'
import { MAX_PAGES, MAX_UPLOAD_BYTES, type Halaman } from '../lib/types'
import Icon from './Icon'

interface Props {
  onPages: (pages: Halaman[]) => void
  onCancel: () => void
  pageCount: number
  onExceed: () => void
}

/**
 * Kamera: live getUserMedia preview with a frame guide, falling back to the OS
 * camera picker when the browser refuses or has no camera.
 */
export default function Capture({ onPages, onCancel, pageCount, onExceed }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [live, setLive] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const uploadRef = useRef<HTMLInputElement>(null)
  const osCamRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 } }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = s
        if (videoRef.current) {
          videoRef.current.srcObject = s
          void videoRef.current.play()
        }
        setLive(true)
      })
      .catch(() => setErr('Kamera tidak tersedia. Pakai Unggah atau Kamera HP.'))
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  const add = async (pages: Halaman[]) => {
    if (!pages.length) return
    if (pageCount + pages.length > MAX_PAGES) {
      onExceed()
      pages = pages.slice(0, Math.max(0, MAX_PAGES - pageCount))
      if (!pages.length) return
    }
    onPages(pages)
  }

  const shutter = async () => {
    const v = videoRef.current
    if (!v || busy) return
    setBusy(true)
    try {
      const c = document.createElement('canvas')
      c.width = v.videoWidth
      c.height = v.videoHeight
      c.getContext('2d')!.drawImage(v, 0, 0)
      const bitmap = await decode(await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.95)))
      try {
        const { blob, size } = await normalizeSource(bitmap)
        // Detect on the downscaled copy so the quad matches the stored source.
        const small = await decode(blob)
        try {
          await add([newHalaman(blob, size, detectQuad(small) ?? fullQuad(size))])
        } finally {
          small.close()
        }
      } finally {
        bitmap.close()
      }
    } finally {
      setBusy(false)
    }
  }

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const ok: Halaman[] = []
    for (const f of Array.from(files)) {
      if (f.size > MAX_UPLOAD_BYTES) {
        setErr(`${f.name} lebih dari 20MB, dilewati.`)
        continue
      }
      try {
        ok.push(await halamanFromFile(f))
      } catch {
        setErr(`${f.name} tidak bisa dibaca.`)
      }
    }
    await add(ok)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 px-4 pb-2 pt-4">
        <div className="flex items-start justify-between gap-3">
          <button onClick={onCancel} className="link-action shrink-0">
            Tutup
          </button>
          <div className="text-center">
            <div className="display text-[15px]">Halaman baru</div>
            <div className="num mt-0.5 text-[10px] text-ink-2">
              {String(pageCount + 1).padStart(2, '0')} / {MAX_PAGES}
            </div>
          </div>
          <span className="num shrink-0 pt-1 text-[9px] uppercase text-ink-2">Kamera belakang</span>
        </div>
      </header>
      <div className="h-0.5 shrink-0 bg-ink" />

      <div className={`relative min-h-0 flex-1 overflow-hidden ${live ? 'bg-ink' : 'bg-plate'}`}>
        <video ref={videoRef} playsInline muted className="h-full w-full object-contain" />

        {live && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            {/* The capture frame borrows the page's crop-mark bracket, not a full outline. */}
            <div className="relative aspect-[3/4] w-full max-w-[280px]">
              <span className="absolute left-0 top-0 h-7 w-7 border-l-[3px] border-t-[3px] border-paper" />
              <span className="absolute right-0 top-0 h-7 w-7 border-r-[3px] border-t-[3px] border-paper" />
              <span className="absolute bottom-0 left-0 h-7 w-7 border-b-[3px] border-l-[3px] border-paper" />
              <span className="absolute bottom-0 right-0 h-7 w-7 border-b-[3px] border-r-[3px] border-paper" />
            </div>
          </div>
        )}

        {live && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-6">
            <span className="bg-paper px-2 py-1 text-[11px] text-ink">
              Posisikan kertas di dalam bingkai
            </span>
          </div>
        )}

        {/* While live, a failed frame is news. Without a camera the paragraph
            below already says what to do, so a banner would repeat it. */}
        {err && live && (
          <div className="absolute inset-x-4 top-4 border-2 border-ink bg-paper px-3 py-2 text-[12px] text-ink">
            {err}
          </div>
        )}

        {/* Without a camera the frame guide is meaningless, so the viewfinder
            itself points at the two inputs that still work. */}
        {!live && (
          <p className="absolute inset-0 flex items-center justify-center px-10 text-center text-[12px] text-ink-2">
            {err
              ? 'Pilih Unggah untuk mengambil gambar dari galeri, atau Kamera HP untuk membuka kamera bawaan.'
              : 'Menyiapkan kamera…'}
          </p>
        )}
      </div>

      <div className="shrink-0 border-t-2 border-ink">
        <div className="flex items-center justify-around px-4 py-3">
          <button
            onClick={() => uploadRef.current?.click()}
            className="flex w-20 flex-col items-center gap-1.5 text-[10px] uppercase text-ink active:text-ink-2"
          >
            <Icon name="upload" size={20} />
            Unggah
          </button>

          {/* Shutter: the one process-cyan element on this screen. */}
          <button
            onClick={shutter}
            disabled={!live || busy}
            aria-label="Ambil gambar"
            className="flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-ink active:opacity-70 disabled:opacity-40"
          >
            <span className="block h-12 w-12 rounded-full bg-process" />
          </button>

          <button
            onClick={() => osCamRef.current?.click()}
            className="flex w-20 flex-col items-center gap-1.5 text-[10px] uppercase text-ink active:text-ink-2"
          >
            <Icon name="camera" size={20} />
            Kamera HP
          </button>
        </div>

        <div className="flex items-center justify-between border-t border-hair px-4 py-1.5">
          <span className="text-[10px] text-ink-2">Hasil masuk ke dokumen ini</span>
          <span className="num text-[11px]">2000 px</span>
        </div>
      </div>

      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          onFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={osCamRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          onFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
