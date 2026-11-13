// Does the browser actually offer the install prompt on this origin?
export default async function run(page) {
  const seen = []
  await page.exposeFunction('__bip', (v) => seen.push(v))
  await page.addInitScript(() => {
    addEventListener('beforeinstallprompt', () => window.__bip('beforeinstallprompt'))
  })
  await page.goto('http://localhost:4173/')
  await page.waitForTimeout(6000)

  const state = await page.evaluate(async () => {
    const sw = await navigator.serviceWorker.getRegistrations()
    return {
      standalone: matchMedia('(display-mode: standalone)').matches,
      swCount: sw.length,
      swScope: sw.map((r) => r.scope),
      controlled: !!navigator.serviceWorker.controller,
      manifest: document.querySelector('link[rel=manifest]')?.href ?? null,
      icons: await Promise.all(
        [...document.querySelectorAll('link[rel=icon]')].map(async (l) => {
          const r = await fetch(l.href)
          const b = await createImageBitmap(await r.blob())
          return `${b.width}x${b.height} ${r.status}`
        }),
      ),
    }
  })

  return { seen, state }
}
