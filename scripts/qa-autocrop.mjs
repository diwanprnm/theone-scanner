// Uploads a synthetic "photo": a tilted bright sheet on a dark desk. Auto crop
// must land on the sheet, not on the full frame.
export default async function run(page) {
  await page.setViewportSize({ width: 390, height: 844 })
  // First load at #/doc/new already creates the doc and opens Capture; a reload
  // would land on the saved doc in view mode instead.
  await page.goto('http://localhost:4173/#/doc/new')
  await page.waitForTimeout(2500)

  // Build the photo as a PNG in the page, then hand it to the file input.
  const dataUrl = await page.evaluate(() => {
    const w = 900
    const h = 1200
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const x = c.getContext('2d')
    x.fillStyle = '#3a3a3a'
    x.fillRect(0, 0, w, h)
    // Tilted sheet.
    x.save()
    x.translate(w / 2, h / 2)
    x.rotate(-0.07)
    x.fillStyle = '#f4f4ef'
    x.fillRect(-330, -460, 660, 920)
    x.fillStyle = '#222'
    for (let i = 0; i < 16; i++) x.fillRect(-270, -360 + i * 44, 480, 7)
    x.restore()
    return c.toDataURL('image/png')
  })

  const buf = Buffer.from(dataUrl.split(',')[1], 'base64')
  await page.locator('input[type=file]').first().setInputFiles({
    name: 'foto.png',
    mimeType: 'image/png',
    buffer: buf,
  })
  await page.waitForTimeout(2500)

  // The new page opens in view mode; open the crop screen to read the quad.
  const crop = page.getByRole('button', { name: 'Potong', exact: true })
  const hasCrop = (await crop.count()) > 0
  if (hasCrop) {
    await crop.click()
    await page.waitForTimeout(1200)
  }

  const readout = hasCrop ? await page.locator('text=/\\d+ × \\d+ px/').first().innerText() : null
  await page.screenshot({ path: 'qa/8-autocrop.png' })

  // Full frame would be 900x1200 → ratio 0.75. The sheet is 660x920 → ratio 0.717.
  const m = readout?.match(/(\d+) × (\d+) px/)
  const ratio = m ? Number(m[1]) / Number(m[2]) : null
  return { hasCrop, readout, ratio, sheetRatio: 660 / 920 }
}
