// 地理计算工具
const R = 6371000

export function haversine(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`
}

// 圆心：广州市政府
export const GZ_GOV = { lon: 113.259, lat: 23.1291, name: '广州市政府' }

// 简单网格空间索引（按外接框），用于底图要素的视野裁剪
export interface IndexedFeature<T> {
  f: T
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function geomBBox(g: { type: string; coordinates: any }): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const walk = (c: any) => {
    if (typeof c[0] === 'number') {
      if (c[0] < minX) minX = c[0]
      if (c[0] > maxX) maxX = c[0]
      if (c[1] < minY) minY = c[1]
      if (c[1] > maxY) maxY = c[1]
    } else c.forEach(walk)
  }
  walk(g.coordinates)
  return [minX, minY, maxX, maxY]
}

export class GridIndex<T> {
  private cells = new Map<string, IndexedFeature<T>[]>()
  private cellSize: number

  constructor(items: T[], getGeom: (t: T) => { type: string; coordinates: any }, cellSize = 0.05) {
    this.cellSize = cellSize
    for (const f of items) {
      const [minX, minY, maxX, maxY] = geomBBox(getGeom(f))
      const rec = { f, minX, minY, maxX, maxY }
      const x0 = Math.floor(minX / cellSize), x1 = Math.floor(maxX / cellSize)
      const y0 = Math.floor(minY / cellSize), y1 = Math.floor(maxY / cellSize)
      for (let x = x0; x <= x1; x++)
        for (let y = y0; y <= y1; y++) {
          const k = `${x}_${y}`
          let arr = this.cells.get(k)
          if (!arr) this.cells.set(k, (arr = []))
          arr.push(rec)
        }
    }
  }

  query(minX: number, minY: number, maxX: number, maxY: number): T[] {
    const out: T[] = []
    const seen = new Set<T>()
    const x0 = Math.floor(minX / this.cellSize), x1 = Math.floor(maxX / this.cellSize)
    const y0 = Math.floor(minY / this.cellSize), y1 = Math.floor(maxY / this.cellSize)
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const arr = this.cells.get(`${x}_${y}`)
        if (!arr) continue
        for (const r of arr) {
          if (seen.has(r.f)) continue
          if (r.maxX < minX || r.minX > maxX || r.maxY < minY || r.minY > maxY) continue
          seen.add(r.f)
          out.push(r.f)
        }
      }
    return out
  }
}
