import { useEffect, useMemo, useRef, useState } from 'react'
import { DIMS } from '../lib/scoring'
import { fmtDist } from '../lib/geo'
import RadarChart from './RadarChart'
import type { Listing, ListingScore } from '../types'

interface Props {
  listings: Listing[]
  scores: Map<number, ListingScore> | null
  selectedId: number | null
  hoverId: number | null
  currentKm: number
  dimVis: Record<string, boolean>
  onSelect: (id: number | null) => void
  onHover: (id: number | null) => void
  onToggleDim: (key: string) => void
}

// 楼盘缩略图（加载失败时退化为冷色渐变块+首字）
function Thumb({ l }: { l: Listing }) {
  const [err, setErr] = useState(false)
  if (err || !l.img)
    return (
      <div
        className="flex h-14 w-20 flex-shrink-0 items-center justify-center rounded-md text-lg font-bold text-white"
        style={{ background: 'linear-gradient(135deg,#60a5fa,#1e40af)' }}
      >
        {l.name[0]}
      </div>
    )
  return (
    <img
      src={l.img}
      alt={l.name}
      loading="lazy"
      onError={() => setErr(true)}
      className="h-14 w-20 flex-shrink-0 rounded-md object-cover"
      referrerPolicy="no-referrer"
    />
  )
}

