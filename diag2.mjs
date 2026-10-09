import { chromium } from 'playwright-core'
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader'] })
const pg = await b.newPage({ viewport: { width: 1426, height: 1564 } })
await pg.goto(process.argv[2], { waitUntil: 'domcontentloaded' })
// 在地图创建前后持续采样容器尺寸；地图出现后挂 resize 监听
const samples = await pg.evaluate(() => new Promise((done) => {
  const log = []
  const t0 = performance.now()
  const iv = setInterval(() => {
    const m = window.__map
    const el = m ? m.getContainer() : document.querySelector('canvas')?.parentElement
    log.push([Math.round(performance.now() - t0), m ? +m.getZoom().toFixed(3) : null, el ? el.clientWidth + 'x' + el.clientHeight : 'no-el'])
    if (m && !m.__diagHooked) { m.__diagHooked = true; m.on('resize', () => log.push([Math.round(performance.now()-t0), 'RESIZE', el.clientWidth+'x'+el.clientHeight, +m.getZoom().toFixed(3)])) }
    if (performance.now() - t0 > 6000) { clearInterval(iv); done(log) }
  }, 200)
}))
await pg.waitForTimeout(1000)
console.log(JSON.stringify(samples.filter((s,i,a)=>i===0||JSON.stringify(s)!==JSON.stringify(a[i-1]))))
await b.close()
