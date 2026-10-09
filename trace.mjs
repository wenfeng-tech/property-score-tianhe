import { chromium } from 'playwright-core'
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader'] })
const pg = await b.newPage({ viewport: { width: 1600, height: 1000 } })
pg.on('pageerror', e => console.log('PAGEERR', e.message))
await pg.goto(process.argv[2], { waitUntil: 'networkidle' })
await pg.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 })
await pg.waitForTimeout(1200)
await pg.evaluate(() => window.__map.jumpTo({ center: [113.259, 23.129], zoom: 9 }))
await pg.waitForTimeout(500)
await pg.click('text=越秀·天河·和樾府')
const log = await pg.evaluate(() => new Promise(done => {
  const m = window.__map, out = [], t0 = performance.now()
  const iv = setInterval(() => {
    out.push([Math.round(performance.now()-t0), +m.getZoom().toFixed(2), m.getCenter().lng.toFixed(3), m.getCenter().lat.toFixed(3)])
    if (performance.now()-t0 > 3000) { clearInterval(iv); done(out) }
  }, 150)
}))
console.log(log.map(r=>r.join(' ')).join('\n'))
await b.close()
