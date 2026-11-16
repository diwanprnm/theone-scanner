// End-to-end: seed a document, export PDF + JPEG, and back up. A download that
// never starts, or starts empty, is the failure this catches.
export default async function run(page) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://localhost:5174/')
  await page.waitForTimeout(500)

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
    const mk = () =>
      new Promise((res) => {
        const c = document.createElement('canvas')
        c.width = 1240
        c.height = 1754
        const x = c.getContext('2d')
        x.fillStyle = '#fff'
        x.fillRect(0, 0, 1240, 1754)
        x.fillStyle = '#111'
        x.font = 'bold 40px serif'
        x.fillText('SURAT KETERANGAN', 200, 300)
        for (let i = 0; i < 20; i++) x.fillRect(200, 400 + i * 40, 700, 8)
        c.toBlob((b) => res(b), 'image/jpeg', 0.9)
      })
    const put = (s, v) =>
      new Promise((res) => {
        const tx = db.transaction(s, 'readwrite')
        tx.objectStore(s).put(v)
        tx.oncomplete = () => res()
      })
    const ids = []
    for (let i = 0; i < 2; i++) {
      const id = `exp-p${i}`
      ids.push(id)
      await put('pages', {
        id,
        size: { w: 1240, h: 1754 },
        src: await mk(),
        crop: [
          { x: 0, y: 0 },
          { x: 1240, y: 0 },
          { x: 1240, y: 1754 },
          { x: 0, y: 1754 },
        ],
        filter: 'original',
        rotation: 0,
      })
    }
    await put('docs', {
      id: 'exp-doc',
      name: 'ekspor-uji',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pages: ids,
    })
  })

  await page.goto('http://localhost:5174/#/doc/exp-doc')
  await page.reload()
  await page.waitForTimeout(1800)

  await page.getByRole('button', { name: 'Ekspor', exact: true }).click()
  await page.waitForTimeout(600)

  // PDF
  const pdfWait = page.waitForEvent('download', { timeout: 30000 })
  await page.getByRole('button', { name: 'UNDUH' }).click()
  const pdf = await pdfWait
  const pdfPath = await pdf.path()

  // JPEG: reopen the sheet, switch format
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Ekspor', exact: true }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'jpeg', exact: true }).click()
  await page.waitForTimeout(300)
  const jpgWait = page.waitForEvent('download', { timeout: 30000 })
  await page.getByRole('button', { name: 'UNDUH' }).click()
  const jpg = await jpgWait

  // Backup
  await page.goto('http://localhost:5174/#/')
  await page.reload()
  await page.waitForTimeout(1200)
  const zipWait = page.waitForEvent('download', { timeout: 30000 })
  await page.getByRole('button', { name: 'BACKUP' }).click()
  const zip = await zipWait

  const { statSync } = await import('node:fs')
  const size = (p) => (p ? statSync(p).size : null)
  return {
    pdf: { name: pdf.suggestedFilename(), bytes: size(pdfPath) },
    jpeg: { name: jpg.suggestedFilename(), bytes: size(await jpg.path()) },
    backup: { name: zip.suggestedFilename(), bytes: size(await zip.path()) },
  }
}
