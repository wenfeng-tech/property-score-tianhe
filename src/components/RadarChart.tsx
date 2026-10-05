import type { DimResult } from '../types'

// 六维雷达图（SVG）
export default function RadarChart({ dims, size = 210 }: { dims: DimResult[]; size?: number }) {
  const cx = size / 2, cy = size / 2
  const R = size / 2 - 34
  const n = dims.length
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2
  const pt = (i: number, k: number): [number, number] => [
    cx + Math.cos(angle(i)) * R * k,
    cy + Math.sin(angle(i)) * R * k,
  ]
  const rings = [0.33, 0.66, 1]
  const poly = dims.map((d, i) => pt(i, d.score / 100).join(',')).join(' ')

  return (
    <svg width={size} height={size} className="mx-auto">
      {rings.map((k) => (
        <polygon
          key={k}
          points={dims.map((_, i) => pt(i, k).join(',')).join(' ')}
          fill="none"
          stroke="#e5e5e5"
          strokeWidth={1}
        />
      ))}
      {dims.map((_, i) => {
        const [x, y] = pt(i, 1)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#e5e5e5" strokeWidth={1} />
      })}
      <polygon points={poly} fill="rgba(37,99,235,0.15)" stroke="#2563eb" strokeWidth={2} />
      {dims.map((d, i) => {
        const [x, y] = pt(i, d.score / 100)
        return <circle key={d.key} cx={x} cy={y} r={3} fill={d.color} stroke="#fff" strokeWidth={1} />
      })}
      {dims.map((d, i) => {
        const [x, y] = pt(i, 1.22)
        return (
          <text
            key={d.key}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={11}
            fill="#555"
          >
            {d.label}
            <tspan x={x} dy={12} fontSize={10} fill={d.color} fontWeight={700}>
              {d.score}
            </tspan>
          </text>
        )
      })}
    </svg>
  )
}
