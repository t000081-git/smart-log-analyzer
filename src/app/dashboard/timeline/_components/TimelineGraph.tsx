'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { LogSeverity } from '@/types/database'

export type RangeKey = '1h' | '6h' | '24h' | '7d'

export interface TimelineEvent {
  id: string
  ts: string
  severity: LogSeverity
  source_type: string
  message: string
}

export interface TimelineCluster {
  id: string
  label: string
  event_count: number
  first_seen: string | null
  last_seen: string | null
  severity_distribution: Record<string, number>
}

interface Props {
  events: TimelineEvent[]
  clusters: TimelineCluster[]
  memberships: Record<string, string>
  windowHours: number
  range: RangeKey
}

type View = 'swimlane' | 'stream' | 'scatter'

const SOURCE_LANE: Record<string, { label: string; color: string; textColor: string }> = {
  linux_syslog: { label: 'Linux Syslog', color: '#0ea5e9', textColor: '#ffffff' },
  windows_event: { label: 'Windows', color: '#8b5cf6', textColor: '#ffffff' },
  prtg: { label: 'PRTG', color: '#10b981', textColor: '#ffffff' },
  dxt_netboss: { label: 'DXT · Netboss', color: '#f43f5e', textColor: '#ffffff' },
  ericsson_5g: { label: 'Ericsson 5G', color: '#f59e0b', textColor: '#0c0a09' },
  smart_log_analyzer_export: { label: 'SLA Export', color: '#d946ef', textColor: '#ffffff' },
  smart_log_analyzer_operational: { label: 'SLA Ops', color: '#06b6d4', textColor: '#0c0a09' },
  generic_text: { label: 'Generic', color: '#64748b', textColor: '#ffffff' },
}
const UNKNOWN_LANE = { label: 'Other', color: '#52525b', textColor: '#ffffff' }

const SEVERITY_ORDER: LogSeverity[] = ['critical', 'error', 'warning', 'info', 'debug']
const SEVERITY_COLOR: Record<LogSeverity, string> = {
  critical: '#dc2626',
  error: '#f43f5e',
  warning: '#f59e0b',
  info: '#38bdf8',
  debug: '#71717a',
}
const SEVERITY_GLOW: Record<LogSeverity, string> = {
  critical: 'rgba(220,38,38,0.4)',
  error: 'rgba(244,63,94,0.35)',
  warning: 'rgba(245,158,11,0.3)',
  info: 'rgba(56,189,248,0.25)',
  debug: 'rgba(113,113,122,0.2)',
}

const BUCKET_COUNT = 72

export default function TimelineGraph({
  events,
  clusters,
  memberships,
  windowHours,
  range,
}: Props) {
  const [view, setView] = useState<View>('swimlane')

  const stats = useMemo(() => computeStats(events, windowHours), [events, windowHours])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <RangePills active={range} />
        <ViewTabs view={view} onChange={setView} />
      </div>

      <StatsStrip stats={stats} />

      <div className="rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-900/40 p-5">
        {events.length === 0 ? (
          <EmptyState windowHours={windowHours} />
        ) : view === 'swimlane' ? (
          <SwimlaneView
            events={events}
            clusters={clusters}
            memberships={memberships}
            windowHours={windowHours}
          />
        ) : view === 'stream' ? (
          <StreamView events={events} windowHours={windowHours} />
        ) : (
          <ScatterView events={events} windowHours={windowHours} />
        )}
      </div>
    </div>
  )
}

interface Stats {
  total: number
  peakBucketLabel: string | null
  peakBucketCount: number
  dominant: LogSeverity | null
  dominantPct: number
  critical: number
  error: number
}

