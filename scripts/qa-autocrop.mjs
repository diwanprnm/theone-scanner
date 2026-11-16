// Uploads synthetic "photos" and checks auto crop lands on the sheet, not the
// frame: a plain tilted sheet, one with a shadow across it, and one with a
// bright lamp blob in the scene. Reads the output size the crop screen shows.
const SCENES = [
  {
    name: 'tilted',
    w: 900,
    h: 1200,
    sheet: [
      [150, 120],
      [760, 190],
      [735, 1050],
      [120, 990],
    ],
    shade: 0,
    blob: null,
  },
  {
    name: 'shadow',
    w: 900,
    h: 1200,
    sheet: [
      [150, 120],
      [760, 190],
      [735, 1050],
      [120, 990],
    ],
    shade: 150,
    blob: null,
  },
  {
    name: 'lamp',
    w: 900,
    h: 1200,
    sheet: [
      [150, 120],
      [760, 190],
      [735, 1050],
      [120, 990],
    ],
    shade: 40,
    blob: { x: 840, y: 1130, r: 55 },
  },
]

export default async function run(page) {
  await page.setViewportSize({ width: 390, height: 844 })
  const out = []

  for (const s of SCENES) {
    // A fresh document per scene: back to the library, then Scan baru. A
    // hash-only goto does not remount the app, so reload instead.
    await page.goto('http://localhost:5174/#/')
    await page.reload()
    await page.waitForTimeout(1200)
    await page.getByRole('button', { name: 'Scan baru' }).click()
    await page.waitForTimeout(2500)

    const dataUrl = await page.evaluate((s) => {
      const c = document.createElement('canvas')
      c.width = s.w
      c.height = s.h
      const x = c.getContext('2d')
      x.fillStyle = '#3a3a3a'
      x.fillRect(0, 0, s.w, s.h)
      if (s.blob) {
        const g = x.createRadialGradient(s.blob.x, s.blob.y, 0, s.blob.x, s.blob.y, s.blob.r)
        g.addColorStop(0, '#ffffff')
        g.addColorStop(1, '#3a3a3a')
        x.fillStyle = g
        x.beginPath()
        x.arc(s.blob.x, s.blob.y, s.blob.r, 0, Math.PI * 2)
        x.fill()
      }
      // The sheet, filled with a shading ramp when `shade` is set: a hand shadow.
      const [tl, tr, br, bl] = s.sheet
      const g = x.createLinearGradient(tl[0], 0, tr[0], 0)
      g.addColorStop(0, `rgb(${244 - s.shade},${244 - s.shade},${239 - s.shade})`)
      g.addColorStop(1, '#f4f4ef')
      x.fillStyle = g
      x.beginPath()
      x.moveTo(tl[0], tl[1])
      x.lineTo(tr[0], tr[1])
      x.lineTo(br[0], br[1])
      x.lineTo(bl[0], bl[1])
      x.closePath()
      x.fill()
      // Text lines, so the mask has interior structure to ignore.
      x.save()
      x.beginPath()
      x.moveTo(tl[0], tl[1])
      x.lineTo(tr[0], tr[1])
      x.lineTo(br[0], br[1])
      x.lineTo(bl[0], bl[1])
      x.closePath()
      x.clip()
      x.fillStyle = '#222'
      for (let i = 0; i < 18; i++) x.fillRect(tl[0] + 80, tl[1] + 90 + i * 46, 480, 8)
      x.restore()
      return c.toDataURL('image/png')
    }, s)

    const buf = Buffer.from(dataUrl.split(',')[1], 'base64')
    await page.locator('input[type=file]').first().setInputFiles({
      name: `${s.name}.png`,
      mimeType: 'image/png',
      buffer: buf,
    })
    await page.waitForTimeout(2200)

    const crop = page.getByRole('button', { name: 'Potong', exact: true })
    const hasCrop = (await crop.count()) > 0
    if (hasCrop) {
      await crop.click()
      await page.waitForTimeout(1200)
    }
    const readout = hasCrop ? await page.locator('text=/\\d+ × \\d+ px/').first().innerText() : null
    await page.screenshot({ path: `qa/13-autocrop-${s.name}.png` })

    // What the crop should be: the sheet's own long edges, capped at 2000.
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
    const [tl, tr, br, bl] = s.sheet
    const w = Math.ceil(Math.max(d(tl, tr), d(bl, br)))
    const h = Math.ceil(Math.max(d(tl, bl), d(tr, br)))
    out.push({ scene: s.name, readout, expected: `${w} × ${h} px` })
  }

  return out
}
