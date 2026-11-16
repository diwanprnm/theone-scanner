// Rename in both places, then check the name survives a reload and reaches the
// export filename.
export default async function run(page) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://localhost:4173/')
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
        c.width = 600
        c.height = 800
        const x = c.getContext('2d')
        x.fillStyle = '#fff'
        x.fillRect(0, 0, 600, 800)
        x.fillStyle = '#111'
        x.fillRect(80, 120, 400, 10)
        c.toBlob((b) => res(b), 'image/jpeg', 0.9)
      })
    const put = (s, v) =>
      new Promise((res) => {
        const tx = db.transaction(s, 'readwrite')
        tx.objectStore(s).put(v)
        tx.oncomplete = () => res()
      })
    await put('pages', {
      id: 'rn-p1',
      size: { w: 600, h: 800 },
      src: await mk(),
      crop: [
        { x: 0, y: 0 },
        { x: 600, y: 0 },
        { x: 600, y: 800 },
        { x: 0, y: 800 },
      ],
      filter: 'original',
      rotation: 0,
    })
    await put('docs', {
      id: 'rn-doc',
      name: 'scan-lama',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pages: ['rn-p1'],
    })
  })

  await page.goto('http://localhost:4173/#/')
  await page.reload()
  await page.waitForTimeout(1500)

  // 1. Rename from the library list.
  await page.getByRole('button', { name: 'Ubah nama scan-lama' }).click()
  await page.waitForTimeout(300)
  const libInput = page.getByLabel('Nama dokumen')
  await libInput.fill('Surat Tanah 2026')
  await libInput.press('Enter')
  await page.waitForTimeout(800)
  const afterLibrary = await page.getByText('Surat Tanah 2026').count()

  // 2. Survives a reload (written to IndexedDB, not just state).
  await page.reload()
  await page.waitForTimeout(1200)
  const afterReload = await page.getByText('Surat Tanah 2026').count()

  // 3. Rename again from the editor header.
  await page.getByText('Surat Tanah 2026').click()
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'Ubah nama Surat Tanah 2026' }).click()
  await page.waitForTimeout(300)
  const edInput = page.getByLabel('Nama dokumen')
  await edInput.fill('Akta Jual Beli')
  await edInput.press('Enter')
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'qa/9-rename.png' })

  // 4. The export sheet starts from the new name.
  await page.getByRole('button', { name: 'EKSPOR' }).click()
  await page.waitForTimeout(700)
  const exportName = await page.locator('#export-name').inputValue()

  // 5. Renaming in the export sheet renames the Dokumen itself, not just the file.
  await page.locator('#export-name').fill('Sertifikat Rumah')
  await page.locator('#export-name').press('Enter')
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'qa/10-export-name.png' })
  // Close the sheet by tapping the backdrop above it.
  await page.mouse.click(195, 12)
  await page.waitForTimeout(500)
  const headerName = await page.getByText('Sertifikat Rumah').count()
  await page.getByRole('button', { name: 'Kembali' }).click()
  await page.waitForTimeout(800)
  await page.reload()
  await page.waitForTimeout(1200)
  const afterExportRename = await page.getByText('Sertifikat Rumah').count()

  return { afterLibrary, afterReload, exportName, headerName, afterExportRename }
}