function computeStats(events: TimelineEvent[], windowHours: number): Stats {
  if (events.length === 0) {
    return { total: 0, peakBucketLabel: null, peakBucketCount: 0, dominant: null, dominantPct: 0, critical: 0, error: 0 }
  }

  const start = Date.now() - windowHours * 3600 * 1000
  const span = windowHours * 3600 * 1000
  const buckets = new Array<number>(BUCKET_COUNT).fill(0)
  const severityCounts: Record<LogSeverity, number> = {
    critical: 0,
    error: 0,
    warning: 0,
    info: 0,
    debug: 0,
  }

  for (const e of events) {
    const t = new Date(e.ts).getTime()
    const idx = Math.min(BUCKET_COUNT - 1, Math.max(0, Math.floor(((t - start) / span) * BUCKET_COUNT)))
    buckets[idx]! += 1
    severityCounts[e.severity] += 1
  }

  let peakIdx = 0
  for (let i = 1; i < buckets.length; i++) {
    if (buckets[i]! > buckets[peakIdx]!) peakIdx = i
  }
  const peakT = start + (peakIdx / BUCKET_COUNT) * span
  const peakLabel = formatBucketTimestamp(peakT, windowHours)

  let dominant: LogSeverity = 'info'
  let dominantCount = 0
  for (const sev of SEVERITY_ORDER) {
    if (severityCounts[sev] > dominantCount) {
      dominant = sev
      dominantCount = severityCounts[sev]
    }
  }

  return {
    total: events.length,
    peakBucketLabel: peakLabel,
    peakBucketCount: buckets[peakIdx]!,
    dominant,
    dominantPct: Math.round((dominantCount / events.length) * 100),
    critical: severityCounts.critical,
    error: severityCounts.error,
  }
}

