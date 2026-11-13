import { useEffect, useRef, useState } from 'react'
import { decode } from '../lib/source'
import Icon from './Icon'
import { fullQuad, isBadQuad, targetSize } from '../lib/warp'
import type { Halaman, Pt, Quad } from '../lib/types'

const HANDLE = 12
const LOUPE = 96
const PROCESS = '#00727e'

/**
 * Crop: full Tangkapan with four draggable corners drawn over it. A loupe
 * follows the active corner because a finger hides the point being placed.
 */
export default function CropEditor({ page, pageIndex = 0, onSave, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [quad, setQuad] = useState<Quad>(page.crop)
  const [drag, setDrag] = useState<number | null>(null)
  const [view, setView] = useState({ w: 1, h: 1, scale: 1 })
  const bitmapRef = useRef<ImageBitmap | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let dead = false
    decode(page.src).then((b) => {
      if (dead) {
        b.close()
        return
      }
      bitmapRef.current = b
      setReady(true)
    })
    return () => {
      dead = true
      bitmapRef.current?.close()
    }
  }, [page.src])

  // Fit the source into the available box with letterboxing.
  useEffect(() => {
    const fit = () => {
      const el = wrapRef.current
      if (!el) return
      const pad = 12
      const w = el.clientWidth - pad * 2
      const h = el.clientHeight - pad * 2
      const scale = Math.min(w / page.size.w, h / page.size.h)
      setView({ w: page.size.w * scale, h: page.size.h * scale, scale })
    }
    fit()
    addEventListener('resize', fit)
    return () => removeEventListener('resize', fit)
  }, [page.size, ready])

  // Paint the image, the shade outside the quad, the quad, its 3x3 guides and the corners.
  useEffect(() => {
    const c = canvasRef.current
    const bmp = bitmapRef.current
    if (!c || !bmp || !ready) return
    const dpr = Math.min(2, devicePixelRatio || 1)
    c.width = view.w * dpr
    c.height = view.h * dpr
    c.style.width = `${view.w}px`
    c.style.height = `${view.h}px`
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.drawImage(bmp, 0, 0, view.w, view.h)

    const p = quad.map((q) => ({ x: q.x * view.scale, y: q.y * view.scale }))

    // Everything outside the quad is dimmed, so the kept area reads as the page.
    ctx.fillStyle = 'rgba(10,10,10,.45)'
    ctx.beginPath()
    ctx.rect(0, 0, view.w, view.h)
    ctx.moveTo(p[0].x, p[0].y)
    for (let i = 3; i >= 1; i--) ctx.lineTo(p[i].x, p[i].y)
    ctx.closePath()
    ctx.fill('evenodd')

    ctx.strokeStyle = PROCESS
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(p[0].x, p[0].y)
    for (let i = 1; i < 4; i++) ctx.lineTo(p[i].x, p[i].y)
    ctx.closePath()
    ctx.stroke()

    // Rule-of-thirds guides: dashed, so they read as guidance and not as an edge.
    ctx.save()
    ctx.setLineDash([5, 5])
    ctx.lineWidth = 1
    ctx.globalAlpha = 0.75
    for (const t of [1 / 3, 2 / 3]) {
      ctx.beginPath()
      ctx.moveTo(lerp(p[0], p[1], t).x, lerp(p[0], p[1], t).y)
      ctx.lineTo(lerp(p[3], p[2], t).x, lerp(p[3], p[2], t).y)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(lerp(p[0], p[3], t).x, lerp(p[0], p[3], t).y)
      ctx.lineTo(lerp(p[1], p[2], t).x, lerp(p[1], p[2], t).y)
      ctx.stroke()
    }
    ctx.restore()

    // Square handles in the same bracket language as the crop marks.
    for (const q of p) {
      ctx.fillStyle = '#fff'
      ctx.fillRect(q.x - HANDLE / 2, q.y - HANDLE / 2, HANDLE, HANDLE)
      ctx.strokeStyle = PROCESS
      ctx.lineWidth = 2
      ctx.strokeRect(q.x - HANDLE / 2, q.y - HANDLE / 2, HANDLE, HANDLE)
    }
  }, [quad, view, ready])

  const toSource = (clientX: number, clientY: number): Pt => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      x: Math.min(page.size.w, Math.max(0, (clientX - rect.left) / view.scale)),
      y: Math.min(page.size.h, Math.max(0, (clientY - rect.top) / view.scale)),
    }
  }

  const pick = (clientX: number, clientY: number): number | null => {
    const rect = canvasRef.current!.getBoundingClientRect()
    let best = -1
    let dist = Infinity
    quad.forEach((q, i) => {
      const d = Math.hypot(q.x * view.scale + rect.left - clientX, q.y * view.scale + rect.top - clientY)
      if (d < dist) {
        dist = d
        best = i
      }
    })
    return dist < 44 ? best : null
  }

  const move = (clientX: number, clientY: number) => {
    if (drag === null) return
    const p = toSource(clientX, clientY)
    setQuad((q) => q.map((old, i) => (i === drag ? p : old)) as Quad)
  }

  const bad = isBadQuad(quad)
  const loupeAt = drag !== null ? quad[drag] : null
  const out = targetSize(quad, 2000)

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 px-4 pb-2 pt-4">
        <div className="flex items-start justify-between gap-3">
          <button onClick={onCancel} className="link-action shrink-0">
            Batal
          </button>
          <div className="text-center">
            <div className="display text-[18px]">Potong</div>
            <div className="num mt-0.5 text-[10px] text-ink-2">
              Halaman {String(pageIndex + 1).padStart(2, '0')}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              onClick={() => setQuad(fullQuad(page.size))}
              className="link-action inline-flex items-center gap-1 text-[11px]"
            >
              <Icon name="reset" size={11} />
              Reset
            </button>
            <button
              disabled={bad}
              onClick={() => onSave(quad)}
              className="display inline-flex items-center gap-1.5 bg-ink px-3 py-1.5 text-[12px] text-paper active:opacity-80 disabled:opacity-40"
            >
              <Icon name="save" size={12} />
              Simpan
            </button>
          </div>
        </div>
      </header>
      <div className="h-0.5 shrink-0 bg-ink" />

      <div
        ref={wrapRef}
        className="relative flex min-h-0 flex-1 items-center justify-center bg-plate"
        onPointerDown={(e) => {
          const i = pick(e.clientX, e.clientY)
          if (i === null) return
          ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
          setDrag(i)
        }}
        onPointerMove={(e) => move(e.clientX, e.clientY)}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
      >
        <canvas ref={canvasRef} className="touch-none" />
        {loupeAt && <Loupe bitmap={bitmapRef.current} at={loupeAt} viewScale={view.scale} />}
      </div>

      {bad && (
        <p className="shrink-0 border-t-2 border-ink bg-process-wash px-4 py-2 text-center text-[12px] text-ink">
          Area potong tidak valid
        </p>
      )}

      <div className="flex shrink-0 items-center justify-between border-t-2 border-ink px-4 py-2">
        <span className="flex items-center gap-2 text-[11px] text-ink-2">
          <span className="block h-2 w-2 bg-ink" />
          Tarik sudut ke pojok kertas
        </span>
        <span className="num text-[11px] text-ink">
          {out.w} × {out.h} px
        </span>
      </div>
    </div>
  )
}

