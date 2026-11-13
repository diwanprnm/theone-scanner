// Headless Chromium never fires the real beforeinstallprompt, so synthesize one
// and check what the app does with it. Read the result from the DOM, not from
// window: this driver evaluates in an isolated world and cannot see app globals.
export default async function run(page) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://localhost:4173/')
  await page.waitForTimeout(1200)

  const msgVisible = () => page.evaluate(() => !!document.querySelector('[aria-label="Tutup pesan"]'))

  // 1. No event: the button explains the browser path instead of installing.
  await page.locator('[aria-label="Pasang aplikasi"]').click()
  await page.waitForTimeout(300)
  const hintShown = await msgVisible()
  const hintText = hintShown ? await page.locator('[aria-label="Tutup pesan"]').locator('..').innerText() : null
  if (hintShown) await page.locator('[aria-label="Tutup pesan"]').click()
  await page.waitForTimeout(200)

  // 2. A real prompt event arrives: the button must use it, so no hint appears.
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true })
    e.prompt = () => Promise.resolve()
    e.userChoice = Promise.resolve({ outcome: 'accepted' })
    dispatchEvent(e)
  })
  await page.waitForTimeout(400)
  await page.locator('[aria-label="Pasang aplikasi"]').click()
  await page.waitForTimeout(400)
  const hintAfterPrompt = await msgVisible()

  // 3. Installed: the button is gone.
  await page.evaluate(() => dispatchEvent(new Event('appinstalled')))
  await page.waitForTimeout(400)
  const fabGone = !(await page.locator('[aria-label="Pasang aplikasi"]').count())

  await page.screenshot({ path: 'qa/7-install.png' })
  return { hintShown, hintText, hintAfterPrompt, fabGone }
}