function formatBucketTimestamp(t: number, windowHours: number): string {
  const d = new Date(t)
  if (windowHours <= 24) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function StatsStrip({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatTile label="Events" value={stats.total.toLocaleString()} note="in window" accent="sky" />
      <StatTile
        label="Peak"
        value={stats.peakBucketCount.toString()}
        note={stats.peakBucketLabel ?? '—'}
        accent="violet"
      />
      <StatTile
        label="Dominant"
        value={stats.dominant ?? '—'}
        note={stats.dominant ? `${stats.dominantPct}% of events` : '—'}
        accent={stats.dominant ? severityAccent(stats.dominant) : 'zinc'}
      />
      <StatTile
        label="Critical + Error"
        value={(stats.critical + stats.error).toLocaleString()}
        note={stats.critical > 0 ? `${stats.critical} critical` : 'no critical'}
        accent={stats.critical + stats.error > 0 ? 'rose' : 'zinc'}
        pulse={stats.critical > 0}
      />
    </div>
  )
}

function severityAccent(sev: LogSeverity): keyof typeof STAT_ACCENT {
  if (sev === 'critical' || sev === 'error') return 'rose'
  if (sev === 'warning') return 'amber'
  if (sev === 'info') return 'sky'
  return 'zinc'
}

const STAT_ACCENT = {
  sky: { ring: 'border-sky-500/20', glow: 'from-sky-500/10', value: 'text-sky-300' },
  violet: { ring: 'border-violet-500/20', glow: 'from-violet-500/10', value: 'text-violet-300' },
  rose: { ring: 'border-rose-500/30', glow: 'from-rose-500/15', value: 'text-rose-300' },
  amber: { ring: 'border-amber-500/20', glow: 'from-amber-500/10', value: 'text-amber-300' },
  zinc: { ring: 'border-zinc-800', glow: 'from-zinc-800/30', value: 'text-zinc-200' },
} as const

function StatTile({
  label,
  value,
  note,
  accent,
  pulse,
}: {
  label: string
  value: string
  note: string
  accent: keyof typeof STAT_ACCENT
  pulse?: boolean
}) {
  const a = STAT_ACCENT[accent]
  return (
    <div className={`relative overflow-hidden rounded-xl border bg-zinc-900 p-4 ${a.ring}`}>
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${a.glow} to-transparent opacity-60`} />
      <div className="relative">
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">{label}</p>
        <p className={`mt-2 font-mono text-xl font-semibold tabular-nums ${a.value} ${pulse ? 'animate-pulse' : ''}`}>
          {value}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">{note}</p>
      </div>
    </div>
  )
}

function RangePills({ active }: { active: RangeKey }) {
  const ranges: RangeKey[] = ['1h', '6h', '24h', '7d']
  return (
    <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900/60 p-1">
      {ranges.map((r) => {
        const isActive = r === active
        return (
          <Link
            key={r}
            href={`?range=${r}`}
            scroll={false}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              isActive
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {r}
          </Link>
        )
      })}
    </div>
  )
}

function ViewTabs({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const items: { id: View; label: string }[] = [
    { id: 'swimlane', label: 'Swimlane' },
    { id: 'stream', label: 'Stream' },
    { id: 'scatter', label: 'Scatter' },
  ]
  return (
    <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900/60 p-1">
      {items.map(({ id, label }) => {
        const active = id === view
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              active ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function EmptyState({ windowHours }: { windowHours: number }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <svg viewBox="0 0 48 48" className="h-10 w-10 text-zinc-700" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path d="M6 24h6l4-12 6 24 4-12 4 6h12" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="mt-4 text-sm text-zinc-400">No events in the last {windowHours} hours.</p>
      <Link
        href="/dashboard/ingest"
        className="mt-3 text-xs text-sky-400 hover:text-sky-300"
      >
        → Upload a log file
      </Link>
    </div>
  )
}

const PAD = { top: 16, right: 24, bottom: 32, left: 56 }

function StreamView({ events, windowHours }: { events: TimelineEvent[]; windowHours: number }) {
  const width = 880
  const height = 280
  const plotW = width - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom

  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const { buckets, bucketMs, start, maxStack } = useMemo(
    () => bucketEvents(events, windowHours),
    [events, windowHours]
  )

  const barW = plotW / BUCKET_COUNT

  const tickCount = windowHours <= 6 ? 6 : windowHours <= 24 ? 8 : 7
  const ticks = useMemo(() => {
    const arr: { x: number; label: string }[] = []
    for (let i = 0; i <= tickCount; i++) {
      const t = start + (i / tickCount) * windowHours * 3600 * 1000
      arr.push({
        x: PAD.left + (i / tickCount) * plotW,
        label: formatBucketTimestamp(t, windowHours),
      })
    }
    return arr
  }, [start, windowHours, plotW, tickCount])

  const yTicks = useMemo(() => {
    if (maxStack === 0) return [0]
    const niceMax = niceCeil(maxStack)
    const steps = 4
    return Array.from({ length: steps + 1 }, (_, i) => Math.round((niceMax * i) / steps))
  }, [maxStack])

  const yMax = yTicks[yTicks.length - 1] || 1

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          {SEVERITY_ORDER.map((sev) => (
            <linearGradient key={sev} id={`grad-${sev}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SEVERITY_COLOR[sev]} stopOpacity="0.95" />
              <stop offset="100%" stopColor={SEVERITY_COLOR[sev]} stopOpacity="0.55" />
            </linearGradient>
          ))}
        </defs>

        {yTicks.map((v, i) => {
          const y = PAD.top + plotH - (v / yMax) * plotH
          return (
            <g key={i}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y}
                y2={y}
                stroke="#27272a"
                strokeDasharray={i === 0 ? '' : '2 4'}
              />
              <text
                x={PAD.left - 10}
                y={y + 3}
                fontSize={10}
                textAnchor="end"
                fill="#52525b"
                className="font-mono tabular-nums"
              >
                {v}
              </text>
            </g>
          )
        })}

        {ticks.map((t, i) => (
          <text
            key={i}
            x={t.x}
            y={height - PAD.bottom + 16}
            fontSize={10}
            textAnchor="middle"
            fill="#52525b"
            className="font-mono"
          >
            {t.label}
          </text>
        ))}

        {buckets.map((b, i) => {
          const x = PAD.left + i * barW
          let stackY = PAD.top + plotH
          return (
            <g
              key={i}
              onMouseEnter={() => setHoverIdx(i)}
            >
              <rect
                x={x}
                y={PAD.top}
                width={barW}
                height={plotH}
                fill="transparent"
              />
              {SEVERITY_ORDER.slice().reverse().map((sev) => {
                const count = b.counts[sev]
                if (count === 0) return null
                const h = (count / yMax) * plotH
                stackY -= h
                return (
                  <rect
                    key={sev}
                    x={x + 0.5}
                    y={stackY}
                    width={Math.max(barW - 1, 1)}
                    height={h}
                    fill={`url(#grad-${sev})`}
                    opacity={hoverIdx === null || hoverIdx === i ? 1 : 0.35}
                  />
                )
              })}
            </g>
          )
        })}

        {hoverIdx !== null && (
          <line
            x1={PAD.left + hoverIdx * barW + barW / 2}
            x2={PAD.left + hoverIdx * barW + barW / 2}
            y1={PAD.top}
            y2={height - PAD.bottom}
            stroke="#a3a3a3"
            strokeDasharray="2 3"
            strokeWidth={1}
            opacity={0.5}
          />
        )}
      </svg>

      <Legend />

      {hoverIdx !== null && (
        <BucketTooltip
          bucket={buckets[hoverIdx]!}
          bucketMs={bucketMs}
          windowHours={windowHours}
        />
      )}
    </div>
  )
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 px-1">
      {SEVERITY_ORDER.map((sev) => (
        <div key={sev} className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{
              background: SEVERITY_COLOR[sev],
              boxShadow: `0 0 8px ${SEVERITY_GLOW[sev]}`,
            }}
          />
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
            {sev}
          </span>
        </div>
      ))}
    </div>
  )
}

