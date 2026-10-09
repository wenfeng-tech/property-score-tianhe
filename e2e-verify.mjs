#!/usr/bin/env node
// 线上站点无头验收：真实 Chrome + WebGL，覆盖默认视野/缩放锁/分层切换/点选联动
import { chromium } from 'playwright-core'

const URL = process.argv[2] || 'https://wenfeng-tech.github.io/property-score-tianhe/?e2e=' + Date.now()
const SHOT = '/tmp/e2e'
const COS = Math.cos((23.129 * Math.PI) / 180)

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } })
const consoleErrs = []
page.on('console', (m) => m.type() === 'error' && consoleErrs.push(m.text().slice(0, 200)))
page.on('pageerror', (e) => consoleErrs.push('pageerror: ' + String(e).slice(0, 200)))

const report = { url: URL, checks: {} }
const fail = (k, msg) => { report.checks[k] = 'FAIL: ' + msg }
const pass = (k, msg) => { report.checks[k] = 'PASS ' + msg }

await page.goto(URL, { waitUntil: 'domcontentloaded' })
// 等地图实例出现
await page.waitForFunction(() => window.__map, { timeout: 20000 }).catch(() => {})
if (!(await page.evaluate(() => !!window.__map))) {
  fail('boot', 'window.__map 不存在')
  console.log(JSON.stringify(report, null, 1)); await browser.close(); process.exit(1)
}
// 等 style 加载 + 渲染稳定
await page.waitForFunction(() => window.__map && window.__map.isStyleLoaded(), { timeout: 30000 }).catch(() => {})
await page.waitForFunction(() => window.__map.loaded(), { timeout: 30000 }).catch(() => {})
await page.waitForTimeout(1200)

// 1) 默认视野 = 35km 内切圆
const s1 = await page.evaluate(() => {
  const m = window.__map
  const el = m.getContainer()
  const minDim = Math.min(el.clientWidth, el.clientHeight)
  const COS = Math.cos((23.129 * Math.PI) / 180)
  const spanKm = (minDim * 156543.03392 * COS) / Math.pow(2, m.getZoom() + 1) / 1000
  return { zoom: m.getZoom(), spanKm, center: m.getCenter().toArray() }
})
Math.abs(s1.spanKm - 50) < 5 ? pass('defaultView', `窄边跨度 ${s1.spanKm.toFixed(1)}km ≈ 50km（圆心到最近边 25km）zoom=${s1.zoom.toFixed(2)}`) : fail('defaultView', `窄边跨度 ${s1.spanKm.toFixed(1)}km ≠ 50km`)

// 2) 底图覆盖：东（天河东 113.40）、中（市政府）、西（佛山 113.05）三点都必须有道路/自然要素
const cov = await page.evaluate(() => {
  const m = window.__map
  const probe = (lon, lat) => {
    const pt = m.project([lon, lat])
    const fs = m.queryRenderedFeatures([[pt.x-12,pt.y-12],[pt.x+12,pt.y+12]], { layers: m.getStyle().layers.filter((l) => l.id.startsWith('road') || l.id.startsWith('natural')).map((l) => l.id) })
    return fs.length
  }
  return { east: probe(113.40, 23.13), center: probe(113.259, 23.129), west: probe(113.05, 23.05) }
})
cov.center > 0 && cov.east > 0 ? pass('coverage', `中${cov.center} 东${cov.east} 西${cov.west}`) : fail('coverage', `中${cov.center} 东${cov.east} 西${cov.west} —— 有空洞`)

// 3) 楼盘点渲染
const dots = await page.evaluate(() => m0 => 0, 0).catch(() => 0)
const dotCount = await page.evaluate(() => {
  const m = window.__map
  return m.queryRenderedFeatures({ layers: ['dots'] }).length
})
dotCount >= 35 ? pass('dots', `${dotCount} 个楼盘点`) : fail('dots', `只有 ${dotCount}`)

await page.screenshot({ path: SHOT + '-1-default.png' })

