// 评分引擎：以楼盘为圆心统计半径内配套，输出 0-100 分
import { haversine, fmtDist } from './geo'
import type { Listing, POISet, POICat, DimResult, ListingScore } from '../types'

export interface DimConfig {
  key: string
  label: string
  color: string
  cats: POICat[]
  R: number // 统计半径（米）
  wRef: number // 加权计数参考值（达到该密度视为满分量级）
  proxWeight: number // 最近距离项权重（0-1）
  weight: number // 综合分权重
}

export const DIMS: DimConfig[] = [
  { key: 'edu',   label: '基础教育', color: '#f6c62b', cats: ['edu_primary', 'edu_secondary'], R: 3000, wRef: 6, proxWeight: 0.35, weight: 0.30 },
  { key: 'metro', label: '轨道交通', color: '#3b82f6', cats: ['metro'],                        R: 2500, wRef: 3, proxWeight: 0.65, weight: 0.25 },
  { key: 'mall',  label: '商业购物', color: '#e23b46', cats: ['mall'],                         R: 3000, wRef: 4, proxWeight: 0.35, weight: 0.20 },
  { key: 'medical', label: '医疗配套', color: '#ef6aa8', cats: ['medical'],                    R: 3000, wRef: 4, proxWeight: 0.40, weight: 0.15 },
  { key: 'park',  label: '公园绿地', color: '#83c94a', cats: ['park'],                         R: 2000, wRef: 4, proxWeight: 0.40, weight: 0.10 },
]

export const DIM_COLORS: Record<string, string> = {
  edu_primary: '#f6c62b', edu_secondary: '#e09b00', edu_university: '#c084e8',
  medical: '#ef6aa8', mall: '#e23b46', metro: '#3b82f6', park: '#83c94a',
}

export const DIM_NAMES: Record<string, string> = {
  edu_primary: '小学', edu_secondary: '中学', edu_university: '大学',
  medical: '医院', mall: '商场', metro: '地铁站', park: '公园',
}

function scoreOne(lon: number, lat: number, cfg: DimConfig, pois: POISet): DimResult {
  const hits: { name: string; dist: number }[] = []
  for (const cat of cfg.cats) {
    for (const p of pois[cat]) {
      const d = haversine(lon, lat, p.lon, p.lat)
      if (d <= cfg.R) hits.push({ name: `${p.n}（${DIM_NAMES[cat]}）`, dist: d })
    }
  }
  hits.sort((a, b) => a.dist - b.dist)
  let w = 0
  for (const h of hits) w += 1 - h.dist / cfg.R
  const dmin = hits.length ? hits[0].dist : Infinity
  const countTerm = Math.min(1, w / cfg.wRef)
  const proxTerm = dmin === Infinity ? 0 : Math.max(0, 1 - dmin / cfg.R)
  const score = Math.round(100 * ((1 - cfg.proxWeight) * countTerm + cfg.proxWeight * proxTerm))
  const nearest = hits.slice(0, 3)
  const count1k = hits.filter((h) => h.dist <= 1000).length
  const summary =
    hits.length === 0
      ? `${cfg.R / 1000}km 内暂无${cfg.label}资源`
      : `最近 ${nearest[0].name} ${fmtDist(nearest[0].dist)}`
  return {
    key: cfg.key, label: cfg.label, color: cfg.color,
    score: Math.min(100, score), nearest, countInRange: hits.length, count1k, summary,
  }
}

export function scoreListing(l: Listing, pois: POISet): ListingScore {
  const dims = DIMS.map((cfg) => scoreOne(l.lon, l.lat, cfg, pois))
  const total = Math.round(dims.reduce((s, d) => s + d.score * (DIMS.find((c) => c.key === d.key)!.weight), 0))
  return { dims, total }
}

export function scoreAll(listings: Listing[], pois: POISet): Map<number, ListingScore> {
  const m = new Map<number, ListingScore>()
  for (const l of listings) m.set(l.id, scoreListing(l, pois))
  return m
}