function BucketTooltip({
  bucket,
  bucketMs,
  windowHours,
}: {
  bucket: Bucket
  bucketMs: number
  windowHours: number
}) {
  const start = formatBucketTimestamp(bucket.start, windowHours)
  const end = formatBucketTimestamp(bucket.start + bucketMs, windowHours)
  const total = SEVERITY_ORDER.reduce((sum, s) => sum + bucket.counts[s], 0)

  return (
    <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs text-zinc-300">
          {start} → {end}
        </p>
        <p className="font-mono text-xs">
          <span className="text-zinc-500">total </span>
          <span className="text-white font-semibold">{total}</span>
        </p>
      </div>
      <div className="mt-2 flex flex-wrap gap-3">
        {SEVERITY_ORDER.map((sev) => {
          const n = bucket.counts[sev]
          if (n === 0) return null
          return (
            <span
              key={sev}
              className="font-mono text-[11px]"
              style={{ color: SEVERITY_COLOR[sev] }}
            >
              {sev}: {n}
            </span>
          )
        })}
      </div>
    </div>
  )
}

interface Bucket {
  start: number
  counts: Record<LogSeverity, number>
}

function bucketEvents(events: TimelineEvent[], windowHours: number) {
  const start = Date.now() - windowHours * 3600 * 1000
  const span = windowHours * 3600 * 1000
  const bucketMs = span / BUCKET_COUNT
  const buckets: Bucket[] = Array.from({ length: BUCKET_COUNT }, (_, i) => ({
    start: start + i * bucketMs,
    counts: { critical: 0, error: 0, warning: 0, info: 0, debug: 0 },
  }))

  let maxStack = 0
  for (const e of events) {
    const t = new Date(e.ts).getTime()
    const idx = Math.min(BUCKET_COUNT - 1, Math.max(0, Math.floor(((t - start) / span) * BUCKET_COUNT)))
    buckets[idx]!.counts[e.severity] += 1
  }
  for (const b of buckets) {
    const sum = SEVERITY_ORDER.reduce((s, sev) => s + b.counts[sev], 0)
    if (sum > maxStack) maxStack = sum
  }

  return { buckets, bucketMs, start, maxStack }
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

function ScatterView({ events, windowHours }: { events: TimelineEvent[]; windowHours: number }) {
  const width = 880
  const height = 320
  const plotW = width - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom

  const [hovered, setHovered] = useState<TimelineEvent | null>(null)

  const now = Date.now()
  const start = now - windowHours * 3600 * 1000

  const points = useMemo(() => {
    const sevAxis: LogSeverity[] = ['debug', 'info', 'warning', 'error', 'critical']
    return events.map((e) => {
      const t = new Date(e.ts).getTime()
      const x = PAD.left + ((t - start) / (now - start)) * plotW
      const sevIdx = sevAxis.indexOf(e.severity)
      const y = PAD.top + plotH - ((sevIdx + 0.5) / sevAxis.length) * plotH
      return { x, y, e }
    })
  }, [events, start, now, plotH, plotW])

  const sevAxis: LogSeverity[] = ['debug', 'info', 'warning', 'error', 'critical']
  const tickCount = windowHours <= 6 ? 6 : 8
  const ticks = useMemo(() => {
    const arr: { x: number; label: string }[] = []
    for (let i = 0; i <= tickCount; i++) {
      const t = start + (i / tickCount) * (now - start)
      arr.push({
        x: PAD.left + (i / tickCount) * plotW,
        label: formatBucketTimestamp(t, windowHours),
      })
    }
    return arr
  }, [start, now, plotW, tickCount, windowHours])

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        {sevAxis.map((sev, i) => {
          const y = PAD.top + plotH - ((i + 0.5) / sevAxis.length) * plotH
          return (
            <g key={sev}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y}
                y2={y}
                stroke="#27272a"
                strokeDasharray="2 4"
              />
              <text
                x={PAD.left - 10}
                y={y + 4}
                fontSize={10}
                textAnchor="end"
                fill={SEVERITY_COLOR[sev]}
                className="font-mono uppercase"
              >
                {sev}
              </text>
            </g>
          )
        })}

        {ticks.map((t, i) => (
          <text
            key={i}
            x={t.x}
            y={height - PAD.bottom + 16}
            fontSize={10}
            textAnchor="middle"
            fill="#52525b"
            className="font-mono"
          >
            {t.label}
          </text>
        ))}

        {points.map(({ x, y, e }) => (
          <g key={e.id}>
            <circle
              cx={x}
              cy={y}
              r={hovered?.id === e.id ? 7 : 4}
              fill={SEVERITY_COLOR[e.severity]}
              opacity={hovered && hovered.id !== e.id ? 0.25 : 0.9}
              style={{
                cursor: 'pointer',
                transition: 'r 120ms, opacity 120ms',
                filter: `drop-shadow(0 0 4px ${SEVERITY_GLOW[e.severity]})`,
              }}
              onMouseEnter={() => setHovered(e)}
              onMouseLeave={() => setHovered(null)}
            />
          </g>
        ))}
      </svg>

      <Legend />

      {hovered && (
        <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950 p-3 text-xs">
          <div className="flex items-center gap-2">
            <span
              className="font-mono uppercase tracking-wider"
              style={{ color: SEVERITY_COLOR[hovered.severity] }}
            >
              {hovered.severity}
            </span>
            <span className="text-zinc-500">·</span>
            <span className="text-zinc-400">{hovered.source_type}</span>
            <span className="text-zinc-500">·</span>
            <span className="font-mono text-zinc-500">
              {new Date(hovered.ts).toLocaleString()}
            </span>
          </div>
          <p className="mt-2 font-mono text-zinc-300">{hovered.message}</p>
        </div>
      )}
    </div>
  )
}

