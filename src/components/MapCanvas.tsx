import { useEffect, useMemo, useRef } from 'react'
import { GridIndex, GZ_GOV, haversine, fmtDist } from '../lib/geo'
import { DIMS, DIM_COLORS, DIM_NAMES } from '../lib/scoring'
import type { BaseFeature, Listing, POISet, ListingScore } from '../types'

const BASE_COLORS: Record<string, string> = {
  residential: '#f2a24a', commercial: '#e23b46', industrial: '#9aa7b4',
  government: '#7d3fb0', education: '#f6c62b', healthcare: '#ef6aa8',
  park: '#7cc24a', green: '#2f8f5c', water: '#8ec4e6',
  transport: '#c9c9c9', tourism: '#c084e8',
}
// 楼盘评分冷色系渐变：低分浅青 → 高分深蓝
function scoreCool(s: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, (s - 40) / 55))
  const low = [147, 197, 253], high = [30, 64, 175] // blue-300 → blue-800
  return [
    Math.round(low[0] + (high[0] - low[0]) * t),
    Math.round(low[1] + (high[1] - low[1]) * t),
    Math.round(low[2] + (high[2] - low[2]) * t),
  ]
}
const scoreCoolCss = (s: number) => { const [r, g, b] = scoreCool(s); return `rgb(${r},${g},${b})` }
const RADIUS_STEPS = [5, 15, 35, 50]
const MAX_KM = 50 // 最大边界：缩放/平移都不可越过 50km 范围

interface Props {
  base: BaseFeature[]
  listings: Listing[]
  pois: POISet | null
  selectedId: number | null
  hoverId: number | null
  presetKm: number          // 点选的目标档位
  currentKm: number
  dimVis: Record<string, boolean>
  scores: Map<number, ListingScore> | null
  onSelect: (id: number | null) => void
  onHover: (id: number | null) => void
  onPreset: (km: number) => void
  onKmChange: (km: number) => void
}

interface View { cx: number; cy: number; scale: number }

function geomCentroid(g: { type: string; coordinates: any }): [number, number] | null {
  const ring = g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiPolygon' ? g.coordinates[0][0] : null
  if (!ring) return null
  let a = 0, x = 0, y = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cr = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
    a += cr; x += (ring[j][0] + ring[i][0]) * cr; y += (ring[j][1] + ring[i][1]) * cr
  }
  a *= 3
  return a ? [x / a, y / a] : ring[0]
}

