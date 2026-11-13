import { useEffect, useRef, useState } from 'react'
import { renderPage } from '../lib/render'
import { fullQuad } from '../lib/warp'
import CropMarks from './CropMarks'
import Icon from './Icon'
import type { FilterName, Halaman } from '../lib/types'

const FILTERS: { key: FilterName; label: string }[] = [
  { key: 'original', label: 'Original' },
  { key: 'gray', label: 'Gray' },
  { key: 'bw', label: 'B&W' },
  { key: 'enhance', label: 'Enhance' },
]

interface Props {
  page: Halaman
  onChange: (patch: Partial<Halaman>) => void
  onCrop: () => void
  onDelete: () => void
}

/** Full-page preview with the per-halaman Filter and rotation controls. */
export default function PageView({ page, onChange, onCrop, onDelete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [busy, setBusy] = useState(true)
  const [px, setPx] = useState<{ w: number; h: number } | null>(null)

  useEffect(() => {
    let dead = false
    setBusy(true)
    renderPage(page)
      .then((c) => {
        if (dead) return
        const dst = canvasRef.current
        if (!dst) return
        dst.width = c.width
        dst.height = c.height
        dst.getContext('2d')!.drawImage(c, 0, 0)
        setPx({ w: c.width, h: c.height })
        setBusy(false)
      })
      .catch(() => setBusy(false))
    return () => {
      dead = true
    }
  }, [page])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Work area: plate grey, so the paper is the only white surface on screen.
          The trim marks sit on this work area, not on the app chrome. */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-plate p-5">
        <CropMarks />
        <canvas ref={canvasRef} className="h-auto max-h-full w-auto max-w-full border border-ink bg-paper" />
        <span className="kicker pointer-events-none absolute bottom-4 right-5 z-20 text-ink-2">
          {busy ? 'Memproses' : px ? `${px.w} × ${px.h} px` : ''}
        </span>      </div>

      <div className="shrink-0 border-t-2 border-ink">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex gap-4 overflow-x-auto">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => onChange({ filter: f.key })}
                aria-pressed={page.filter === f.key}
                className={`display shrink-0 border-b-2 pb-1 text-[13px] ${
                  page.filter === f.key ? 'border-ink text-ink' : 'border-transparent text-ink-2'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => onChange({ rotation: (page.rotation + 90) % 360 })}
            aria-label="Putar 90 derajat"
            className="flex shrink-0 items-center gap-1.5 text-[11px] uppercase text-ink active:text-ink-2"
          >
            <Icon name="rotate" size={13} />
            Putar 90°
          </button>
        </div>

        {/* Two choices stay here; the third drops to a text link so no row of three outlines appears. */}
        <div className="flex items-center justify-between border-t border-hair px-4 py-1.5">
          <button
            onClick={() => onChange({ crop: fullQuad(page.size) })}
            className="link-action inline-flex items-center gap-1 text-[11px]"
          >
            <Icon name="reset" size={11} />
            Reset potong
          </button>
          <button onClick={onDelete} className="link-action inline-flex items-center gap-1 text-[11px]">
            <Icon name="trash" size={11} />
            Hapus
          </button>
        </div>

        <button onClick={onCrop} className="bar-action gap-2">
          <Icon name="crop" size={15} />
          Potong
        </button>
      </div>
    </div>
  )
}