interface SwimlaneBar {
  kind: 'bar'
  id: string
  startMs: number
  endMs: number
  count: number
  severity: LogSeverity
  label: string
  clusterId?: string
}

interface SwimlaneMarker {
  kind: 'marker'
  id: string
  ts: number
  severity: LogSeverity
  message: string
  source_type: string
}

interface Lane {
  source_type: string
  lane: { label: string; color: string; textColor: string }
  total: number
  bars: SwimlaneBar[]
  markers: SwimlaneMarker[]
}

function buildLanes(
  events: TimelineEvent[],
  clusters: TimelineCluster[],
  memberships: Record<string, string>,
  windowHours: number,
  now: number
): Lane[] {
  const start = now - windowHours * 3600 * 1000
  const gapMs = (windowHours * 3600 * 1000) / 24
  const minBurst = 3

  const eventsBySource = new Map<string, TimelineEvent[]>()
  for (const e of events) {
    const list = eventsBySource.get(e.source_type) ?? []
    list.push(e)
    eventsBySource.set(e.source_type, list)
  }

  const lanes: Lane[] = []

  for (const [source_type, evs] of eventsBySource.entries()) {
    const sorted = [...evs].sort(
      (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
    )
    const lane = SOURCE_LANE[source_type] ?? UNKNOWN_LANE
    const bars: SwimlaneBar[] = []
    const markers: SwimlaneMarker[] = []

    let burst: TimelineEvent[] = []
    const flushBurst = () => {
      if (burst.length >= minBurst) {
        const tsStart = new Date(burst[0]!.ts).getTime()
        const tsEnd = new Date(burst[burst.length - 1]!.ts).getTime()
        const dominantSev = dominantSeverity(burst)
        const sampleMessage = burst.find((e) => e.severity === dominantSev)?.message ?? burst[0]!.message
        bars.push({
          kind: 'bar',
          id: `burst-${source_type}-${tsStart}`,
          startMs: tsStart,
          endMs: Math.max(tsEnd, tsStart + 60_000),
          count: burst.length,
          severity: dominantSev,
          label: shortLabel(sampleMessage, 36),
        })
      } else {
        for (const e of burst) {
          if (e.severity === 'critical' || e.severity === 'error') {
            markers.push({
              kind: 'marker',
              id: e.id,
              ts: new Date(e.ts).getTime(),
              severity: e.severity,
              message: e.message,
              source_type: e.source_type,
            })
          }
        }
      }
      burst = []
    }

    for (const e of sorted) {
      if (burst.length === 0) {
        burst.push(e)
        continue
      }
      const prev = burst[burst.length - 1]!
      if (new Date(e.ts).getTime() - new Date(prev.ts).getTime() > gapMs) {
        flushBurst()
        burst.push(e)
      } else {
        burst.push(e)
      }
    }
    flushBurst()

    for (const c of clusters) {
      const memberIds = Object.entries(memberships)
        .filter(([, cid]) => cid === c.id)
        .map(([eid]) => eid)
      const memberEvents = memberIds
        .map((id) => evs.find((e) => e.id === id))
        .filter((x): x is TimelineEvent => Boolean(x))
      if (memberEvents.length === 0) continue
      const first = c.first_seen
        ? new Date(c.first_seen).getTime()
        : Math.min(...memberEvents.map((e) => new Date(e.ts).getTime()))
      const last = c.last_seen
        ? new Date(c.last_seen).getTime()
        : Math.max(...memberEvents.map((e) => new Date(e.ts).getTime()))
      bars.push({
        kind: 'bar',
        id: `cluster-${c.id}`,
        startMs: Math.max(first, start),
        endMs: Math.max(last, first + 60_000),
        count: c.event_count,
        severity: dominantSeverity(memberEvents),
        label: c.label,
        clusterId: c.id,
      })
    }

    bars.sort((a, b) => a.startMs - b.startMs)

    lanes.push({
      source_type,
      lane,
      total: evs.length,
      bars,
      markers,
    })
  }

  lanes.sort((a, b) => b.total - a.total)
  return lanes
}

function dominantSeverity(events: TimelineEvent[]): LogSeverity {
  const counts: Record<LogSeverity, number> = { critical: 0, error: 0, warning: 0, info: 0, debug: 0 }
  for (const e of events) counts[e.severity] += 1
  for (const sev of SEVERITY_ORDER) {
    if (counts[sev] > 0) return sev
  }
  return 'info'
}

function shortLabel(s: string, max: number): string {
  const trimmed = s.replace(/\s+/g, ' ').trim()
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed
}

function SwimlaneView({
  events,
  clusters,
  memberships,
  windowHours,
}: {
  events: TimelineEvent[]
  clusters: TimelineCluster[]
  memberships: Record<string, string>
  windowHours: number
}) {
  const now = Date.now()
  const start = now - windowHours * 3600 * 1000

  const lanes = useMemo(
    () => buildLanes(events, clusters, memberships, windowHours, now),
    [events, clusters, memberships, windowHours, now]
  )

  const [hovered, setHovered] = useState<
    | { kind: 'bar'; bar: SwimlaneBar; lane: Lane }
    | { kind: 'marker'; marker: SwimlaneMarker; lane: Lane }
    | null
  >(null)

  const LANE_LABEL_W = 116
  const PAD_RIGHT = 28
  const AXIS_H = 56
  const LANE_H = 60
  const BOTTOM_PAD = 20

  const totalW = 1100
  const plotW = totalW - LANE_LABEL_W - PAD_RIGHT
  const totalH = AXIS_H + lanes.length * LANE_H + BOTTOM_PAD

  const xAt = (t: number) => LANE_LABEL_W + ((t - start) / (now - start)) * plotW

  const { chapters, ticks } = useMemo(
    () => buildAxis(start, now, windowHours, LANE_LABEL_W, plotW),
    [start, now, windowHours, plotW]
  )

  if (lanes.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-zinc-800 bg-zinc-950 p-10 text-center">
        <p className="text-sm text-zinc-400">No swimlane data yet.</p>
      </div>
    )
  }

  return (
    <div>
      <svg viewBox={`0 -18 ${totalW} ${totalH + 18}`} className="w-full">
        <defs>
          {[...SEVERITY_ORDER, 'lane-sky'].map((key) => {
            const k = key as LogSeverity
            const c = SEVERITY_COLOR[k]
            if (!c) return null
            return (
              <linearGradient key={key} id={`sw-grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c} stopOpacity="0.95" />
                <stop offset="100%" stopColor={c} stopOpacity="0.65" />
              </linearGradient>
            )
          })}
        </defs>

        {chapters.map((ch, i) => (
          <g key={`ch-${i}`}>
            <rect
              x={ch.x}
              y={0}
              width={ch.w}
              height={32}
              fill={i % 2 === 0 ? '#0f172a' : '#0c1322'}
              stroke="#1e293b"
            />
            <text
              x={ch.x + ch.w / 2}
              y={20}
              fontSize={11}
              textAnchor="middle"
              fill="#93c5fd"
              className="font-mono uppercase tracking-wider"
            >
              {ch.label}
            </text>
            <line
              x1={ch.x + ch.w}
              x2={ch.x + ch.w}
              y1={32}
              y2={totalH - BOTTOM_PAD}
              stroke="#1e293b"
              strokeDasharray="2 3"
            />
          </g>
        ))}

        {ticks.map((t, i) => (
          <text
            key={`tk-${i}`}
            x={t.x}
            y={48}
            fontSize={9}
            textAnchor="middle"
            fill="#64748b"
            className="font-mono"
          >
            {t.label}
          </text>
        ))}

        <g>
          <polygon
            points={`${LANE_LABEL_W + plotW - 6},0 ${LANE_LABEL_W + plotW + 6},0 ${LANE_LABEL_W + plotW},10`}
            fill="#ef4444"
          />
          <line
            x1={LANE_LABEL_W + plotW}
            x2={LANE_LABEL_W + plotW}
            y1={0}
            y2={totalH - BOTTOM_PAD}
            stroke="#ef4444"
            strokeOpacity={0.5}
            strokeDasharray="3 3"
          />
          <text
            x={LANE_LABEL_W + plotW}
            y={-2}
            fontSize={10}
            fill="#fca5a5"
            textAnchor="middle"
            className="font-mono uppercase"
          >
            Now
          </text>
        </g>

        {lanes.map((lane, laneIdx) => {
          const y = AXIS_H + laneIdx * LANE_H
          const midY = y + LANE_H / 2
          return (
            <g key={lane.source_type}>
              <rect
                x={0}
                y={y}
                width={LANE_LABEL_W - 4}
                height={LANE_H - 6}
                rx={6}
                fill={lane.lane.color}
                opacity={0.95}
              />
              <text
                x={LANE_LABEL_W / 2 - 2}
                y={midY - 4}
                fontSize={12}
                fontWeight={600}
                textAnchor="middle"
                fill={lane.lane.textColor}
                className="font-semibold"
              >
                {lane.lane.label}
              </text>
              <text
                x={LANE_LABEL_W / 2 - 2}
                y={midY + 10}
                fontSize={9}
                textAnchor="middle"
                fill={lane.lane.textColor}
                opacity={0.75}
                className="font-mono"
              >
                {lane.total} events
              </text>

              <rect
                x={LANE_LABEL_W}
                y={y + 4}
                width={plotW}
                height={LANE_H - 12}
                fill={laneIdx % 2 === 0 ? '#0a0a0c' : '#0d0d10'}
                stroke="#18181b"
                rx={4}
              />

              {lane.bars.map((bar) => {
                const x1 = xAt(bar.startMs)
                const x2 = xAt(bar.endMs)
                const w = Math.max(x2 - x1, 18)
                const h = 28
                const cy = midY - h / 2
                const chev = Math.min(10, w / 3)
                const path = `M ${x1} ${cy} H ${x1 + w - chev} L ${x1 + w} ${cy + h / 2} L ${x1 + w - chev} ${cy + h} H ${x1} Z`
                const isHovered =
                  hovered?.kind === 'bar' && hovered.bar.id === bar.id
                return (
                  <g
                    key={bar.id}
                    onMouseEnter={() => setHovered({ kind: 'bar', bar, lane })}
                    onMouseLeave={() => setHovered(null)}
                    style={{ cursor: 'pointer' }}
                  >
                    <path
                      d={path}
                      fill={`url(#sw-grad-${bar.severity})`}
                      opacity={isHovered ? 1 : 0.92}
                      style={{
                        filter: isHovered
                          ? `drop-shadow(0 0 8px ${SEVERITY_GLOW[bar.severity]})`
                          : 'none',
                        transition: 'opacity 120ms, filter 120ms',
                      }}
                    />
                    {w >= 70 && (
                      <text
                        x={x1 + 8}
                        y={cy + h / 2 + 4}
                        fontSize={10}
                        fill="#0c0a09"
                        className="font-medium"
                      >
                        {bar.label}
                      </text>
                    )}
                    {w >= 24 && bar.count > 1 && (
                      <text
                        x={x1 + w - chev - 4}
                        y={cy + h / 2 + 3}
                        fontSize={9}
                        textAnchor="end"
                        fill="#0c0a09"
                        className="font-mono"
                      >
                        ×{bar.count}
                      </text>
                    )}
                  </g>
                )
              })}

              {lane.markers.map((m) => {
                const x = xAt(m.ts)
                const size = 8
                const isHovered =
                  hovered?.kind === 'marker' && hovered.marker.id === m.id
                return (
                  <g
                    key={m.id}
                    onMouseEnter={() => setHovered({ kind: 'marker', marker: m, lane })}
                    onMouseLeave={() => setHovered(null)}
                    style={{ cursor: 'pointer' }}
                  >
                    <polygon
                      points={`${x},${midY - size} ${x + size},${midY} ${x},${midY + size} ${x - size},${midY}`}
                      fill={SEVERITY_COLOR[m.severity]}
                      opacity={isHovered ? 1 : 0.9}
                      style={{
                        filter: `drop-shadow(0 0 6px ${SEVERITY_GLOW[m.severity]})`,
                        transition: 'opacity 120ms',
                      }}
                    />
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>

      <SwimlaneTooltip hovered={hovered} />
      <Legend />
    </div>
  )
}

function buildAxis(
  start: number,
  end: number,
  windowHours: number,
  xOffset: number,
  plotW: number
) {
  const chapters: { x: number; w: number; label: string }[] = []
  const ticks: { x: number; label: string }[] = []

  const span = end - start

  let chapterMs: number
  let chapterLabelFmt: (t: Date) => string

  if (windowHours <= 1) {
    chapterMs = 15 * 60 * 1000
    chapterLabelFmt = (t) => t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else if (windowHours <= 6) {
    chapterMs = 60 * 60 * 1000
    chapterLabelFmt = (t) => t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else if (windowHours <= 24) {
    chapterMs = 4 * 60 * 60 * 1000
    chapterLabelFmt = (t) => t.toLocaleTimeString([], { hour: '2-digit' }) + ':00'
  } else {
    chapterMs = 24 * 60 * 60 * 1000
    chapterLabelFmt = (t) => t.toLocaleDateString([], { weekday: 'short', day: 'numeric' })
  }

  const firstChapterStart = Math.ceil(start / chapterMs) * chapterMs
  let t = firstChapterStart - chapterMs
  while (t < end) {
    const next = t + chapterMs
    const cStart = Math.max(t, start)
    const cEnd = Math.min(next, end)
    const x = xOffset + ((cStart - start) / span) * plotW
    const w = ((cEnd - cStart) / span) * plotW
    if (w > 4) {
      chapters.push({ x, w, label: chapterLabelFmt(new Date(t)) })
    }
    t = next
  }

  const tickCount = windowHours <= 1 ? 6 : windowHours <= 6 ? 7 : windowHours <= 24 ? 8 : 8
  for (let i = 0; i <= tickCount; i++) {
    const tt = start + (i / tickCount) * span
    ticks.push({
      x: xOffset + (i / tickCount) * plotW,
      label: new Date(tt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    })
  }

  return { chapters, ticks }
}

function SwimlaneTooltip({
  hovered,
}: {
  hovered:
    | { kind: 'bar'; bar: SwimlaneBar; lane: Lane }
    | { kind: 'marker'; marker: SwimlaneMarker; lane: Lane }
    | null
}) {
  if (!hovered) return null

  if (hovered.kind === 'bar') {
    const { bar, lane } = hovered
    return (
      <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950 p-3 text-xs">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-4 items-center rounded-sm px-1.5 font-medium text-[10px]"
            style={{ background: lane.lane.color, color: lane.lane.textColor }}
          >
            {lane.lane.label}
          </span>
          <span
            className="font-mono uppercase tracking-wider"
            style={{ color: SEVERITY_COLOR[bar.severity] }}
          >
            {bar.severity}
          </span>
          {bar.clusterId && (
            <span className="font-mono text-[10px] text-zinc-500">cluster</span>
          )}
        </div>
        <p className="mt-2 text-zinc-200">{bar.label}</p>
        <p className="mt-1 font-mono text-[10px] text-zinc-500">
          {new Date(bar.startMs).toLocaleString()} → {new Date(bar.endMs).toLocaleString()}
          {' · '}
          {bar.count} event{bar.count === 1 ? '' : 's'}
        </p>
      </div>
    )
  }

  const { marker, lane } = hovered
  return (
    <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950 p-3 text-xs">
      <div className="flex items-center gap-2">
        <span
          className="inline-flex h-4 items-center rounded-sm px-1.5 font-medium text-[10px]"
          style={{ background: lane.lane.color, color: lane.lane.textColor }}
        >
          {lane.lane.label}
        </span>
        <span
          className="font-mono uppercase tracking-wider"
          style={{ color: SEVERITY_COLOR[marker.severity] }}
        >
          {marker.severity}
        </span>
        <span className="font-mono text-[10px] text-zinc-500">
          {new Date(marker.ts).toLocaleString()}
        </span>
      </div>
      <p className="mt-2 font-mono text-zinc-300">{marker.message}</p>
    </div>
  )
}