export default function MapCanvas(props: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const cvRef = useRef<HTMLCanvasElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<View>({ cx: GZ_GOV.lon, cy: GZ_GOV.lat, scale: 0 })
  const propsRef = useRef(props)
  propsRef.current = props
  const lastKmRef = useRef(0)

  const grid = useMemo(() => new GridIndex(props.base, (b) => b.g), [props.base])
  const gridRef = useRef(grid)
  gridRef.current = grid

  const districtLabels = useMemo(() => {
    const out: { n: string; lon: number; lat: number }[] = []
    for (const b of props.base) {
      if (b.c === 'boundary' && b.n) {
        const c = geomCentroid(b.g)
        if (c) out.push({ n: b.n, lon: c[0], lat: c[1] })
      }
    }
    return out
  }, [props.base])

  // 选中楼盘 5km 内 POI
  const nearPois = useMemo(() => {
    const { pois, listings, selectedId } = props
    if (!pois || selectedId == null) return []
    const l = listings.find((x) => x.id === selectedId)
    if (!l) return []
    const out: { cat: string; n: string; lon: number; lat: number; dist: number }[] = []
    for (const cat of Object.keys(pois) as (keyof POISet)[]) {
      for (const p of pois[cat]) {
        const d = haversine(l.lon, l.lat, p.lon, p.lat)
        if (d <= 5000) out.push({ cat, n: p.n, lon: p.lon, lat: p.lat, dist: d })
      }
    }
    return out
  }, [props.pois, props.selectedId, props.listings])
  const nearPoisRef = useRef(nearPois)
  nearPoisRef.current = nearPois

  // ---------- 圆：屏幕固定 ----------
  const circlePx = () => {
    const r = wrapRef.current!.getBoundingClientRect()
    return { x: r.width / 2, y: r.height / 2, R: Math.min(r.width, r.height) * 0.4 }
  }
  const scaleForKm = (km: number) => {
    const { R } = circlePx()
    return (R * 111320) / (km * 1000)
  }
  const kmForScale = (scale: number) => {
    const { R } = circlePx()
    return (R * 111320) / (scale * 1000)
  }
  const minScale = () => scaleForKm(MAX_KM)
  const maxScale = () => scaleForKm(0.8)

  function clampView(v: View) {
    // 缩放限制：最大到 50km 框
    v.scale = Math.max(minScale(), Math.min(maxScale(), v.scale))
    // 平移限制：视图中心不可滑出 50km 边界（留 8km 余量保证圆内有内容）
    const d = haversine(v.cx, v.cy, GZ_GOV.lon, GZ_GOV.lat)
    const maxD = (MAX_KM - 8) * 1000
    if (d > maxD) {
      const k = maxD / d
      v.cx = GZ_GOV.lon + (v.cx - GZ_GOV.lon) * k
      v.cy = GZ_GOV.lat + (v.cy - GZ_GOV.lat) * k
    }
  }

  function reportKm() {
    const km = kmForScale(viewRef.current.scale)
    if (Math.abs(km - lastKmRef.current) / lastKmRef.current > 0.01 || Math.abs(km - lastKmRef.current) > 0.2) {
      lastKmRef.current = km
      propsRef.current.onKmChange(km)
    }
  }

  function fitView() {
    const v = viewRef.current
    v.cx = GZ_GOV.lon
    v.cy = GZ_GOV.lat
    v.scale = scaleForKm(propsRef.current.presetKm)
    clampView(v)
    draw()
    reportKm()
  }

  useEffect(() => {
    if (viewRef.current.scale === 0) fitView()
    else draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 档位点选 → 缩放地图让固定圆对应该公里数
  const firstPreset = useRef(true)
  useEffect(() => {
    if (firstPreset.current) { firstPreset.current = false; return }
    const v = viewRef.current
    flyView(v.cx, v.cy, scaleForKm(props.presetKm))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.presetKm])

  // 选中楼盘：大视野（>8km）时自动缩放到楼盘周边 5km 默认视野；小视野仅平移
  // 取消选中：飞回广州市政府圆心，恢复当前档位视野
  const firstSel = useRef(true)
  useEffect(() => {
    if (firstSel.current) { firstSel.current = false; return } // 跳过首次挂载
    const { listings, selectedId } = props
    const v = viewRef.current
    if (selectedId != null) {
      const l = listings.find((x) => x.id === selectedId)
      if (!l) return
      const kmNow = kmForScale(v.scale)
      if (kmNow > 8) {
        flyView(l.lon, l.lat, scaleForKm(5)) // 50km 等大视野 → 默认 5km 配套视野
      } else {
        const r = wrapRef.current!.getBoundingClientRect()
        const x = X(l.lon, r.width), y = Y(l.lat, r.height)
        if (Math.abs(x - r.width / 2) > r.width * 0.3 || Math.abs(y - r.height / 2) > r.height * 0.3) {
          flyView(l.lon, l.lat, v.scale)
        } else draw()
      }
    } else {
      flyView(GZ_GOV.lon, GZ_GOV.lat, scaleForKm(propsRef.current.presetKm))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.selectedId])

  const animRef = useRef<number>(0)
  function flyView(lon: number, lat: number, scale: number) {
    const v = viewRef.current
    const s0 = { ...v }
    const t0 = performance.now()
    cancelAnimationFrame(animRef.current)
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 550)
      const e = 1 - Math.pow(1 - k, 3)
      v.cx = s0.cx + (lon - s0.cx) * e
      v.cy = s0.cy + (lat - s0.cy) * e
      v.scale = s0.scale * Math.pow(scale / s0.scale, e)
      clampView(v)
      draw()
      if (k < 1) animRef.current = requestAnimationFrame(step)
      else reportKm()
    }
    animRef.current = requestAnimationFrame(step)
  }

  // ---------- 投影 ----------
  const cosLat = () => Math.cos((viewRef.current.cy * Math.PI) / 180)
  const X = (lon: number, w: number) => w / 2 + (lon - viewRef.current.cx) * cosLat() * viewRef.current.scale
  const Y = (lat: number, h: number) => h / 2 - (lat - viewRef.current.cy) * viewRef.current.scale
  const km2px = (km: number) => ((km * 1000) / 111320) * viewRef.current.scale

  // ---------- 绘制 ----------
  function draw() {
    const cv = cvRef.current, el = wrapRef.current
    if (!cv || !el) return
    const p = propsRef.current
    const r = el.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    if (cv.width !== r.width * dpr || cv.height !== r.height * dpr) {
      cv.width = r.width * dpr
      cv.height = r.height * dpr
    }
    const ctx = cv.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, r.width, r.height)
    ctx.fillStyle = '#f6f6f4'
    ctx.fillRect(0, 0, r.width, r.height)
    const v = viewRef.current
    if (v.scale === 0) return
    const pxPerKm = km2px(1)
    const pad = 0.02
    const minX = v.cx - (r.width / 2 / v.scale) / cosLat() - pad
    const maxX = v.cx + (r.width / 2 / v.scale) / cosLat() + pad
    const minY = v.cy - r.height / 2 / v.scale - pad
    const maxY = v.cy + r.height / 2 / v.scale + pad
    const inView = gridRef.current.query(minX, minY, maxX, maxY)

    const pathGeom = (g: { type: string; coordinates: any }) => {
      const ring = (rr: number[][]) => {
        ctx.beginPath()
        rr.forEach((c, i) => {
          const x = X(c[0], r.width), y = Y(c[1], r.height)
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
        })
        ctx.closePath()
      }
      if (g.type === 'Polygon') g.coordinates.forEach(ring)
      else if (g.type === 'MultiPolygon') g.coordinates.forEach((pp: number[][][]) => pp.forEach(ring))
    }
    const strokeLines = (f: BaseFeature, color: string, width: number, alpha: number, dash: number[] = []) => {
      const g = f.g
      const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates
      ctx.strokeStyle = color
      ctx.globalAlpha = alpha
      ctx.lineWidth = width
      ctx.lineCap = 'round'
      ctx.setLineDash(dash)
      for (const ln of lines) {
        ctx.beginPath()
        ln.forEach((c: number[], i: number) => {
          const x = X(c[0], r.width), y = Y(c[1], r.height)
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
        })
        ctx.stroke()
      }
      ctx.setLineDash([])
      ctx.globalAlpha = 1
    }

    // 1. 用地色块
    const areas = inView.filter((f) => f.g.type !== 'LineString' && f.g.type !== 'MultiLineString')
    areas.sort((a, b) => (a.c === 'water' ? -1 : b.c === 'water' ? 1 : 0))
    for (const f of areas) {
      if (f.c === 'boundary') continue
      pathGeom(f.g)
      ctx.fillStyle = BASE_COLORS[f.c] || '#eaeae8'
      // 水体 / 绿地山体更醒目，其余色块保持淡雅
      ctx.globalAlpha = f.c === 'water' || f.c === 'green' || f.c === 'park' ? 0.95 : 0.7
      ctx.fill()
      ctx.globalAlpha = 1
    }
    // 2. 骨架线网：水系 → 主干道 → 小区道路（高倍率）→ 铁路 → 地铁（深色骨架）
    for (const f of inView) {
      if (f.g.type !== 'LineString' && f.g.type !== 'MultiLineString') continue
      if (f.c === 'water' || f.c === 'water_line') strokeLines(f, '#4f9fd8', Math.max(1.6, pxPerKm * 0.14), 1)
    }
    for (const f of inView) {
      if (f.c !== 'road_major') continue
      strokeLines(f, '#ffffff', Math.max(2, pxPerKm * 0.18), 0.85)
      strokeLines(f, '#636363', Math.max(1.1, pxPerKm * 0.09), 0.95)
    }
    if (pxPerKm > 55)
      for (const f of inView) {
        if (f.c !== 'road_minor') continue
        strokeLines(f, '#9d9d9d', 0.8, 0.8)
      }
    for (const f of inView) {
      if (f.c !== 'rail') continue
      strokeLines(f, '#6f6f6f', 1.2, 0.85, [6, 4])
    }
    for (const f of inView) {
      if (f.c !== 'subway') continue
      strokeLines(f, '#ffffff', Math.max(2.2, pxPerKm * 0.2), 0.9)
      strokeLines(f, '#3f3f3f', Math.max(1.1, pxPerKm * 0.09), 0.95)
    }
    // 3. 区界（弱化）
    for (const f of inView) {
      if (f.c !== 'boundary') continue
      pathGeom(f.g)
      ctx.strokeStyle = 'rgba(90,90,90,0.28)'
      ctx.lineWidth = 0.8
      ctx.setLineDash([2, 4])
      ctx.stroke()
      ctx.setLineDash([])
    }

    // 4. 区名（远景）+ 地铁站名（近景），都压在淡化层下
    if (pxPerKm < 55) {
      ctx.textAlign = 'center'
      for (const d of districtLabels) {
        const x = X(d.lon, r.width), y = Y(d.lat, r.height)
        if (x < 0 || x > r.width || y < 0 || y > r.height) continue
        ctx.font = '600 15px -apple-system, "PingFang SC", sans-serif'
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'
        ctx.lineWidth = 4
        ctx.strokeText(d.n, x, y)
        ctx.fillStyle = 'rgba(95,95,95,0.65)'
        ctx.fillText(d.n, x, y)
      }
    }
    if (pxPerKm > 100 && p.pois) {
      ctx.font = '10.5px -apple-system, "PingFang SC", sans-serif'
      ctx.textAlign = 'center'
      const occ: Record<string, boolean> = {}
      for (const m of p.pois.metro) {
        const x = X(m.lon, r.width), y = Y(m.lat, r.height)
        if (x < 20 || x > r.width - 20 || y < 14 || y > r.height - 8) continue
        const k = `${Math.round(x / 84)}_${Math.round(y / 22)}`
        if (occ[k]) continue
        occ[k] = true
        const tw = ctx.measureText(m.n).width
        ctx.fillStyle = 'rgba(255,255,255,0.92)'
        ctx.strokeStyle = 'rgba(120,120,120,0.7)'
        ctx.lineWidth = 0.8
        ctx.beginPath()
        ctx.rect(x - tw / 2 - 3, y - 15, tw + 6, 14)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = '#333'
        ctx.fillText(m.n, x, y - 4)
        ctx.beginPath()
        ctx.arc(x, y, 2.5, 0, Math.PI * 2)
        ctx.fillStyle = '#3b82f6'
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }

    // 5. 范围圈（屏幕固定，单个，无副圈）：圆外淡化 + 主虚线框
    const { x: ccx, y: ccy, R: Rp } = circlePx()
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, r.width, r.height)
    ctx.arc(ccx, ccy, Rp, 0, Math.PI * 2, true)
    ctx.fillStyle = 'rgba(255,255,255,0.74)'
    ctx.fill('evenodd')
    const grad = ctx.createRadialGradient(ccx, ccy, Math.max(0, Rp - 60), ccx, ccy, Rp + 40)
    grad.addColorStop(0, 'rgba(255,255,255,0)')
    grad.addColorStop(1, 'rgba(255,255,255,0.55)')
    ctx.beginPath()
    ctx.rect(0, 0, r.width, r.height)
    ctx.arc(ccx, ccy, Rp, 0, Math.PI * 2, true)
    ctx.fillStyle = grad
    ctx.fill('evenodd')
    ctx.restore()
    ctx.beginPath()
    ctx.arc(ccx, ccy, Rp, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(226,59,70,0.85)' // 设计图同款红色虚线框
    ctx.lineWidth = 1.8
    ctx.setLineDash([8, 6])
    ctx.stroke()
    ctx.setLineDash([])
    // 半径标注（实时公里数）
    const kmNow = kmForScale(v.scale)
    ctx.font = '600 12px -apple-system, "PingFang SC", sans-serif'
    ctx.textAlign = 'left'
    const label = `${kmNow >= 10 ? Math.round(kmNow) : kmNow.toFixed(1)}km 范围圈`
    const ltw = ctx.measureText(label).width
    const lx = ccx + Rp * Math.SQRT1_2 + 4, ly = ccy - Rp * Math.SQRT1_2 - 6
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fillRect(lx - 4, ly - 13, ltw + 8, 17)
    ctx.fillStyle = '#c1121f'
    ctx.fillText(label, lx, ly)

    // 6. 广州市政府（地理圆心）
    {
      const gx = X(GZ_GOV.lon, r.width), gy = Y(GZ_GOV.lat, r.height)
      if (gx > -60 && gx < r.width + 60 && gy > -20 && gy < r.height + 20) {
        ctx.beginPath()
        ctx.arc(gx, gy, 5, 0, Math.PI * 2)
        ctx.fillStyle = '#111'
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.font = 'bold 13px -apple-system, "PingFang SC", sans-serif'
        const gw = ctx.measureText(GZ_GOV.name).width
        ctx.fillStyle = 'rgba(255,255,255,0.88)'
        ctx.fillRect(gx + 8, gy - 10, gw + 8, 17)
        ctx.fillStyle = '#111'
        ctx.fillText(GZ_GOV.name, gx + 12, gy + 3)
      }
    }

    // 7. 选中楼盘：1/3/5km 渐变圈层（外框不动）
    const sel = p.selectedId != null ? p.listings.find((x) => x.id === p.selectedId) : null
    if (sel) {
      const sx = X(sel.lon, r.width), sy = Y(sel.lat, r.height)
      // 渐变底盘
      const rg = ctx.createRadialGradient(sx, sy, 0, sx, sy, km2px(5))
      rg.addColorStop(0, 'rgba(230,57,70,0.14)')
      rg.addColorStop(0.4, 'rgba(230,57,70,0.07)')
      rg.addColorStop(1, 'rgba(230,57,70,0)')
      ctx.beginPath()
      ctx.arc(sx, sy, km2px(5), 0, Math.PI * 2)
      ctx.fillStyle = rg
      ctx.fill()
      // 三道圈层，由近及远渐淡
      const rings: { km: number; alpha: number; dash: number[] }[] = [
        { km: 1, alpha: 0.95, dash: [] },
        { km: 3, alpha: 0.55, dash: [6, 5] },
        { km: 5, alpha: 0.3, dash: [3, 6] },
      ]
      for (const g of rings) {
        ctx.beginPath()
        ctx.arc(sx, sy, km2px(g.km), 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(230,57,70,${g.alpha})`
        ctx.lineWidth = g.km === 1 ? 1.8 : 1.4
        ctx.setLineDash(g.dash)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.font = '600 11px -apple-system, "PingFang SC", sans-serif'
        ctx.fillStyle = `rgba(200,30,45,${Math.min(1, g.alpha + 0.25)})`
        ctx.fillText(`${g.km}km`, sx + km2px(g.km) * Math.SQRT1_2 + 3, sy - km2px(g.km) * Math.SQRT1_2 - 3)
      }
      // 附近 POI 撒点
      for (const q of nearPoisRef.current) {
        const dimKey = DIMS.find((d) => d.cats.includes(q.cat as any))?.key
        if (dimKey && p.dimVis[dimKey] === false) continue
        const x = X(q.lon, r.width), y = Y(q.lat, r.height)
        ctx.beginPath()
        ctx.arc(x, y, 4, 0, Math.PI * 2)
        ctx.fillStyle = DIM_COLORS[q.cat]
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }

    // 8. 楼盘点位（评分冷色系渐变，圈外同步淡化）+ 名称标签
    const labelGrid: Record<string, boolean> = {}
    const showNames = pxPerKm > 12
    const sorted = [...p.listings].sort(
      (a, b) => (p.scores?.get(a.id)?.total ?? 0) - (p.scores?.get(b.id)?.total ?? 0),
    )
    for (const l of sorted) {
      const x = X(l.lon, r.width), y = Y(l.lat, r.height)
      if (x < -40 || x > r.width + 40 || y < -40 || y > r.height + 40) continue
      const isSel = l.id === p.selectedId
      const isHov = l.id === p.hoverId
      const col = scoreCoolCss(p.scores?.get(l.id)?.total ?? 50)
      // 圈外楼盘淡化（选中楼盘始终清晰）
      const outside = Math.hypot(x - ccx, y - ccy) > Rp
      const dimAlpha = isSel ? 1 : outside ? 0.18 : 1
      const rad = isSel ? 9 : isHov ? 8 : 6.5
      ctx.globalAlpha = dimAlpha
      if (isSel) {
        ctx.beginPath()
        ctx.arc(x, y, 13, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(37,99,235,0.4)'
        ctx.lineWidth = 5
        ctx.stroke()
      }
      // 径向渐变光点球
      const dg = ctx.createRadialGradient(x - rad * 0.35, y - rad * 0.35, rad * 0.1, x, y, rad)
      dg.addColorStop(0, 'rgba(255,255,255,0.95)')
      dg.addColorStop(0.45, col)
      dg.addColorStop(1, col)
      ctx.beginPath()
      ctx.arc(x, y, rad, 0, Math.PI * 2)
      ctx.fillStyle = dg
      ctx.fill()
      ctx.strokeStyle = isSel ? '#1d4ed8' : '#fff'
      ctx.lineWidth = isSel ? 2.2 : 1.8
      ctx.stroke()
      if (!isSel && !isHov && !showNames) { ctx.globalAlpha = 1; continue }
      const nm = l.name.length > 12 ? l.name.slice(0, 12) + '…' : l.name
      const fs = isSel || isHov ? 12 : 10.5
      ctx.font = `${isSel ? 'bold ' : ''}${fs}px -apple-system, "PingFang SC", sans-serif`
      const w2 = ctx.measureText(nm).width
      const k = `${Math.round(x / 110)}_${Math.round(y / 20)}`
      if (isSel || isHov || !labelGrid[k]) {
        labelGrid[k] = true
        const bx = x + 10, by = y - fs + 1
        ctx.fillStyle = isSel ? 'rgba(37,99,235,0.95)' : 'rgba(255,255,255,0.9)'
        ctx.strokeStyle = isSel ? '#1d4ed8' : 'rgba(150,150,150,0.6)'
        ctx.lineWidth = 0.8
        ctx.beginPath()
        ctx.rect(bx - 3, by - 1, w2 + 7, fs + 5)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = isSel ? '#fff' : '#222'
        ctx.fillText(nm, bx + 1, by + fs - 1)
      }
      ctx.globalAlpha = 1
    }

    // 9. 比例尺 / 指北针
    const metersPerPx = 111320 / v.scale
    const target = 80
    const opts = [100, 200, 500, 1000, 2000, 5000, 10000, 20000]
    let pick = opts[0]
    for (const o of opts) if (Math.abs(o - target * metersPerPx) < Math.abs(pick - target * metersPerPx)) pick = o
    const lenPx = pick / metersPerPx
    const bx = 16, by = r.height - 18
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(bx, by)
    ctx.lineTo(bx + lenPx, by)
    ctx.moveTo(bx, by - 4)
    ctx.lineTo(bx, by + 4)
    ctx.moveTo(bx + lenPx, by - 4)
    ctx.lineTo(bx + lenPx, by + 4)
    ctx.stroke()
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#333'
    ctx.fillText(pick >= 1000 ? `${pick / 1000}km` : `${pick}m`, bx + lenPx / 2, by - 7)
    ctx.font = 'bold 14px sans-serif'
    ctx.fillText('▲', bx + 6, by - 34)
    ctx.font = '10px sans-serif'
    ctx.fillText('N', bx + 6, by - 22)
  }

  useEffect(() => { draw() })
  useEffect(() => { draw() }, [props.hoverId])

  // ---------- 交互 ----------
  useEffect(() => {
    const cv = cvRef.current!, el = wrapRef.current!
    const v = viewRef.current
    let drag: { x: number; y: number; cx: number; cy: number } | null = null
    let pinch: { d: number; scale: number } | null = null
    let moved = false
    const pointers = new Map<number, { x: number; y: number }>()

    const rect = () => el.getBoundingClientRect()
    const toLon = (px: number) => v.cx + (px - rect().width / 2) / (cosLat() * v.scale)
    const toLat = (py: number) => v.cy - (py - rect().height / 2) / v.scale

    function hitListing(px: number, py: number): number | null {
      const p = propsRef.current
      for (const l of p.listings) {
        const x = X(l.lon, rect().width), y = Y(l.lat, rect().height)
        if (Math.hypot(x - px, y - py) < 14) return l.id
      }
      return null
    }

    function down(e: PointerEvent) {
      cv.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      moved = false
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), scale: v.scale }
        drag = null
      } else {
        drag = { x: e.clientX, y: e.clientY, cx: v.cx, cy: v.cy }
      }
    }
    function move(e: PointerEvent) {
      const prev = pointers.get(e.pointerId)
      if (prev) { prev.x = e.clientX; prev.y = e.clientY }
      const r = rect()
      const px = e.clientX - r.left, py = e.clientY - r.top
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (d > 0) {
          const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top
          const lon0 = toLon(mx), lat0 = toLat(my)
          v.scale = pinch.scale * (d / pinch.d)
          v.cx = lon0 - (mx - r.width / 2) / (cosLat() * v.scale)
          v.cy = lat0 + (my - r.height / 2) / v.scale
          clampView(v)
          moved = true
          draw()
          reportKm()
        }
        return
      }
      if (drag && pointers.size === 1) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true
        v.cx = drag.cx - dx / (cosLat() * v.scale)
        v.cy = drag.cy + dy / v.scale
        clampView(v)
        draw()
      } else if (e.pointerType === 'mouse') {
        const p = propsRef.current
        const lid = hitListing(px, py)
        p.onHover(lid)
        cv.style.cursor = lid != null ? 'pointer' : 'grab'
        const tip = tipRef.current!
        if (lid != null) {
          const l = p.listings.find((x) => x.id === lid)!
          const sc = p.scores?.get(lid)
          tip.innerHTML = `<b>${l.name}</b><br><span style="color:#888">${l.area} · ${l.type}${sc ? ` · 综合 ${sc.total}分` : ''}</span>`
          tip.style.display = 'block'
          tip.style.left = Math.min(px + 14, r.width - 200) + 'px'
          tip.style.top = Math.min(py + 14, r.height - 70) + 'px'
        } else if (p.selectedId != null) {
          let best: { n: string; cat: string; dist: number } | null = null
          let bd = 10
          for (const q of nearPoisRef.current) {
            const x = X(q.lon, r.width), y = Y(q.lat, r.height)
            const d = Math.hypot(x - px, y - py)
            if (d < bd) { bd = d; best = q }
          }
          if (best) {
            tip.innerHTML = `<b>${best.n}</b><br><span style="color:#888">${DIM_NAMES[best.cat]} · 距楼盘 ${fmtDist(best.dist)}</span>`
            tip.style.display = 'block'
            tip.style.left = Math.min(px + 14, r.width - 200) + 'px'
            tip.style.top = Math.min(py + 14, r.height - 70) + 'px'
          } else tip.style.display = 'none'
        } else tip.style.display = 'none'
      }
    }
    function up(e: PointerEvent) {
      pointers.delete(e.pointerId)
      if (pinch && pointers.size < 2) pinch = null
      const wasDrag = drag
      drag = null
      if (!moved && wasDrag) {
        const r = rect()
        const lid = hitListing(e.clientX - r.left, e.clientY - r.top)
        propsRef.current.onSelect(lid)
      }
      draw()
    }
    function wheel(e: WheelEvent) {
      e.preventDefault()
      const r = rect()
      const mx = e.clientX - r.left, my = e.clientY - r.top
      const lon0 = toLon(mx), lat0 = toLat(my)
      const f = Math.exp(-e.deltaY * 0.0012)
      v.scale = v.scale * f
      v.cx = lon0 - (mx - r.width / 2) / (cosLat() * v.scale)
      v.cy = lat0 + (my - r.height / 2) / v.scale
      clampView(v) // 50km 为最大边界
      draw()
      reportKm()
    }
    function dblclick(e: MouseEvent) {
      const r = rect()
      const mx = e.clientX - r.left, my = e.clientY - r.top
      const lon0 = toLon(mx), lat0 = toLat(my)
      v.scale = v.scale * 1.7
      v.cx = lon0 - (mx - r.width / 2) / (cosLat() * v.scale)
      v.cy = lat0 + (my - r.height / 2) / v.scale
      clampView(v)
      draw()
      reportKm()
    }

    cv.addEventListener('pointerdown', down)
    cv.addEventListener('pointermove', move)
    cv.addEventListener('pointerup', up)
    cv.addEventListener('pointercancel', up)
    cv.addEventListener('wheel', wheel, { passive: false })
    cv.addEventListener('dblclick', dblclick)
    cv.addEventListener('pointerleave', () => { tipRef.current!.style.display = 'none' })
    const ro = new ResizeObserver(() => {
      if (viewRef.current.scale === 0) fitView()
      else { clampView(viewRef.current); draw(); reportKm() }
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      cv.removeEventListener('pointerdown', down)
      cv.removeEventListener('pointermove', move)
      cv.removeEventListener('pointerup', up)
      cv.removeEventListener('pointercancel', up)
      cv.removeEventListener('wheel', wheel)
      cv.removeEventListener('dblclick', dblclick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const zoomBy = (f: number) => {
    const v = viewRef.current
    flyView(v.cx, v.cy, v.scale * f)
  }

  const activeKm = Math.abs(props.currentKm) || 15
  const avgScore = props.scores
    ? Math.round([...props.scores.values()].reduce((s, x) => s + x.total, 0) / props.scores.size)
    : 0

  return (
    <div ref={wrapRef} className="absolute inset-0 bg-[#f6f6f4]">
      <canvas ref={cvRef} className="h-full w-full touch-none" style={{ cursor: 'grab' }} />
      <div
        ref={tipRef}
        className="pointer-events-none absolute z-10 hidden rounded-md border border-neutral-300 bg-white/95 px-2.5 py-1.5 text-xs leading-relaxed shadow-md"
        style={{ maxWidth: 220 }}
      />
      {/* 图例（右上，设计图版式） */}
      <div className="absolute right-14 top-3 rounded-lg border border-neutral-200 bg-white/92 px-3 py-2 text-[11px] shadow-sm backdrop-blur">
        <div className="mb-1 font-semibold text-neutral-700">图例</div>
        <div className="flex items-center gap-1.5 py-0.5 text-neutral-600">
          <span
            className="inline-block h-2.5 w-10 rounded-full"
            style={{ background: 'linear-gradient(90deg,#93c5fd,#1e40af)' }}
          />
          楼盘评分 低→高
        </div>
        {props.selectedId != null &&
          DIMS.map((d) => (
            <div key={d.key} className="flex items-center gap-1.5 py-0.5 text-neutral-600">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: d.color }} />
              {d.label}
            </div>
          ))}
      </div>
      {/* 右下统计卡 */}
      <div className="absolute bottom-3 right-3 rounded-lg border border-neutral-200 bg-white/92 px-3 py-2 text-xs shadow-sm backdrop-blur">
        <span className="font-bold text-neutral-800">{props.listings.length} 个在售新盘</span>
        <span className="mx-1.5 text-neutral-300">|</span>
        <span className="text-neutral-500">平均综合分 <b className="text-blue-700">{avgScore}</b></span>
      </div>
      {/* 右侧控制：缩放 + 回圆心 + 半径档位（与缩放联动高亮） */}
      <div className="absolute right-3 top-3 flex flex-col items-stretch gap-1">
        <button
          className="h-8 w-8 rounded border border-neutral-300 bg-white text-lg shadow-sm hover:bg-neutral-50"
          onClick={() => zoomBy(1.4)}
        >+</button>
        <button
          className="h-8 w-8 rounded border border-neutral-300 bg-white text-lg shadow-sm hover:bg-neutral-50"
          onClick={() => zoomBy(1 / 1.4)}
        >−</button>
        <button
          className="h-8 w-8 rounded border border-neutral-300 bg-white text-xs shadow-sm hover:bg-neutral-50"
          title="回到广州市政府圆心"
          onClick={() => { propsRef.current.onSelect(null); flyView(GZ_GOV.lon, GZ_GOV.lat, scaleForKm(propsRef.current.presetKm)) }}
        >⌖</button>
        <div className="mt-1 border-t border-neutral-200 pt-1 text-center text-[10px] text-neutral-400">
          半径
        </div>
        {RADIUS_STEPS.map((km) => {
          const active = Math.abs(activeKm - km) / km < 0.07
          return (
            <button
              key={km}
              onClick={() => props.onPreset(km)}
              className={`rounded border px-1 py-0.5 text-[11px] shadow-sm ${
                active
                  ? 'border-red-600 bg-red-600 font-bold text-white'
                  : 'border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              {km}
            </button>
          )
        })}
      </div>
    </div>
  )
}
