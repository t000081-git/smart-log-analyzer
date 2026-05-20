// Pure SVG sparkline — small, theme-aware (uses --app-accent for stroke/fill).

interface Props {
  values: number[]
  width?: number
  height?: number
  color?: string
}

export default function Sparkline({
  values,
  width = 120,
  height = 32,
  color = 'var(--app-accent)',
}: Props) {
  if (values.length === 0) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        <line
          x1={0}
          x2={width}
          y1={height / 2}
          y2={height / 2}
          stroke="#27272a"
          strokeDasharray="2 4"
        />
      </svg>
    )
  }

  const max = Math.max(...values, 1)
  const step = values.length > 1 ? width / (values.length - 1) : 0
  const padTop = 2
  const padBot = 2

  const points = values.map((v, i) => {
    const x = i * step
    const y = height - padBot - (v / max) * (height - padTop - padBot)
    return { x, y }
  })

  const linePath = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(' ')
  const areaPath = `${linePath} L ${points[points.length - 1]!.x} ${height} L ${points[0]!.x} ${height} Z`
  const last = points[points.length - 1]!
  const gradId = `spark-grad-${Math.random().toString(36).slice(2, 8)}`

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r={2.2} fill={color} />
    </svg>
  )
}
