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
  onSelect: (id: number | null) => void
  onHover: (id: number | null) => void
  onShowAbout: () => void
}

// 楼盘缩略图（加载失败时退化为冷色渐变块+首字）；wide 用于两列图块
function Thumb({ l, wide }: { l: Listing; wide?: boolean }) {
  const [err, setErr] = useState(false)
  const cls = wide
    ? 'h-24 w-full rounded-t-lg object-cover'
    : 'h-14 w-20 flex-shrink-0 rounded-md object-cover'
  if (err || !l.img)
    return (
      <div
        className={`flex items-center justify-center text-lg font-bold text-white ${
          wide ? 'h-24 w-full rounded-t-lg' : 'h-14 w-20 flex-shrink-0 rounded-md'
        }`}
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
      className={cls}
      referrerPolicy="no-referrer"
    />
  )
}

export default function SidePanel(p: Props) {
  const [q, setQ] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('全部')
  const [sortKey, setSortKey] = useState<string>('total')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (p.selectedId != null) scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [p.selectedId])

  const filtered = useMemo(() => {
    let arr = p.listings
    if (typeFilter !== '全部') arr = arr.filter((l) => l.type === typeFilter)
    if (q.trim()) arr = arr.filter((l) => l.name.includes(q.trim()) || l.area.includes(q.trim()))
    const val = (id: number) => {
      const sc = p.scores?.get(id)
      if (!sc) return 0
      if (sortKey === 'total') return sc.total
      return sc.dims.find((d) => d.key === sortKey)?.score ?? 0
    }
    return [...arr].sort((a, b) => val(b.id) - val(a.id))
  }, [p.listings, p.scores, q, typeFilter, sortKey])

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
        {/* 总览头部：搜索（选中楼盘后隐藏） */}
        {!sel && (
          <header className="px-4 pb-2 pt-4">
            <div className="flex items-center gap-2 rounded-lg border border-neutral-300 px-3 py-2 focus-within:border-blue-500">
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
          </header>
        )}

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
          </section>
        )}

        {/* 总览：榜单卡片（选中后整栏只显示详情） */}
        {!sel && (
          <>
          <div className="flex items-center justify-between px-5 pb-1 pt-3">
            <span className="text-xs font-bold text-neutral-700">配套评分榜 · {filtered.length} 盘</span>
            <div className="flex items-center gap-1.5">
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value)}
                className="rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[10px] text-neutral-600 outline-none"
                title="排序方式"
              >
                <option value="total">综合分排序</option>
                {DIMS.map((d) => (
                  <option key={d.key} value={d.key}>{d.label}排序</option>
                ))}
              </select>
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
        <div className="grid grid-cols-2 gap-2.5 px-4 pb-4 pt-1">
          {filtered.map((l, i) => {
            const sc = p.scores?.get(l.id)
            const active = l.id === p.selectedId
            return (
              <button
                key={l.id}
                onClick={() => p.onSelect(active ? null : l.id)}
                onMouseEnter={() => p.onHover(l.id)}
                onMouseLeave={() => p.onHover(null)}
                className={`flex flex-col overflow-hidden rounded-xl border text-left transition-all ${
                  active
                    ? 'border-blue-400 bg-blue-50/60 shadow-sm'
                    : 'border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-md'
                }`}
              >
                <span className="relative block">
                  <Thumb l={l} wide />
                  <span className="absolute left-1.5 top-1.5 rounded bg-black/45 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                  {sc && (
                    <span className="absolute bottom-1.5 right-1.5 rounded-md bg-white/95 px-1.5 py-0.5 text-sm font-black leading-none text-neutral-900 shadow-sm">
                      {sc.total}
                      <span className="ml-0.5 text-[9px] font-normal text-neutral-400">分</span>
                    </span>
                  )}
                </span>
                <span className="block px-2.5 pb-2 pt-1.5">
                  <span className="block truncate text-[13px] font-semibold">{l.name}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-neutral-400">
                    {l.area} · {l.size || l.layout || l.type}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
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
              </button>
            )
          })}
        </div>
          </>
        )}
      </div>
      <footer className="flex items-center justify-between border-t border-neutral-200 px-5 py-2 text-[10px] text-neutral-400">
        <span>数据：OpenStreetMap 地理信息 · 安居客在售楼盘公开信息 ｜ 评分为空间统计结果，仅供参考</span>
        <button className="flex-shrink-0 underline-offset-2 hover:text-blue-600 hover:underline" onClick={p.onShowAbout}>
          评分说明
        </button>
      </footer>
    </div>
  )
}