export default function SidePanel(p: Props) {
  const [q, setQ] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('全部')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (p.selectedId != null) scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [p.selectedId])

  const filtered = useMemo(() => {
    let arr = p.listings
    if (typeFilter !== '全部') arr = arr.filter((l) => l.type === typeFilter)
    if (q.trim()) arr = arr.filter((l) => l.name.includes(q.trim()) || l.area.includes(q.trim()))
    return [...arr].sort((a, b) => (p.scores?.get(b.id)?.total ?? 0) - (p.scores?.get(a.id)?.total ?? 0))
  }, [p.listings, p.scores, q, typeFilter])

  const sel = p.selectedId != null ? p.listings.find((l) => l.id === p.selectedId) : null
  const selScore = sel ? p.scores?.get(sel.id) : null
  const selRank = sel && p.scores
    ? [...p.scores.values()].filter((s) => s.total > (p.scores!.get(sel.id)?.total ?? 0)).length + 1
    : 0

  // 楼盘最强的两个维度（榜单卡片小标签）
  const topDims = (id: number) => {
    const sc = p.scores?.get(id)
    if (!sc) return []
    return [...sc.dims].sort((a, b) => b.score - a.score).slice(0, 2)
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {/* 标题 + 搜索（设计图版式） */}
        <header className="px-5 pb-3 pt-4">
          <h2 className="text-lg font-extrabold tracking-tight">天河区 · 新盘配套评分</h2>
          <p className="mt-0.5 text-[11px] text-neutral-400">
            在售新盘 {p.listings.length} 个 · 点击楼盘聚焦其 5 公里配套圈
          </p>
          <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-neutral-300 px-3 py-2 focus-within:border-blue-500">
            <span className="text-neutral-400">⌕</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filtered.length > 0) p.onSelect(filtered[0].id)
              }}
              placeholder="搜索楼盘、板块或地标，回车直达"
              className="flex-1 text-xs outline-none"
            />
            {q && (
              <button className="text-neutral-300 hover:text-neutral-500" onClick={() => setQ('')}>✕</button>
            )}
          </div>
          {/* 配套图层开关 */}
          <div className="mt-3">
            <div className="mb-1 text-[11px] font-semibold text-neutral-500">配套图层</div>
            <div className="grid grid-cols-2 gap-x-3">
              {DIMS.map((d) => {
                const on = p.dimVis[d.key] !== false
                return (
                  <button
                    key={d.key}
                    onClick={() => p.onToggleDim(d.key)}
                    className="flex items-center justify-between py-1.5 text-xs text-neutral-700"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: d.color }} />
                      {d.label}
                    </span>
                    <span
                      className={`relative inline-block h-4 w-7 rounded-full transition-colors ${on ? 'bg-blue-600' : 'bg-neutral-300'}`}
                    >
                      <span
                        className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${on ? 'left-3.5' : 'left-0.5'}`}
                      />
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] text-neutral-400">选中楼盘后，控制地图上对应配套点位的显示</p>
          </div>
        </header>

        {/* 选中楼盘：详情图块态 */}
        {sel && selScore && (
          <section className="border-y border-neutral-200 bg-neutral-50 px-5 py-4">
            <button
              className="mb-2 flex items-center gap-1 rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
              onClick={() => p.onSelect(null)}
            >
              ‹ 返回总览榜单
            </button>
            <div className="flex items-start gap-3">
              <Thumb l={sel} />
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold leading-snug">{sel.name}</h3>
                <div className="mt-0.5 text-[11px] text-neutral-500">
                  {sel.area} · {sel.type} · {sel.layout || '—'} · {sel.size || '—'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-black leading-none text-neutral-900">{selScore.total}</div>
                <div className="mt-1 text-[10px] text-neutral-400">综合分 · 40 盘中第 {selRank} 名</div>
              </div>
            </div>
            {sel.tags && (
              <div className="mt-2 flex flex-wrap gap-1">
                {sel.tags.split(/\s+/).slice(0, 8).map((t) => (
                  <span key={t} className="rounded bg-white px-1.5 py-0.5 text-[10px] text-neutral-500 ring-1 ring-neutral-200">
                    {t}
                  </span>
                ))}
              </div>
            )}
            <RadarChart dims={selScore.dims} />
            <div className="mt-2 grid grid-cols-2 gap-2">
              {selScore.dims.map((d) => (
                <div
                  key={d.key}
                  className="rounded-lg border-t-4 bg-white p-2.5 shadow-sm"
                  style={{ borderColor: d.color }}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-medium text-neutral-600">{d.label}</span>
                    <span className="text-lg font-black" style={{ color: d.color }}>{d.score}</span>
                  </div>
                  <div className="mt-1 h-1 w-full rounded bg-neutral-100">
                    <div className="h-full rounded" style={{ width: `${d.score}%`, background: d.color }} />
                  </div>
                  <div className="mt-1.5 text-[10px] leading-relaxed text-neutral-500">
                    1km 内 {d.count1k} 处 · 3km 内 {d.countInRange} 处
                  </div>
                  {d.nearest.length > 0 && (
                    <ul className="mt-1 space-y-0.5 border-t border-neutral-100 pt-1">
                      {d.nearest.slice(0, 2).map((n) => (
                        <li key={n.name} className="flex justify-between gap-1 text-[10px] text-neutral-500">
                          <span className="truncate">{n.name}</span>
                          <span className="flex-shrink-0 font-medium text-neutral-700">{fmtDist(n.dist)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-2 text-[10px] text-neutral-400">坐标来源：{sel.coord_src}</div>
            <div className="mt-2 border-t border-neutral-200 pt-2 text-[11px] font-semibold text-neutral-500">
              其他上榜楼盘
            </div>
          </section>
        )}

        {/* 总览：榜单卡片 */}
        {!sel && (
          <div className="flex items-center justify-between px-5 pb-1 pt-3">
            <span className="text-xs font-bold text-neutral-700">配套评分榜 · {filtered.length} 盘</span>
            <div className="flex gap-1">
              {['全部', '住宅', '商业', '写字楼'].map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`rounded-full px-2 py-0.5 text-[10px] ${
                    typeFilter === t ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-2 px-4 pb-4 pt-1">
          {filtered.map((l, i) => {
            const sc = p.scores?.get(l.id)
            const active = l.id === p.selectedId
            return (
              <button
                key={l.id}
                onClick={() => p.onSelect(active ? null : l.id)}
                onMouseEnter={() => p.onHover(l.id)}
                onMouseLeave={() => p.onHover(null)}
                className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-all ${
                  active
                    ? 'border-blue-400 bg-blue-50/60 shadow-sm'
                    : 'border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-sm'
                }`}
              >
                <span className="w-4 flex-shrink-0 text-center text-[10px] text-neutral-400">{i + 1}</span>
                <Thumb l={l} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{l.name}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-neutral-400">
                    {l.area} · {l.size || l.layout || l.type}
                  </span>
                  <span className="mt-1 flex gap-1">
                    {topDims(l.id).map((d) => (
                      <span
                        key={d.key}
                        className="rounded px-1 py-px text-[9px] font-medium"
                        style={{ background: d.color + '1c', color: d.color }}
                      >
                        {d.label} {d.score}
                      </span>
                    ))}
                  </span>
                </span>
                {sc && (
                  <span className="flex-shrink-0 text-center">
                    <span className="block text-xl font-black leading-none text-neutral-900">{sc.total}</span>
                    <span className="mt-0.5 block text-[9px] text-neutral-400">综合分</span>
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
      <footer className="border-t border-neutral-200 px-5 py-2 text-[10px] text-neutral-400">
        数据：OpenStreetMap 地理信息 · 安居客在售楼盘公开信息 ｜ 评分为空间统计结果，仅供参考
      </footer>
    </div>
  )
}
