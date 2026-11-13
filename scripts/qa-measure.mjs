// Seed then measure the editor layout at phone size.
export default async function run(page, ui) {
  await page.goto('http://localhost:4173/')
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
        c.width = 1200
        c.height = 1600
        const x = c.getContext('2d')
        x.fillStyle = '#fff'
        x.fillRect(0, 0, 1200, 1600)
        x.fillStyle = '#111'
        x.font = 'bold 40px serif'
        x.fillText(kind === 0 ? 'KEMENTERIAN ARSIP' : 'SURAT PERJANJIAN', 70, 120)
        x.font = '18px serif'
        for (let i = 0; i < 28; i++) {
          x.fillStyle = i % 5 === 0 ? '#333' : '#888'
          x.fillRect(70, 180 + i * 26, 380 + ((i * 71) % 400), 7)
        }
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
        size: { w: 1200, h: 1600 },
        src: await mk(i),
        crop: [
          { x: 0, y: 0 },
          { x: 1200, y: 0 },
          { x: 1200, y: 1600 },
          { x: 0, y: 1600 },
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
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://localhost:4173/#/doc/qa-doc-1')
  await page.waitForTimeout(1400)

  const m = await page.evaluate(() => {
    const root = document.getElementById('root')
    const shell = root.firstElementChild
    const kids = [...shell.children].map((e) => ({
      tag: e.tagName,
      cls: e.className.slice(0, 30),
      top: Math.round(e.getBoundingClientRect().top),
      h: Math.round(e.getBoundingClientRect().height),
    }))
    return { winH: innerHeight, shellH: Math.round(shell.getBoundingClientRect().height), kids }
  })
  return m
}
