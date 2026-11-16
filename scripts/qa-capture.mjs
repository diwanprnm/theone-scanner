// Capture screen has no camera in headless, so check the fallback path renders.
export default async function run(page, ui) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://localhost:5174/#/doc/new')
  await page.waitForTimeout(2200)
  await page.screenshot({ path: 'qa/6-capture.png' })
  const snap = await ui.snapshot()
  return { snap }
}