interface Props {
  page: Halaman
  pageIndex?: number
  onSave: (crop: Quad) => void
  onCancel: () => void
}

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

/** Square magnifier at the bottom-left, showing the source around the active corner. */
function Loupe({ bitmap, at, viewScale }: { bitmap: ImageBitmap | null; at: Pt; viewScale: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c || !bitmap) return
    const dpr = Math.min(2, devicePixelRatio || 1)
    c.width = LOUPE * dpr
    c.height = LOUPE * dpr
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const r = LOUPE / 2
    // Magnify ~2.5x relative to what the screen shows, not 2x the source pixels:
    // at mobile fit scale the source pixels are ~4 screen px each, which would
    // make the loupe a meaningless 30x zoom.
    const zoom = 2.5 * viewScale
    const region = LOUPE / zoom
    ctx.clearRect(0, 0, LOUPE, LOUPE)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, LOUPE, LOUPE)
    ctx.drawImage(bitmap, at.x - region / 2, at.y - region / 2, region, region, 0, 0, LOUPE, LOUPE)
    ctx.strokeStyle = PROCESS
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(r, 0)
    ctx.lineTo(r, LOUPE)
    ctx.moveTo(0, r)
    ctx.lineTo(LOUPE, r)
    ctx.stroke()
  }, [bitmap, at, viewScale])
  return (
    <div className="pointer-events-none absolute bottom-4 left-4">
      <canvas ref={ref} style={{ width: LOUPE, height: LOUPE }} className="block border-2 border-ink bg-paper" />
      <span className="num mt-1 inline-block bg-ink px-1 text-[9px] text-paper">2,5×</span>
    </div>
  )
}
