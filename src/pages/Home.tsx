import { useEffect, useMemo, useState } from 'react'
import MapCanvas from '../components/MapCanvas'
import SidePanel from '../components/SidePanel'
import { scoreAll, DIMS } from '../lib/scoring'
import type { BaseFeature, Listing, POISet, ListingScore } from '../types'

export default function Home() {
  const [base, setBase] = useState<BaseFeature[] | null>(null)
  const [pois, setPois] = useState<POISet | null>(null)
  const [listings, setListings] = useState<Listing[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [hoverId, setHoverId] = useState<number | null>(null)
  const [presetKm, setPresetKm] = useState(15)
  const [currentKm, setCurrentKm] = useState(15)
  const [showAbout, setShowAbout] = useState(false)
  const [dimVis, setDimVis] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(DIMS.map((d) => [d.key, true])),
  )

  useEffect(() => {
    Promise.all([
      fetch('./data/base_landuse.json').then((r) => r.json()),
      fetch('./data/pois.json').then((r) => r.json()),
      fetch('./data/listings.json').then((r) => r.json()),
    ])
      .then(([b, p, l]) => {
        setBase(b)
        setPois(p)
        setListings(l)
      })
      .catch((e) => setErr(String(e)))
  }, [])

  const scores: Map<number, ListingScore> | null = useMemo(() => {
    if (!listings || !pois) return null
    return scoreAll(listings, pois)
  }, [listings, pois])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white">
      {/* 顶部导航栏（设计图版式） */}
      <nav className="flex h-[52px] flex-shrink-0 items-center justify-between border-b border-neutral-200 px-5 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[17px] font-black tracking-tight text-neutral-900">PropertyScore</span>
          <span className="hidden text-xs text-neutral-400 sm:inline">广州天河 · 在售新盘配套评分</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-neutral-500">
          <button className="hover:text-neutral-900" onClick={() => setSelectedId(null)}>总览</button>
          <button className="hover:text-neutral-900" onClick={() => setShowAbout(true)}>评分说明</button>
          <span className="rounded-md bg-blue-600 px-3 py-1.5 font-medium text-white">
            在售 {listings?.length ?? '…'} 盘
          </span>
        </div>
      </nav>

      {/* 主体：竖屏上下对半，横屏左右对半 */}
      <div className="flex min-h-0 flex-1 flex-col landscape:flex-row">
        <aside className="h-1/2 w-full flex-shrink-0 overflow-hidden border-b border-neutral-200 landscape:h-full landscape:w-[40%] landscape:border-b-0 landscape:border-r">
          {base && pois && listings ? (
            <SidePanel
              listings={listings}
              scores={scores}
              selectedId={selectedId}
              hoverId={hoverId}
              currentKm={currentKm}
              dimVis={dimVis}
              onSelect={setSelectedId}
              onHover={setHoverId}
              onToggleDim={(k) => setDimVis((s) => ({ ...s, [k]: s[k] === false }))}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-neutral-400">
              {err ? `数据加载失败：${err}` : '数据加载中…'}
            </div>
          )}
        </aside>
        <main className="relative min-h-0 flex-1">
          {base && pois && listings && (
            <MapCanvas
              base={base}
              listings={listings}
              pois={pois}
              selectedId={selectedId}
              hoverId={hoverId}
              presetKm={presetKm}
              currentKm={currentKm}
              dimVis={dimVis}
              scores={scores}
              onSelect={setSelectedId}
              onHover={setHoverId}
              onPreset={setPresetKm}
              onKmChange={setCurrentKm}
            />
          )}
        </main>
      </div>

      {/* 评分说明弹层 */}
      {showAbout && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setShowAbout(false)}
        >
          <div className="max-w-md rounded-xl bg-white p-5 text-xs leading-relaxed shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-sm font-bold">评分说明</h3>
            <p>
              以楼盘为圆心，统计周边 1km / 3km 范围内的配套资源，按「数量密度 + 最近距离」加权计算
              0–100 分：基础教育（30%）、轨道交通（25%）、商业购物（20%）、医疗配套（15%）、公园绿地（10%）。
            </p>
            <p className="mt-2">
              地图上红色虚线圈为视野范围圈（可选 5 / 15 / 35 / 50 公里），圈外内容淡化显示；
              选中楼盘后显示其 1km / 3km / 5km 配套圈层与周边资源点位。
            </p>
            <p className="mt-2 text-neutral-400">
              地理数据来自 OpenStreetMap，楼盘信息来自公开在售信息；评分为空间统计结果，仅供参考，不构成置业建议。
            </p>
            <button
              className="mt-3 w-full rounded-lg bg-neutral-900 py-1.5 text-white"
              onClick={() => setShowAbout(false)}
            >
              知道了
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
