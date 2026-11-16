// Click the title text in the editor header and check the inline input opens.
export default async function run(page, ui) {
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
        c.width = 600
        c.height = 800
        const x = c.getContext('2d')
        x.fillStyle = '#fff'
        x.fillRect(0, 0, 600, 800)
        c.toBlob((b) => res(b), 'image/jpeg', 0.9)
      })
    const put = (s, v) =>
      new Promise((res) => {
        const tx = db.transaction(s, 'readwrite')
        tx.objectStore(s).put(v)
        tx.oncomplete = () => res()
      })
    await put('pages', {
      id: 'ck-p1',
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
      id: 'ck-doc',
      name: 'Dokumen Uji',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pages: ['ck-p1'],
    })
  })

  await page.goto('http://localhost:5174/#/doc/ck-doc')
  await page.waitForTimeout(1500)

  // In the editor the pencil opens the inline rename, not the title text.
  await page.getByRole('button', { name: 'Ubah nama Dokumen Uji' }).click()
  await page.waitForTimeout(400)
  const inputVisible = await page.getByLabel('Nama dokumen').count()
  const selected = await page.getByLabel('Nama dokumen').evaluate((el) => {
    return el.selectionStart === 0 && el.selectionEnd === el.value.length
  })
  await page.screenshot({ path: 'qa/11-rename-click.png' })

  return { inputVisible, selected }
}
