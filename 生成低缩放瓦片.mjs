#!/usr/bin/env node
// 用 geojson-vt + vt-pbf 从全量 GeoJSON 切 z6–z9 矢量瓦片，补齐 pmtiles 缺失的低缩放级别
import fs from 'fs'
import path from 'path'
import geojsonvt from 'geojson-vt'
import vtpbf from 'vt-pbf'

const OUT = path.resolve(process.argv[2] || 'public/tiles')
const readSeq = (p) => ({
  type: 'FeatureCollection',
  features: fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)),
})

console.log('读取 GeoJSON…')
const natural = readSeq('/tmp/tilebuild/natural.geojsons')
const roads = readSeq('/tmp/tilebuild/roads.geojsons')

console.log('构建索引…')
const opts = { maxZoom: 9, tolerance: 3, extent: 4096, buffer: 64, indexMaxZoom: 9 }
const idxN = new geojsonvt(natural, opts)
const idxR = new geojsonvt(roads, opts)

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z)
const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}

// 覆盖 pmtiles 全域 bounds 111.775,21.759 – 114.741,24.487（略外扩）
let count = 0, bytes = 0
for (let z = 6; z <= 9; z++) {
  for (let x = lon2x(111.7, z); x <= lon2x(114.8, z); x++) {
    for (let y = lat2y(24.5, z); y <= lat2y(21.7, z); y++) {
      const tn = idxN.getTile(z, x, y)
      const tr = idxR.getTile(z, x, y)
      const layers = {}
      if (tn && tn.features.length) layers.natural = tn
      if (tr && tr.features.length) layers.roads = tr
      if (!Object.keys(layers).length) continue
      const buf = Buffer.from(vtpbf.fromGeojsonVt(layers))
      const dir = path.join(OUT, String(z), String(x))
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, y + '.pbf'), buf)
      count++; bytes += buf.length
      if (buf.length > 2 * 1024 * 1024) console.log(`  大瓦片警告 z${z}/${x}/${y}: ${(buf.length / 1048576).toFixed(1)}MB`)
    }
  }
  console.log(`z${z} 完成，累计 ${count} 片 ${(bytes / 1048576).toFixed(1)}MB`)
}
console.log(`总计 ${count} 片，${(bytes / 1048576).toFixed(1)}MB，输出到 ${OUT}`)
