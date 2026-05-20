'use client'

import { useState, useEffect } from 'react'

export type SeverityKey = 'debug' | 'info' | 'warning' | 'error' | 'critical'

export const SEVERITY_RANK: Record<SeverityKey, number> = {
  critical: 4, error: 3, warning: 2, info: 1, debug: 0,
}
const SEVERITY_FILL: Record<SeverityKey, string> = {
  critical: '#ef4444', error: '#f97316', warning: '#f59e0b', info: '#0ea5e9', debug: '#71717a',
}
const SEVERITY_ORDER: SeverityKey[] = ['critical', 'error', 'warning', 'info', 'debug']

export interface EventRow {
  id: string
  timestamp: string
  severity: SeverityKey
  source_type: string
  source_id: string
  message: string
  log_cluster_members: { cluster_id: string }[] | null
}

export interface ClusterRow {
  id: string
  label: string | null
  first_seen: string | null
  last_seen: string | null
  severity_distribution: Record<string, number> | null
  event_count: number
}

function dominantSeverity(dist: Record<string, number> | null): SeverityKey {
  if (!dist) return 'info'
  let best: SeverityKey = 'info'
  let bestRank = -1
  for (const [sev, count] of Object.entries(dist)) {
    if (count > 0 && (SEVERITY_RANK[sev as SeverityKey] ?? -1) > bestRank) {
      best = sev as SeverityKey
      bestRank = SEVERITY_RANK[sev as SeverityKey]
    }
  }
  return best
}

function makeTimeTicks(min: number, max: number, count: number): number[] {
  const step = (max - min) / Math.max(count - 1, 1)
  return Array.from({ length: count }, (_, i) => Math.round(min + step * i))
}

function formatTick(t: number, spanMs: number): string {
  const d = new Date(t)
  const iso = d.toISOString()
  if (spanMs > 86_400_000) return iso.slice(0, 10)
  if (spanMs > 3_600_000) return iso.slice(11, 16) + ' ' + iso.slice(0, 10)
  return iso.slice(11, 19)
}

interface Props {
  events: EventRow[]
  clusters: ClusterRow[]
  highlightId?: string
}

export default function TimelineCharts({ events, clusters, highlightId }: Props) {
  // animating: true for exactly 2 seconds after page load when a highlight is present.
  // During this window the highlighted dot links back to its cluster.
  // After 2 seconds: animation stops, all dots link to /dashboard/logs.
  const [animating, setAnimating] = useState(!!highlightId)

  useEffect(() => {
    if (!highlightId) return
    const timer = setTimeout(() => setAnimating(false), 2000)
    return () => clearTimeout(timer)
  }, [highlightId])

  return (
    <div className="space-y-10">
      <div>
        <h2 className="mb-3 text-sm font-medium text-zinc-400 uppercase tracking-wide">
          Log Events — individual scatter
        </h2>
        {events.length === 0 ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
            No events yet.
          </div>
        ) : (
          <EventChart events={events} highlightId={highlightId} animating={animating} />
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-zinc-400 uppercase tracking-wide">
          Clusters — time span by dominant severity
        </h2>
        {clusters.length === 0 ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
            No clusters yet.
          </div>
        ) : (
          <ClusterChart clusters={clusters} />
        )}
      </div>
    </div>
  )
}

