import { chromium } from 'playwright-core'
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader'] })
const pg = await b.newPage({ viewport: { width: 1426, height: 1564 } })
await pg.goto(process.argv[2], { waitUntil: 'networkidle' })
await pg.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 })
await pg.waitForTimeout(2500)
const r = await pg.evaluate(() => {
  const m = window.__map
  const c = m.getContainer()
  const cv = m.getCanvas()
  const COS = Math.cos(23.1291 * Math.PI / 180)
  const degLat = (km) => km / 110.574
  const degLon = (km) => km / (111.32 * COS)
  const before = m.getZoom()
  m.fitBounds([[113.2591 - degLon(35), 23.1291 - degLat(35)], [113.2591 + degLon(35), 23.1291 + degLat(35)]], { animate: false })
  const after = m.getZoom()
  return { container: [c.clientWidth, c.clientHeight], canvas: [cv.width, cv.height, cv.style.width, cv.style.height], before: +before.toFixed(3), afterFit: +after.toFixed(3), devicePixelRatio: window.devicePixelRatio }
})
console.log(JSON.stringify(r))
await b.close()
