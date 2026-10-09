import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Protocol, PMTiles } from 'pmtiles'
import { GZ_GOV } from '../lib/geo'
import type { Listing, ListingScore } from '../types'

// ---------- 底图配色（严格来自 vt QML 样式文件） ----------
const NATURAL_COLORS: [string, string][] = [
  ['海洋', 'rgb(100,150,220)'], ['水体', 'rgb(150,200,245)'], ['林地', 'rgb(140,200,140)'],
  ['灌木', 'rgb(180,220,160)'], ['草原', 'rgb(200,230,150)'], ['湿地', 'rgb(160,210,200)'],
  ['沙地', 'rgb(240,230,190)'], ['草地', 'rgb(190,235,170)'], ['沙滩', 'rgb(245,240,200)'],
]
const ROAD_STYLES: Record<string, { c: string; w: number }> = {
  motorway: { c: 'rgb(220,60,60)', w: 3 },
  motorway_link: { c: 'rgb(230,120,120)', w: 2 },
  trunk: { c: 'rgb(240,130,40)', w: 2.5 },
  trunk_link: { c: 'rgb(245,170,80)', w: 1.8 },
  primary: { c: 'rgb(250,200,60)', w: 2 },
  primary_link: { c: 'rgb(252,220,120)', w: 1.5 },
  secondary: { c: 'rgb(255,235,150)', w: 1.5 },
  secondary_link: { c: 'rgb(255,240,180)', w: 1.2 },
  tertiary: { c: 'rgb(180,180,180)', w: 1 },
  tertiary_link: { c: 'rgb(180,180,180)', w: 0.8 },
}
// 低级先画、主干压上面
const ROAD_DRAW_ORDER = [
  'tertiary_link', 'secondary_link', 'primary_link', 'trunk_link', 'motorway_link',
  'tertiary', 'secondary', 'primary', 'trunk', 'motorway',
]

const HOME_KM = 35 // 默认/回圆心视野：35km 半径圆与窄边内切
const MAX_KM = 50  // 最大边界：视野不可滑出 50km
const COS = Math.cos((GZ_GOV.lat * Math.PI) / 180)
const degLat = (km: number) => km / 110.574
const degLon = (km: number) => km / (111.32 * COS)
const circleBounds = (lon: number, lat: number, km: number): [[number, number], [number, number]] => [
  [lon - degLon(km), lat - degLat(km)],
  [lon + degLon(km), lat + degLat(km)],
]
// MapLibre 的缩放等级基于 512px 世界（z0 时全球宽 512px），故比 256px 方案多除一个 2
const metersPerPx = (zoom: number) => (156543.03392 * COS) / Math.pow(2, zoom + 1)

let protocolReady = false
function ensureProtocol() {
  if (protocolReady) return
  const p = new Protocol()
  const orig = p.tile.bind(p)
  maplibregl.addProtocol('pmtiles', ((params: any, ctrl: any) => {
    const w = window as any
    w.__protoLog = (w.__protoLog || []).concat(params.url).slice(-30)
    return orig(params, ctrl)
  }) as any)
  protocolReady = true
}

interface Props {
  listings: Listing[]
  scores: Map<number, ListingScore> | null
  selectedId: number | null
  hoverId: number | null
  onSelect: (id: number | null) => void
  onHover: (id: number | null) => void
}

