#!/usr/bin/env node
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } })
const bad = []
page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()) })
const tileReqs = []
page.on('request', (r) => { if (r.url().includes('.pbf') || r.url().includes('/tiles/')) tileReqs.push(r.url()) })
await page.goto('https://wenfeng-tech.github.io/property-score-tianhe/?probe=' + Date.now(), { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__map, { timeout: 20000 })
await page.waitForFunction(() => window.__map.isStyleLoaded(), { timeout: 30000 }).catch(() => {})
await page.evaluate(() => window.__map.jumpTo({ center: [113.259, 23.129], zoom: 9 }))
await page.waitForTimeout(2500)
const src = await page.evaluate(() => {
  const m = window.__map
  const s = m.getSource('lobase')
  return { tiles: s?.tiles, minzoom: s?.minzoom, maxzoom: s?.maxzoom, zoom: m.getZoom() }
})
// 页面内直接 fetch 一张瓦片看状态
const direct = await page.evaluate(async () => {
  const r = await fetch('./tiles/9/417/222.pbf')
  return r.status + ' ' + r.headers.get('content-type')
})
console.log(JSON.stringify({ src, direct, tileReqs: tileReqs.slice(0, 10), tileReqCount: tileReqs.length, bad: bad.slice(0, 10) }, null, 1))
await browser.close()