function EventChart({
  events,
  highlightId,
  animating,
}: {
  events: EventRow[]
  highlightId?: string
  animating: boolean
}) {
  const times = events.map((e) => new Date(e.timestamp).getTime())
  const tMin = Math.min(...times)
  const tMax = Math.max(...times)
  const tSpan = Math.max(tMax - tMin, 1)

  const width = 900
  const height = 320
  const padding = { top: 20, right: 20, bottom: 40, left: 80 }
  const plotW = width - padding.left - padding.right
  const plotH = height - padding.top - padding.bottom

  const xOf = (t: number) => padding.left + ((t - tMin) / tSpan) * plotW
  const yOf = (sev: SeverityKey) =>
    padding.top + plotH - ((SEVERITY_RANK[sev] + 0.5) * plotH) / 5

  const xTicks = makeTimeTicks(tMin, tMax, 6)

  const counts = SEVERITY_ORDER.reduce<Record<SeverityKey, number>>(
    (acc, k) => ({ ...acc, [k]: 0 }),
    {} as Record<SeverityKey, number>
  )
  for (const e of events) counts[e.severity] = (counts[e.severity] ?? 0) + 1

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        role="img"
        aria-label="Event timeline scatter"
      >
        {SEVERITY_ORDER.map((sev) => (
          <g key={sev}>
            <line
              x1={padding.left} x2={width - padding.right}
              y1={yOf(sev)} y2={yOf(sev)}
              stroke="#27272a" strokeDasharray="2 4"
            />
            <text
              x={padding.left - 8} y={yOf(sev) + 4}
              textAnchor="end" fontSize="11" fill="#a1a1aa"
              fontFamily="ui-sans-serif, system-ui"
            >
              {sev} <tspan fill="#71717a">· {counts[sev]}</tspan>
            </text>
          </g>
        ))}

        {xTicks.map((t) => (
          <g key={t}>
            <line
              x1={xOf(t)} x2={xOf(t)}
              y1={padding.top} y2={height - padding.bottom}
              stroke="#1f1f23"
            />
            <text
              x={xOf(t)} y={height - padding.bottom + 16}
              textAnchor="middle" fontSize="10" fill="#71717a"
              fontFamily="ui-monospace, SFMono-Regular"
            >
              {formatTick(t, tMax - tMin)}
            </text>
          </g>
        ))}

        {events.map((e) => {
          const isHighlighted = e.id === highlightId
          const clusterId = e.log_cluster_members?.[0]?.cluster_id

          // During the 2-second animation window: highlighted dot links to its cluster.
          // All other cases (including after animation ends): log detail page.
          const href = isHighlighted && animating && clusterId
            ? `/dashboard/clusters/${clusterId}`
            : `/dashboard/logs/${e.id}`

          const color = SEVERITY_FILL[e.severity] ?? SEVERITY_FILL.info
          const cx = xOf(new Date(e.timestamp).getTime())
          const cy = yOf(e.severity)

          const tooltip = isHighlighted && animating
            ? `${e.timestamp}\n[${e.severity}] ${e.source_id}: ${e.message}\n★ Click now to return to cluster · fades in 2s`
            : `${e.timestamp}\n[${e.severity}] ${e.source_id}: ${e.message}\n→ click to view log detail`

          return (
            <a key={e.id} href={href} style={{ cursor: 'pointer' }}>
              {/* Pulse rings: only rendered during the 2-second animation window */}
              {isHighlighted && animating && (
                <>
                  <circle cx={cx} cy={cy} r={7} fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.6}>
                    <animate attributeName="r" from="7" to="26" dur="2s" begin="0s" repeatCount="1" fill="freeze" />
                    <animate attributeName="stroke-opacity" from="0.6" to="0" dur="2s" begin="0s" repeatCount="1" fill="freeze" />
                  </circle>
                  <circle cx={cx} cy={cy} r={6} fill="none" stroke={color} strokeWidth={2} strokeOpacity={0.9}>
                    <animate attributeName="r" from="6" to="16" dur="1.2s" begin="0.3s" repeatCount="1" fill="freeze" />
                    <animate attributeName="stroke-opacity" from="0.9" to="0" dur="1.2s" begin="0.3s" repeatCount="1" fill="freeze" />
                  </circle>
                </>
              )}
              <circle
                cx={cx} cy={cy}
                r={isHighlighted && animating ? 6 : 5}
                fill={color}
                fillOpacity={isHighlighted && animating ? 1 : 0.85}
                stroke={isHighlighted && animating ? '#ffffff' : '#09090b'}
                strokeWidth={isHighlighted && animating ? 1.5 : 1}
              >
                <title>{tooltip}</title>
              </circle>
            </a>
          )
        })}
      </svg>

      <p className="mt-3 text-[11px] text-zinc-500">
        Hover a dot for detail · click to view logs.{' '}
        {highlightId && animating && (
          <span className="text-amber-500/80">★ Pulsing dot: click within 2s to return to cluster.</span>
        )}
      </p>
    </div>
  )
}