export default function MapCanvas(props: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const labelRef = useRef<maplibregl.Marker | null>(null)
  const propsRef = useRef(props)
  propsRef.current = props
  const firstSel = useRef(true)

  // ---------- 初始化地图（一次） ----------
  useEffect(() => {
    ensureProtocol()
    const el = wrapRef.current!
    const pmtilesUrl = 'pmtiles://' + new URL('data/guangzhou_basemap.pmtiles', window.location.href).href

    const naturalColor: any = ['match', ['get', 'category']]
    for (const [k, v] of NATURAL_COLORS) naturalColor.push(k, v)
    naturalColor.push('rgba(0,0,0,0)')

    const style: maplibregl.StyleSpecification = {
      version: 8,
      sources: {
        base: { type: 'vector', url: pmtilesUrl, attribution: '© OpenStreetMap contributors' },
        listings: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#f2f0eb' } },
        {
          id: 'natural',
          type: 'fill',
          source: 'base',
          'source-layer': 'natural',
          paint: { 'fill-color': naturalColor, 'fill-outline-color': 'rgba(120,120,120,0.25)' },
        },
        ...ROAD_DRAW_ORDER.map((cls) => ({
          id: `road-${cls}`,
          type: 'line' as const,
          source: 'base',
          'source-layer': 'roads',
          filter: ['==', ['get', 'highway'], cls] as any,
          layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
          paint: { 'line-color': ROAD_STYLES[cls].c, 'line-width': ROAD_STYLES[cls].w },
        })),
        // 楼盘点：评分冷色渐变（低分浅青 → 高分深蓝），白边小圆点
        {
          id: 'dots',
          type: 'circle',
          source: 'listings',
          layout: { 'circle-sort-key': ['get', 'score'] as any },
          paint: {
            'circle-color': ['interpolate', ['linear'], ['get', 'score'], 40, '#93c5fd', 95, '#1e40af'] as any,
            'circle-radius': 4.5,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2.2,
          },
        } as any,
        // 悬浮放大
        {
          id: 'dots-hover',
          type: 'circle',
          source: 'listings',
          filter: ['==', ['get', 'id'], -1] as any,
          paint: {
            'circle-color': ['interpolate', ['linear'], ['get', 'score'], 40, '#93c5fd', 95, '#1e40af'] as any,
            'circle-radius': 6,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2.2,
          },
        } as any,
        // 选中光圈 + 放大点
        {
          id: 'dots-sel-ring',
          type: 'circle',
          source: 'listings',
          filter: ['==', ['get', 'id'], -1] as any,
          paint: {
            'circle-color': 'rgba(0,0,0,0)',
            'circle-radius': 11,
            'circle-stroke-color': 'rgba(37,99,235,0.4)',
            'circle-stroke-width': 4,
          },
        } as any,
        {
          id: 'dots-sel',
          type: 'circle',
          source: 'listings',
          filter: ['==', ['get', 'id'], -1] as any,
          paint: {
            'circle-color': ['interpolate', ['linear'], ['get', 'score'], 40, '#93c5fd', 95, '#1e40af'] as any,
            'circle-radius': 7.5,
            'circle-stroke-color': '#1d4ed8',
            'circle-stroke-width': 2.4,
          },
        } as any,
      ],
    }

    const map = new maplibregl.Map({
      container: el,
      style,
      center: [GZ_GOV.lon, GZ_GOV.lat],
      zoom: 10,
      maxBounds: circleBounds(GZ_GOV.lon, GZ_GOV.lat, MAX_KM + 0.5),
      maxZoom: 15.5,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: { compact: true },
    })
    mapRef.current = map
    ;(window as any).__map = map
    ;(window as any).__maplibregl = maplibregl
    ;(window as any).__PMTiles = PMTiles
    map.on('error', (e: any) => console.error('[maplibre]', e?.error?.message ?? e))

    // 窄边内切圆 ⇄ 缩放级别
    const minDim = () => Math.min(el.clientWidth, el.clientHeight)
    const zoomForKm = (km: number) => Math.log2((156543.03392 * COS * minDim()) / (km * 2000)) - 1
    const applyMinZoom = () => map.setMinZoom(zoomForKm(MAX_KM) - 0.05)

    map.on('load', () => {
      applyMinZoom()
      map.fitBounds(circleBounds(GZ_GOV.lon, GZ_GOV.lat, HOME_KM), { animate: false })
      map.addControl(new maplibregl.ScaleControl({ maxWidth: 90, unit: 'metric' }), 'bottom-left')
    })
    map.on('resize', applyMinZoom)

    // 点选 / 悬浮楼盘
    const HIT = ['dots', 'dots-hover', 'dots-sel']
    map.on('click', (e: maplibregl.MapMouseEvent) => {
      const fs = map.queryRenderedFeatures(e.point, { layers: HIT })
      const id = fs.length ? (fs[0].properties?.id as number) : null
      const cur = propsRef.current.selectedId
      propsRef.current.onSelect(id != null && id === cur ? null : id)
    })
    map.on('mousemove', (e: maplibregl.MapMouseEvent) => {
      const fs = map.queryRenderedFeatures(e.point, { layers: HIT })
      const id = fs.length ? (fs[0].properties?.id as number) : null
      if (id !== propsRef.current.hoverId) propsRef.current.onHover(id)
      map.getCanvas().style.cursor = id != null ? 'pointer' : 'grab'
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- 楼盘数据 → GeoJSON 源 ----------
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const set = () => {
      const src = map.getSource('listings') as maplibregl.GeoJSONSource | undefined
      if (!src) return
      src.setData({
        type: 'FeatureCollection',
        features: props.listings.map((l) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [l.lon, l.lat] },
          properties: { id: l.id, name: l.name, score: props.scores?.get(l.id)?.total ?? 50 },
        })),
      })
    }
    if (map.isStyleLoaded()) set()
    else map.once('load', set)
  }, [props.listings, props.scores])

  // ---------- 名称标签：默认不显示，悬浮或点选后显示 ----------
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const id = props.hoverId ?? props.selectedId
    const l = id != null ? props.listings.find((x) => x.id === id) : null
    if (!l) {
      labelRef.current?.remove()
      labelRef.current = null
      return
    }
    const sel = l.id === props.selectedId
    const nm = l.name.length > 12 ? l.name.slice(0, 12) + '…' : l.name
    const div = document.createElement('div')
    div.textContent = nm
    div.style.cssText = `font: ${sel ? 'bold ' : ''}12px -apple-system,"PingFang SC",sans-serif; padding:2px 5px; border-radius:3px; white-space:nowrap; pointer-events:none; ${
      sel
        ? 'background:rgba(37,99,235,0.95); color:#fff; border:1px solid #1d4ed8;'
        : 'background:rgba(255,255,255,0.92); color:#222; border:1px solid rgba(150,150,150,0.6);'
    } box-shadow:0 1px 3px rgba(0,0,0,0.15);`
    labelRef.current?.remove()
    labelRef.current = new maplibregl.Marker({ element: div, anchor: 'left', offset: [11, 0] })
      .setLngLat([l.lon, l.lat])
      .addTo(map)
  }, [props.hoverId, props.selectedId, props.listings])

  // ---------- 悬浮/选中高亮过滤 ----------
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer('dots-hover')) return
    map.setFilter('dots-hover', ['==', ['get', 'id'], props.hoverId ?? -1] as any)
  }, [props.hoverId])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer('dots-sel')) return
    map.setFilter('dots-sel', ['==', ['get', 'id'], props.selectedId ?? -1] as any)
    map.setFilter('dots-sel-ring', ['==', ['get', 'id'], props.selectedId ?? -1] as any)
  }, [props.selectedId])

  // ---------- 选中飞到 3km / 取消飞回 35km 圆心 ----------
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (firstSel.current) {
      firstSel.current = false
      return
    }
    const { selectedId, listings } = props
    if (selectedId != null) {
      const l = listings.find((x) => x.id === selectedId)
      if (!l) return
      const radiusKm = (metersPerPx(map.getZoom()) * minDimOf(map)) / 2 / 1000
      if (radiusKm > 5) {
        map.fitBounds(circleBounds(l.lon, l.lat, 3), { duration: 550, maxZoom: 15 })
      } else {
        const p = map.project([l.lon, l.lat])
        const w = map.getContainer().clientWidth
        const h = map.getContainer().clientHeight
        if (Math.abs(p.x - w / 2) > w * 0.3 || Math.abs(p.y - h / 2) > h * 0.3) {
          map.easeTo({ center: [l.lon, l.lat], duration: 400 })
        }
      }
    } else {
      map.fitBounds(circleBounds(GZ_GOV.lon, GZ_GOV.lat, HOME_KM), { duration: 550 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.selectedId])

  // 中位综合分（比平均分更抗极值）
  const medianScore = (() => {
    if (!props.scores || props.scores.size === 0) return 0
    const arr = [...props.scores.values()].map((s) => s.total).sort((a, b) => a - b)
    const n = arr.length
    return Math.round(n % 2 ? arr[(n - 1) / 2] : (arr[n / 2 - 1] + arr[n / 2]) / 2)
  })()

  const flyHome = () => {
    propsRef.current.onSelect(null)
    mapRef.current?.fitBounds(circleBounds(GZ_GOV.lon, GZ_GOV.lat, HOME_KM), { duration: 550 })
  }

  return (
    <div ref={wrapRef} className="overflow-hidden bg-[#f2f0eb]" style={{ position: 'absolute', inset: 0 }}>
      {/* 指北针（已锁定正北） */}
      <div className="pointer-events-none absolute bottom-12 left-3 z-10 text-center leading-none text-neutral-700">
        <div className="text-sm font-bold">▲</div>
        <div className="text-[10px]">N</div>
      </div>
      {/* 右下统计卡 */}
      <div className="absolute bottom-3 right-3 z-10 rounded-lg border border-neutral-200 bg-white/92 px-3 py-2 text-xs shadow-sm backdrop-blur">
        <span className="font-bold text-neutral-800">{props.listings.length} 个在售新盘</span>
        <span className="mx-1.5 text-neutral-300">|</span>
        <span className="text-neutral-500">中位综合分 <b className="text-blue-700">{medianScore}</b></span>
      </div>
      {/* 右侧控制：缩放 + 回圆心（默认 35km 视野） */}
      <div className="absolute right-3 top-3 z-10 flex flex-col items-stretch gap-1">
        <button
          className="h-8 w-8 rounded border border-neutral-300 bg-white text-lg shadow-sm hover:bg-neutral-50"
          onClick={() => mapRef.current?.zoomIn({ duration: 250 })}
        >+</button>
        <button
          className="h-8 w-8 rounded border border-neutral-300 bg-white text-lg shadow-sm hover:bg-neutral-50"
          onClick={() => mapRef.current?.zoomOut({ duration: 250 })}
        >−</button>
        <button
          className="h-8 w-8 rounded border border-neutral-300 bg-white text-xs shadow-sm hover:bg-neutral-50"
          title="回到广州市政府 · 35km 视野"
          onClick={flyHome}
        >⌖</button>
      </div>
    </div>
  )
}

function minDimOf(map: maplibregl.Map) {
  const c = map.getContainer()
  return Math.min(c.clientWidth, c.clientHeight)
}