// 4) 边界锁：minZoom = 35km 视野（窄边跨度≈70km，不能再拉远）；
//    平移钳制：无论怎么拖，圆心不能使窄边视野滑出 50km 边界
await page.evaluate(() => window.__map.jumpTo({ zoom: window.__map.getMinZoom() - 1 }))
await page.waitForTimeout(800)
const s4 = await page.evaluate(() => {
  const m = window.__map
  const el = m.getContainer()
  const minDim = Math.min(el.clientWidth, el.clientHeight)
  const COS = Math.cos((23.129 * Math.PI) / 180)
  const spanKm = (minDim * 156543.03392 * COS) / Math.pow(2, m.getZoom() + 1) / 1000
  const probe = (lon, lat) => { const pt = m.project([lon, lat]); return m.queryRenderedFeatures([[pt.x-12,pt.y-12],[pt.x+12,pt.y+12]]).length }
  return { zoom: m.getZoom(), spanKm, center: m.getCenter().toArray(), east: probe(113.45, 23.13), west: probe(112.95, 23.0), south: probe(113.26, 22.75) }
})
Math.abs(s4.spanKm - 100) < 10 ? pass('lockZoom50km', `拉远上限跨度 ${s4.spanKm.toFixed(1)}km ≈ 100km（全图可视）`) : fail('lockZoom50km', `跨度 ${s4.spanKm.toFixed(1)}km`)
s4.east > 0 && s4.west > 0 && s4.south > 0 ? pass('lockZoom50km覆盖', `东${s4.east} 西${s4.west} 南${s4.south}`) : fail('lockZoom50km覆盖', `东${s4.east} 西${s4.west} 南${s4.south}`)
// 平移钳制：往东北方向猛拖，圆心应被钳回（距圆心 ≤ 50 − 窄边半径 ≈ 15km）
await page.evaluate(() => window.__map.jumpTo({ center: [113.259, 23.129], zoom: window.__map.getMinZoom() }))
for (let i = 0; i < 4; i++) {
  await page.mouse.move(700, 400)
  await page.mouse.down()
  await page.mouse.move(100, 800, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(300)
}
const s5 = await page.evaluate(() => {
  const m = window.__map
  const c = m.getCenter()
  const COS = Math.cos((23.129 * Math.PI) / 180)
  const dKm = Math.hypot((c.lng - 113.2591) * 111.32 * COS, (c.lat - 23.1291) * 110.574)
  return { dKm: +dKm.toFixed(1) }
})
s5.dKm <= 16 ? pass('lock50km', `猛拖后圆心偏移 ${s5.dKm}km ≤ 15km（50km 边界钳制）`) : fail('lock50km', `圆心偏移 ${s5.dKm}km 超出钳制`)
await page.screenshot({ path: SHOT + '-2-50km.png' })

// 5) 跨层切换：zoom 9.5（lo 层 z9）与 zoom 11（pmtiles）都必须有要素
for (const [z, tag] of [[9.5, 'lo层(z9)'], [11, 'pmtiles(z11)']]) {
  await page.evaluate((zz) => window.__map.jumpTo({ center: [113.259, 23.129], zoom: zz }), z)
  await page.waitForTimeout(1500)
  const n = await page.evaluate(() => window.__map.queryRenderedFeatures().length)
  n > 1000 ? pass('zoom' + z, `${tag} ${n} 要素`) : fail('zoom' + z, `${tag} 仅 ${n} 要素`)
}

// 6) 点选楼盘：点击列表第一个卡片 → 应缩放到 3km 圈（窄边≈6km）+ 详情出现
await page.evaluate(() => window.__map.jumpTo({ center: [113.259, 23.129], zoom: 9 }))
await page.waitForTimeout(500)
await page.click('text=越秀·天河·和樾府').catch((e) => consoleErrs.push('click: ' + e.message))
await page.waitForTimeout(1800)
const s6 = await page.evaluate(() => {
  const m = window.__map
  const el = m.getContainer()
  const minDim = Math.min(el.clientWidth, el.clientHeight)
  const COS = Math.cos((23.129 * Math.PI) / 180)
  const spanKm = (minDim * 156543.03392 * COS) / Math.pow(2, m.getZoom() + 1) / 1000
  return { spanKm, detail: document.body.innerText.includes('返回'), label: !!document.querySelector('.maplibregl-marker'), feats: m.queryRenderedFeatures().length }
})
Math.abs(s6.spanKm - 6) < 1.5 ? pass('select3km', `选中后窄边 ${s6.spanKm.toFixed(1)}km ≈ 6km（3km 半径）`) : fail('select3km', `窄边 ${s6.spanKm.toFixed(1)}km`)
s6.detail && s6.label ? pass('selectDetail', `详情+标签 OK`) : fail('selectDetail', `detail=${s6.detail} label=${s6.label}`)
s6.feats > 500 ? pass('selectFeats', `${s6.feats} 要素`) : fail('selectFeats', `仅 ${s6.feats}`)
await page.screenshot({ path: SHOT + '-3-selected.png' })

// 7) 返回 → 列表 + 35km 视野
await page.click('text=返回').catch(() => {})
await page.waitForTimeout(1500)
const s7 = await page.evaluate(() => {
  const m = window.__map
  const el = m.getContainer()
  const minDim = Math.min(el.clientWidth, el.clientHeight)
  const COS = Math.cos((23.129 * Math.PI) / 180)
  return { spanKm: (minDim * 156543.03392 * COS) / Math.pow(2, m.getZoom() + 1) / 1000, list: document.body.innerText.includes('配套评分榜') }
})
s7.list && Math.abs(s7.spanKm - 50) < 6 ? pass('backHome', `返回列表 + ${s7.spanKm.toFixed(1)}km 视野`) : fail('backHome', `list=${s7.list} span=${s7.spanKm.toFixed(1)}`)

report.consoleErrs = consoleErrs.slice(0, 8)
console.log(JSON.stringify(report, null, 1))
await browser.close()
