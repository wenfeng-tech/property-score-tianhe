import { chromium } from 'playwright-core'
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader'] })
const pg = await b.newPage({ viewport: { width: 1426, height: 1564 } })
await pg.goto(process.argv[2], { waitUntil: 'networkidle' })
await pg.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 })
const r = await pg.evaluate(() => {
  const m = window.__map
  const c = m.getContainer()
  const COS = Math.cos(23.1291 * Math.PI / 180)
  const z = Math.log2((156543.03392 * COS * Math.min(c.clientWidth, c.clientHeight)) / 70000) - 1
  const before = m.getZoom()
  m.jumpTo({ center: [113.2591, 23.1291], zoom: z })
  const after = m.getZoom()
  // 实测：正北 35km 点投影后的 y 坐标
  const p = m.project([113.2591, 23.1291 + 35 / 110.574])
  return { computedZoom: +z.toFixed(3), before: +before.toFixed(3), afterJump: +after.toFixed(3), rimY: +p.y.toFixed(1), h: c.clientHeight, cssZoom: getComputedStyle(c).zoom, transform: getComputedStyle(c).transform }
})
console.log(JSON.stringify(r))
await b.close()
