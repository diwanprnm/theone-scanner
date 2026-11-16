// Seed, then walk every screen of the Cetak redesign and screenshot each one.
export default async function run(page, ui) {
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e)))

  await page.goto('http://localhost:5174/')
  await page.waitForTimeout(600)

  await page.evaluate(async () => {
    const open = () =>
      new Promise((res, rej) => {
        const r = indexedDB.open('theonescan', 1)
        r.onupgradeneeded = () => {
          const d = r.result
          d.createObjectStore('docs', { keyPath: 'id' })
          d.createObjectStore('pages', { keyPath: 'id' })
        }
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
    const db = await open()
    const mk = (kind) =>
      new Promise((res) => {
        const c = document.createElement('canvas')
        c.width = 1240
        c.height = 1754
        const x = c.getContext('2d')
        x.fillStyle = '#fdfdfb'
        x.fillRect(0, 0, 1240, 1754)
        x.fillStyle = '#111'
        x.font = 'bold 34px serif'
        x.textAlign = 'center'
        x.fillText('KEMENTERIAN ARSIP', 620, 150)
        x.font = '15px serif'
        x.fillStyle = '#444'
        x.fillText('DIREKTORAT JENDERAL DOKUMENTASI', 620, 180)
        x.fillRect(160, 200, 920, 3)
        x.textAlign = 'left'
        x.font = 'bold 24px serif'
        x.fillStyle = '#111'
        x.fillText(kind === 0 ? 'SURAT PERJANJIAN KERJASAMA' : 'NOTULEN RAPAT KUARTAL', 160, 270)
        x.font = '15px serif'
        x.fillStyle = '#555'
        x.fillText('NOMOR: 088/SPK-ARSIP/XI/2026', 160, 300)
        for (let i = 0; i < 30; i++) {
          x.fillStyle = i % 6 === 0 ? '#333' : '#999'
          x.fillRect(160, 360 + i * 30, 300 + ((i * 97) % 620), 7)
        }
        x.strokeStyle = '#333'
        x.lineWidth = 2
        x.strokeRect(160, 1330, 920, 150)
        x.font = '15px serif'
        x.fillStyle = '#333'
        x.fillText('PASAL 3 — KETENTUAN HAK DAN KUOTA PENYIMPANAN', 190, 1375)
        x.fillRect(190, 1395, 700, 6)
        x.fillRect(190, 1415, 620, 6)
        x.font = '16px serif'
        x.fillText('Pihak Pertama,', 160, 1570)
        x.beginPath()
        x.moveTo(180, 1630)
        x.bezierCurveTo(260, 1580, 320, 1670, 400, 1600)
        x.stroke()
        x.font = 'bold 15px serif'
        x.fillText('BAMBANG S.', 160, 1680)
        c.toBlob((b) => res(b), 'image/jpeg', 0.9)
      })
    const put = (s, v) =>
      new Promise((res) => {
        const tx = db.transaction(s, 'readwrite')
        tx.objectStore(s).put(v)
        tx.oncomplete = () => res()
      })
    const pages = []
    for (let i = 0; i < 4; i++) {
      const id = `qa-p${i}`
      pages.push(id)
      await put('pages', {
        id,
        size: { w: 1240, h: 1754 },
        src: await mk(i % 2),
        crop: [
          { x: 0, y: 0 },
          { x: 1240, y: 0 },
          { x: 1240, y: 1754 },
          { x: 0, y: 1754 },
        ],
        filter: i === 2 ? 'bw' : 'original',
        rotation: 0,
      })
    }
    await put('docs', {
      id: 'qa-doc-1',
      name: 'scan-2026-11-13-1432',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pages,
    })
    await put('docs', {
      id: 'qa-doc-2',
      name: 'Surat Perjanjian Kerjasama',
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now() - 86400000,
      pages: [],
    })
    await put('docs', {
      id: 'qa-doc-3',
      name: 'Notulen Rapat Q4',
      createdAt: Date.now() - 172800000,
      updatedAt: Date.now() - 172800000,
      pages: [],
    })
  })

  await page.setViewportSize({ width: 390, height: 844 })

  // A hash-only goto does not remount the app, so reload to pick up the seed.
  await page.goto('http://localhost:5174/#/')
  await page.reload()
  await page.waitForTimeout(1600)
  await page.screenshot({ path: 'qa/1-library.png' })

  await page.goto('http://localhost:5174/#/doc/qa-doc-1')
  await page.reload()
  await page.waitForTimeout(2400)
  await page.screenshot({ path: 'qa/2-editor.png' })

  const cropBtn = page.getByRole('button', { name: 'Potong', exact: true })
  await cropBtn.click()
  await page.waitForTimeout(1300)
  await page.screenshot({ path: 'qa/3-crop.png' })

  // Grab the top-left handle exactly, so the loupe shows during the drag.
  const box = await page.locator('canvas').first().boundingBox()
  await page.mouse.move(box.x + 1, box.y + 1)
  await page.mouse.down()
  await page.mouse.move(box.x + 46, box.y + 62, { steps: 12 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'qa/4-crop-drag.png' })
  await page.mouse.up()
  await page.waitForTimeout(200)

  await page.getByRole('button', { name: 'BATAL' }).click()
  await page.waitForTimeout(500)

  await page.getByRole('button', { name: 'EKSPOR' }).click()
  await page.waitForTimeout(900)
  await page.screenshot({ path: 'qa/5-export.png' })

  return { errs }
}