import { chromium } from 'playwright-core'
const url = process.argv[2]
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader'] })
const pg = await b.newPage({ viewport: { width: 1426, height: 1564 } })
await pg.goto(url, { waitUntil: 'networkidle' })
await pg.waitForFunction(() => (window).__map && window.__map.loaded(), null, { timeout: 30000 })
await pg.waitForTimeout(2500) // 等容器稳定 + RO 重拟合
const r = await pg.evaluate(() => {
  const m = (window).__map
  const b = m.getBounds()
  const c = m.getContainer()
  const COS = Math.cos(23.1291 * Math.PI / 180)
  const halfLonKm = (b.getEast() - b.getWest()) / 2 * 111.32 * COS
  const halfLatKm = (b.getNorth() - b.getSouth()) / 2 * 110.574
  const has = (id) => !!m.getLayer(id)
  return {
    w: c.clientWidth, h: c.clientHeight, zoom: +m.getZoom().toFixed(2),
    halfKm: +Math.min(halfLonKm, halfLatKm).toFixed(1),
    center: [m.getCenter().lng.toFixed(4), m.getCenter().lat.toFixed(4)],
    layers: { ring: has('home-ring'), radius: has('home-ring-radius'), center: has('home-ring-center') },
    tag: [...document.querySelectorAll('.maplibregl-marker')].some(e => e.textContent.includes('35')),
  }
})
console.log(JSON.stringify(r))
await pg.screenshot({ path: '/tmp/e2e-portrait.png' })
await b.close()