function ClusterChart({ clusters }: { clusters: ClusterRow[] }) {
  const validClusters = clusters.filter((c) => c.first_seen && c.last_seen)
  if (validClusters.length === 0) return null

  const times = validClusters.flatMap((c) => [
    new Date(c.first_seen!).getTime(),
    new Date(c.last_seen!).getTime(),
  ])
  const tMin = Math.min(...times)
  const tMax = Math.max(...times)
  const tSpan = Math.max(tMax - tMin, 1)

  const width = 900
  const height = 320
  const padding = { top: 20, right: 20, bottom: 40, left: 80 }
  const plotW = width - padding.left - padding.right
  const plotH = height - padding.top - padding.bottom

  const xOf = (t: number) => padding.left + ((t - tMin) / tSpan) * plotW
  const yOf = (sev: SeverityKey) =>
    padding.top + plotH - ((SEVERITY_RANK[sev] + 0.5) * plotH) / 5

  const xTicks = makeTimeTicks(tMin, tMax, 6)

  const counts = SEVERITY_ORDER.reduce<Record<SeverityKey, number>>(
    (acc, k) => ({ ...acc, [k]: 0 }),
    {} as Record<SeverityKey, number>
  )
  for (const c of validClusters) {
    const sev = dominantSeverity(c.severity_distribution)
    counts[sev] = (counts[sev] ?? 0) + 1
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        role="img"
        aria-label="Cluster timeline spans"
      >
        {SEVERITY_ORDER.map((sev) => (
          <g key={sev}>
            <line
              x1={padding.left} x2={width - padding.right}
              y1={yOf(sev)} y2={yOf(sev)}
              stroke="#27272a" strokeDasharray="2 4"
            />
            <text
              x={padding.left - 8} y={yOf(sev) + 4}
              textAnchor="end" fontSize="11" fill="#a1a1aa"
              fontFamily="ui-sans-serif, system-ui"
            >
              {sev} <tspan fill="#71717a">· {counts[sev]}</tspan>
            </text>
          </g>
        ))}

        {xTicks.map((t) => (
          <g key={t}>
            <line
              x1={xOf(t)} x2={xOf(t)}
              y1={padding.top} y2={height - padding.bottom}
              stroke="#1f1f23"
            />
            <text
              x={xOf(t)} y={height - padding.bottom + 16}
              textAnchor="middle" fontSize="10" fill="#71717a"
              fontFamily="ui-monospace, SFMono-Regular"
            >
              {formatTick(t, tMax - tMin)}
            </text>
          </g>
        ))}

        {validClusters.map((c) => {
          const sev = dominantSeverity(c.severity_distribution)
          const color = SEVERITY_FILL[sev]
          const x1 = xOf(new Date(c.first_seen!).getTime())
          const x2 = xOf(new Date(c.last_seen!).getTime())
          const y = yOf(sev)
          const isPoint = Math.abs(x2 - x1) < 2
          const label = c.label ?? `cluster ${c.id.slice(0, 6)}`
          const tooltip = `${label}\n${c.event_count} events · ${sev}\n${c.first_seen!.slice(0, 16)} → ${c.last_seen!.slice(0, 16)}\n→ click to open cluster`
          return (
            <a key={c.id} href={`/dashboard/clusters/${c.id}`} style={{ cursor: 'pointer' }}>
              {isPoint ? (
                <circle cx={x1} cy={y} r={6} fill={color} fillOpacity={0.85} stroke="#09090b" strokeWidth={1}>
                  <title>{tooltip}</title>
                </circle>
              ) : (
                <>
                  <line x1={x1} x2={x2} y1={y} y2={y} stroke="transparent" strokeWidth={20}>
                    <title>{tooltip}</title>
                  </line>
                  <line x1={x1} x2={x2} y1={y} y2={y} stroke={color} strokeWidth={5} strokeOpacity={0.7} strokeLinecap="round">
                    <title>{tooltip}</title>
                  </line>
                  <circle cx={x1} cy={y} r={3} fill={color} fillOpacity={0.9} stroke="#09090b" strokeWidth={1} />
                  <circle cx={x2} cy={y} r={3} fill={color} fillOpacity={0.9} stroke="#09090b" strokeWidth={1} />
                </>
              )}
            </a>
          )
        })}
      </svg>

      <p className="mt-3 text-[11px] text-zinc-500">
        Hover a bar for cluster detail · click to open cluster view. Width = time span · Y = dominant severity.
      </p>
    </div>
  )
}
