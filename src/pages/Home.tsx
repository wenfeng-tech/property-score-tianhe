import { useEffect, useMemo, useState } from 'react'
import MapCanvas from '../components/MapCanvas'
import SidePanel from '../components/SidePanel'
import { scoreAll } from '../lib/scoring'
import type { BaseFeature, Listing, POISet, ListingScore } from '../types'

const FAC_DEFAULT: Record<string, boolean> = { school: true, mall: true, hospital: true, office: true }

export default function Home() {
  const [base, setBase] = useState<BaseFeature[] | null>(null)
  const [pois, setPois] = useState<POISet | null>(null)
  const [listings, setListings] = useState<Listing[] | null>(null)
  const [facilities, setFacilities] = useState<BaseFeature[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [hoverId, setHoverId] = useState<number | null>(null)
  const [showAbout, setShowAbout] = useState(false)
  const [facVis, setFacVis] = useState<Record<string, boolean>>(FAC_DEFAULT)

  useEffect(() => {
    Promise.all([
      fetch('./data/base_landuse.json').then((r) => r.json()),
      fetch('./data/pois.json').then((r) => r.json()),
      fetch('./data/listings.json').then((r) => r.json()),
      fetch('./data/facilities.json').then((r) => r.json()),
    ])
      .then(([b, p, l, f]) => {
        setBase(b)
        setPois(p)
        setListings(l)
        setFacilities(f)
      })
      .catch((e) => setErr(String(e)))
  }, [])

  const scores: Map<number, ListingScore> | null = useMemo(() => {
    if (!listings || !pois) return null
    return scoreAll(listings, pois)
  }, [listings, pois])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white">
      {/* 顶部导航栏（设计图版式，加宽） */}
      <nav className="flex h-20 flex-shrink-0 items-center justify-between border-b border-neutral-200 px-8">
        <button className="flex items-baseline" onClick={() => setSelectedId(null)}>
          <span className="text-[22px] font-black tracking-tight text-neutral-900">PropertyScore</span>
        </button>
        <div className="flex items-center gap-7 text-sm text-neutral-600">
          <button className="font-medium transition-colors hover:text-neutral-900">Buy</button>
          <button className="font-medium transition-colors hover:text-neutral-900">Rent</button>
          <button className="font-medium transition-colors hover:text-neutral-900">New Developments</button>
          <button className="font-medium transition-colors hover:text-neutral-900">Market Insights</button>
          <button className="font-medium text-neutral-900 transition-colors hover:text-blue-600">Sign in</button>
        </div>
      </nav>

      {/* 主体：竖屏上下对半，横屏左 40% 右 60% */}
      <div className="flex min-h-0 flex-1 flex-col landscape:flex-row">
        <aside className="h-1/2 w-full flex-shrink-0 overflow-hidden border-b border-neutral-200 landscape:h-full landscape:w-[40%] landscape:border-b-0 landscape:border-r">
          {base && pois && listings ? (
            <SidePanel
              listings={listings}
              scores={scores}
              selectedId={selectedId}
              hoverId={hoverId}
              onSelect={setSelectedId}
              onHover={setHoverId}
              onShowAbout={() => setShowAbout(true)}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-neutral-400">
              {err ? `数据加载失败：${err}` : '数据加载中…'}
            </div>
          )}
        </aside>
        <main className="relative min-h-0 flex-1">
          {base && pois && listings && facilities && (
            <MapCanvas
              base={base}
              listings={listings}
              pois={pois}
              facilities={facilities}
              selectedId={selectedId}
              hoverId={hoverId}
              facVis={facVis}
              scores={scores}
              onSelect={setSelectedId}
              onHover={setHoverId}
              onToggleFac={(k) => setFacVis((s) => ({ ...s, [k]: s[k] === false }))}
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
              默认视野为广州市政府周边 35 公里，最大范围 50 公里；选中楼盘后自动聚焦其周边 3 公里。
              地图右侧面板可开关中小学、商场、医院、办公楼四类配套多边形图层（覆盖越秀/天河/海珠/荔湾）。
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
