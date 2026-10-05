// 数据类型定义
export interface Listing {
  id: number
  name: string
  type: string // 住宅 / 商业 / 写字楼
  area: string // 板块，如 天河区·奥体
  addr: string
  layout: string
  size: string
  tags: string
  img: string
  lon: number
  lat: number
  coord_src: string
}

export interface POI {
  n: string
  lon: number
  lat: number
  lv?: string
}

export interface POISet {
  edu_primary: POI[]
  edu_secondary: POI[]
  edu_university: POI[]
  medical: POI[]
  mall: POI[]
  metro: POI[]
  park: POI[]
}

export type POICat = keyof POISet

export interface BaseFeature {
  g: { type: string; coordinates: any }
  c: string // residential/commercial/.../boundary
  n: string
}

export interface DimResult {
  key: string
  label: string
  color: string
  score: number
  nearest: { name: string; dist: number }[]
  countInRange: number
  count1k: number
  summary: string
}

export interface ListingScore {
  dims: DimResult[]
  total: number
}
