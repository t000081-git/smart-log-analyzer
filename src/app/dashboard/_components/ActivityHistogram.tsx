// Compact 24h activity histogram for the dashboard.
// Stacked bars colored by severity. Pure server-rendered SVG.

import type { LogSeverity } from '@/types/database'

const SEVERITY_ORDER: LogSeverity[] = ['critical', 'error', 'warning', 'info', 'debug']
const SEVERITY_COLOR: Record<LogSeverity, string> = {
  critical: '#dc2626',
  error: '#f43f5e',
  warning: '#f59e0b',
  info: '#38bdf8',
  debug: '#71717a',
}

interface Bucket {
  start: number
  counts: Record<LogSeverity, number>
}

interface Props {
  buckets: Bucket[]
  windowHours: number
}

export default function ActivityHistogram({ buckets, windowHours }: Props) {
  const width = 720
  const height = 160
  const PAD = { top: 8, right: 8, bottom: 22, left: 28 }
  const plotW = width - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom

  const maxStack = Math.max(
    1,
    ...buckets.map((b) => SEVERITY_ORDER.reduce((s, sev) => s + b.counts[sev], 0))
  )
  const niceMax = niceCeil(maxStack)
  const barW = plotW / buckets.length

  const labelEvery = Math.max(1, Math.floor(buckets.length / 6))

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
      <defs>
        {SEVERITY_ORDER.map((sev) => (
          <linearGradient key={sev} id={`dh-${sev}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SEVERITY_COLOR[sev]} stopOpacity="0.95" />
            <stop offset="100%" stopColor={SEVERITY_COLOR[sev]} stopOpacity="0.55" />
          </linearGradient>
        ))}
      </defs>

      {[0, 0.5, 1].map((frac, i) => {
        const y = PAD.top + plotH - frac * plotH
        return (
          <g key={i}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y} y2={y} stroke="#27272a" strokeDasharray={frac === 0 ? '' : '2 4'} />
            <text x={PAD.left - 6} y={y + 3} fontSize={9} textAnchor="end" fill="#52525b" className="font-mono tabular-nums">
              {Math.round(niceMax * frac)}
            </text>
          </g>
        )
      })}

      {buckets.map((b, i) => {
        const x = PAD.left + i * barW
        let stackY = PAD.top + plotH
        return (
          <g key={i}>
            {SEVERITY_ORDER.slice().reverse().map((sev) => {
              const count = b.counts[sev]
              if (count === 0) return null
              const h = (count / niceMax) * plotH
              stackY -= h
              return (
                <rect
                  key={sev}
                  x={x + 0.5}
                  y={stackY}
                  width={Math.max(barW - 1, 1)}
                  height={h}
                  fill={`url(#dh-${sev})`}
                />
              )
            })}
            {i % labelEvery === 0 && (
              <text x={x + barW / 2} y={height - 6} fontSize={9} textAnchor="middle" fill="#52525b" className="font-mono">
                {formatTick(b.start, windowHours)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function formatTick(t: number, windowHours: number): string {
  const d = new Date(t)
  if (windowHours <= 24) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function niceCeil(n: number): number {
  if (n <= 1) return 1
  const mag = Math.pow(10, Math.floor(Math.log10(n)))
  const norm = n / mag
  if (norm <= 1) return mag
  if (norm <= 2) return 2 * mag
  if (norm <= 5) return 5 * mag
  return 10 * mag
}
