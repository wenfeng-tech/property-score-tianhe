import { chromium } from 'playwright-core'
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader'] })
const pg = await b.newPage({ viewport: { width: 1600, height: 1000 } })
await pg.goto(process.argv[2], { waitUntil: 'networkidle' })
await pg.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 })
await pg.waitForTimeout(1200)
// 拉远到上限（全图可视）后点选楼盘
await pg.evaluate(() => window.__map.jumpTo({ zoom: window.__map.getMinZoom() }))
await pg.waitForTimeout(600)
await pg.click('text=越秀·天河·和樾府')
await pg.waitForTimeout(2000)
const r = await pg.evaluate(() => {
  const m = window.__map, c = m.getContainer()
  const minDim = Math.min(c.clientWidth, c.clientHeight)
  const COS = Math.cos(23.129 * Math.PI / 180)
  return { spanKm: +(minDim * 156543.03392 * COS / Math.pow(2, m.getZoom() + 1) / 1000).toFixed(1), center: m.getCenter().lng.toFixed(3) }
})
console.log(JSON.stringify(r))
await b.close()
