import { useEffect, useState } from 'react'
import { renderThumb } from '../lib/render'
import { MAX_PAGES, type Halaman } from '../lib/types'
import Icon from './Icon'

/** Thumbnail cache keyed by everything that affects the rendered pixels. */
const cache = new Map<string, Promise<string>>()

function keyOf(p: Halaman): string {
  return `${p.id}|${JSON.stringify(p.crop)}|${p.filter}|${p.rotation}`
}

export function useThumb(page: Halaman): string | null {
  const key = keyOf(page)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let dead = false
    let p = cache.get(key)
    if (!p) {
      p = renderThumb(page).then((b) => URL.createObjectURL(b))
      cache.set(key, p)
    }
    p.then((u) => !dead && setUrl(u)).catch(() => {})
    return () => {
      dead = true
    }
  }, [key, page])
  return url
}

interface Props {
  pages: Halaman[]
  activeId: string | null
  onSelect: (id: string) => void
  onMove: (from: number, to: number) => void
  onDelete: (id: string) => void
  onAdd: () => void
}

/**
 * Contact sheet: frames sit flush against each other, divided by hairlines,
 * with the frame number underneath. The current frame carries the cyan mark.
 */
export default function PageStrip({ pages, activeId, onSelect, onMove, onDelete, onAdd }: Props) {
  const activeIndex = pages.findIndex((p) => p.id === activeId)
  return (
    <div className="shrink-0">
      <div className="flex overflow-x-auto">
        {pages.map((p, i) => (
          <Frame
            key={p.id}
            page={p}
            index={i}
            active={p.id === activeId}
            onClick={() => onSelect(p.id)}
          />
        ))}
        <button
          onClick={onAdd}
          disabled={pages.length >= MAX_PAGES}
          aria-label="Tambah halaman"
          className="flex w-[62px] shrink-0 flex-col items-center justify-center border-r border-hair py-2 text-ink-2 active:bg-plate disabled:opacity-40"
        >
          <Icon name="plus" size={15} />
          <span className="kicker mt-1.5">Tambah</span>
        </button>
      </div>

      {/* Reorder and delete act on the current frame, so they appear only there. */}
      {activeIndex >= 0 && (
        <div className="flex items-center justify-end gap-4 border-t border-hair px-4 py-1.5">
          <button
            aria-label="Geser kiri"
            disabled={activeIndex === 0}
            onClick={() => onMove(activeIndex, activeIndex - 1)}
            className="inline-flex items-center gap-1 text-[11px] uppercase text-ink-2 active:text-ink disabled:opacity-30"
          >
            <Icon name="left" size={12} />
            Geser
          </button>
          <button
            aria-label="Geser kanan"
            disabled={activeIndex === pages.length - 1}
            onClick={() => onMove(activeIndex, activeIndex + 1)}
            className="inline-flex items-center gap-1 text-[11px] uppercase text-ink-2 active:text-ink disabled:opacity-30"
          >
            Geser
            <Icon name="right" size={12} />
          </button>
          <button
            onClick={() => onDelete(pages[activeIndex].id)}
            className="link-action inline-flex items-center gap-1 text-[11px]"
          >
            <Icon name="trash" size={11} />
            Hapus
          </button>
        </div>
      )}
    </div>
  )
}

function Frame({
  page,
  index,
  active,
  onClick,
}: {
  page: Halaman
  index: number
  active: boolean
  onClick: () => void
}) {
  const url = useThumb(page)
  return (
    <div className="flex w-[62px] shrink-0 flex-col border-r border-hair">
      <button
        onClick={onClick}
        aria-label={`Halaman ${index + 1}`}
        aria-current={active ? 'true' : undefined}
        className={`h-[80px] w-full border-2 bg-paper ${active ? 'border-process' : 'border-transparent'}`}
      >
        {url ? <img src={url} alt="" className="h-full w-full object-contain" /> : null}
      </button>
      <span className={`num pb-1.5 text-center text-[9px] ${active ? 'text-process' : 'text-ink-2'}`}>
        {String(index + 1).padStart(2, '0')}
      </span>
    </div>
  )
}
