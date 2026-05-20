import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { LogSeverity } from '@/types/database'
import { toneFor } from '@/lib/sources'
import Sparkline from './_components/Sparkline'
import ActivityHistogram from './_components/ActivityHistogram'

export const dynamic = 'force-dynamic'

const WINDOW_HOURS = 24
const HOUR_BUCKETS = 24

const SEVERITY_COLOR: Record<LogSeverity, string> = {
  critical: '#dc2626',
  error: '#f43f5e',
  warning: '#f59e0b',
  info: '#38bdf8',
  debug: '#71717a',
}

interface RecentEventRow {
  id: string
  timestamp: string
  severity: LogSeverity
  source_type: string
  message: string
}

interface AlarmRow {
  id: string
  created_at: string
  severity: LogSeverity
  status: 'open' | 'cleared'
  notes: string | null
  cluster_id: string | null
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const since = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString()

  const [
    totalEventsRes,
    clustersCountRes,
    windowEventsRes,
    openAlarmsRes,
    recentEventsRes,
    recentAlarmsRes,
  ] = await Promise.all([
    supabase.from('log_events').select('id', { count: 'exact', head: true }),
    supabase.from('log_clusters').select('id', { count: 'exact', head: true }),
    supabase
      .from('log_events')
      .select('timestamp, severity, source_type')
      .gte('timestamp', since)
      .order('timestamp', { ascending: true })
      .limit(5000),
    supabase
      .from('alarms')
      .select('id, severity, status', { count: 'exact' })
      .eq('status', 'open'),
    supabase
      .from('log_events')
      .select('id, timestamp, severity, source_type, message')
      .order('timestamp', { ascending: false })
      .limit(8),
    supabase
      .from('alarms')
      .select('id, created_at, severity, status, notes, cluster_id')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const totalEvents = totalEventsRes.error ? 0 : (totalEventsRes.count ?? 0)
  const clusterCount = clustersCountRes.error ? 0 : (clustersCountRes.count ?? 0)
  const openAlarmCount = openAlarmsRes.error ? 0 : (openAlarmsRes.count ?? 0)

  const windowEvents = windowEventsRes.data ?? []
  const eventsLast24h = windowEvents.length

  const { buckets, sparkline, severityCounts, sourceTotals } = aggregate(
    windowEvents as Array<{ timestamp: string; severity: LogSeverity; source_type: string }>,
    since
  )

  const recentEvents: RecentEventRow[] = recentEventsRes.data ?? []
  const recentAlarms: AlarmRow[] = recentAlarmsRes.data ?? []
  const openAlarms = (openAlarmsRes.data ?? []) as Array<{ severity: LogSeverity }>
  const criticalOpen = openAlarms.filter((a) => a.severity === 'critical').length
  const errorOpen = openAlarms.filter((a) => a.severity === 'error').length

  const uniqueSources = new Set(windowEvents.map((e) => e.source_type)).size
  const dominantSource = [...sourceTotals.entries()].sort((a, b) => b[1] - a[1])[0]
  const noise = (severityCounts.info + severityCounts.debug)
  const signal = severityCounts.warning + severityCounts.error + severityCounts.critical
  const signalRatio = eventsLast24h > 0 ? Math.round((signal / eventsLast24h) * 100) : 0

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            /dashboard
          </span>
          <h1 className="mt-1 text-3xl font-semibold text-white tracking-tight">
            Mission control
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            {user?.email ? `Signed in as ${user.email}` : 'Live operational view'} ·{' '}
            <span className="font-mono text-zinc-500">last {WINDOW_HOURS}h</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <StatusPill label="supabase" tone="emerald" />
          <StatusPill label="ai pipeline" tone="accent" />
          <StatusPill
            label={openAlarmCount === 0 ? 'all clear' : `${openAlarmCount} open`}
            tone={openAlarmCount === 0 ? 'emerald' : criticalOpen > 0 ? 'rose' : 'amber'}
          />
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Events · 24h"
          value={eventsLast24h.toLocaleString()}
          sub={`${totalEvents.toLocaleString()} lifetime`}
          accent="accent"
        >
          <Sparkline values={sparkline} />
        </KpiCard>
        <KpiCard
          label="Signal ratio"
          value={`${signalRatio}%`}
          sub={`${signal} signal · ${noise} noise`}
          accent={signalRatio > 50 ? 'rose' : signalRatio > 20 ? 'amber' : 'emerald'}
        >
          <SeverityRatioBar counts={severityCounts} />
        </KpiCard>
        <KpiCard
          label="Sources"
          value={uniqueSources.toString()}
          sub={dominantSource ? `${toneFor(dominantSource[0]).label} leads` : 'no traffic'}
          accent="accent"
        >
          <SourceDotsRow sourceTotals={sourceTotals} />
        </KpiCard>
        <KpiCard
          label="Alarms · open"
          value={openAlarmCount.toString()}
          sub={
            criticalOpen > 0
              ? `${criticalOpen} critical · ${errorOpen} error`
              : openAlarmCount === 0
                ? 'no live alerts'
                : `${errorOpen} error`
          }
          accent={criticalOpen > 0 ? 'rose' : openAlarmCount > 0 ? 'amber' : 'emerald'}
          pulse={criticalOpen > 0}
        >
          <AlarmSeverityDots counts={openAlarmSeverity(openAlarms)} />
        </KpiCard>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader
            kicker="Activity"
            title={`Volume · last ${WINDOW_HOURS}h`}
            right={
              <Link
                href="/dashboard/timeline"
                className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-1 text-xs text-zinc-200 hover:border-zinc-600 transition-colors"
              >
                Open timeline
                <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            }
          />
          <div className="px-5 pb-4 pt-1">
            {eventsLast24h === 0 ? (
              <EmptyActivity />
            ) : (
              <>
                <ActivityHistogram buckets={buckets} windowHours={WINDOW_HOURS} />
                <SeverityLegend counts={severityCounts} />
              </>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            kicker="Triage"
            title="Recent alarms"
            right={
              <Link
                href="/dashboard/alarms"
                className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                view all →
              </Link>
            }
          />
          <ul className="divide-y divide-zinc-800/70">
            {recentAlarms.length === 0 && (
              <li className="px-5 py-6 text-center text-xs text-zinc-500">
                No alarms triggered yet.
              </li>
            )}
            {recentAlarms.map((a) => (
              <AlarmRowItem key={a.id} alarm={a} />
            ))}
          </ul>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader kicker="Sources" title="Top emitters · 24h" />
          <div className="px-5 pb-5 pt-1">
            {sourceTotals.size === 0 ? (
              <p className="py-4 text-xs text-zinc-500">No traffic in window.</p>
            ) : (
              <ul className="space-y-2.5">
                {[...sourceTotals.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 6)
                  .map(([src, count]) => {
                    const tone = toneFor(src)
                    const max = Math.max(...sourceTotals.values())
                    const pct = (count / max) * 100
                    return (
                      <li key={src}>
                        <div className="flex items-baseline justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="h-2 w-2 rounded-full shrink-0"
                              style={{ background: tone.color, boxShadow: `0 0 8px ${tone.color}55` }}
                            />
                            <p className="truncate text-xs text-zinc-200">{tone.label}</p>
                          </div>
                          <p className="font-mono text-xs text-zinc-400 tabular-nums">
                            {count.toLocaleString()}
                          </p>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-800/60">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              background: tone.color,
                              boxShadow: `inset 0 0 0 1px rgba(0,0,0,0.2)`,
                            }}
                          />
                        </div>
                      </li>
                    )
                  })}
              </ul>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader
            kicker="Stream"
            title="Live activity"
            right={
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                <span className="relative flex h-1.5 w-1.5">
                  <span
                    className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                    style={{ background: 'var(--app-accent)' }}
                  />
                  <span
                    className="relative inline-flex h-1.5 w-1.5 rounded-full"
                    style={{ background: 'var(--app-accent)' }}
                  />
                </span>
                tailing
              </span>
            }
          />
          <ul className="divide-y divide-zinc-800/70">
            {recentEvents.length === 0 && (
              <li className="px-5 py-6 text-center text-xs text-zinc-500">
                Nothing here yet. Ingest a log file from{' '}
                <Link href="/dashboard/ingest" className="text-zinc-300 underline-offset-2 hover:underline">
                  /ingest
                </Link>
                .
              </li>
            )}
            {recentEvents.map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
          </ul>
        </Card>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              Pipeline
            </p>
            <p className="mt-1 text-sm text-zinc-200">
              Ingest → Normalize → Rules → Store → <span style={{ color: 'var(--app-accent)' }}>Embed · Cluster · Summarize</span>
            </p>
          </div>
          <div className="flex items-baseline gap-6">
            <Stat small label="Clusters" value={clusterCount.toLocaleString()} />
            <Stat small label="Events lifetime" value={totalEvents.toLocaleString()} />
          </div>
        </div>
      </section>
    </div>
  )
}

function aggregate(
  events: Array<{ timestamp: string; severity: LogSeverity; source_type: string }>,
  sinceIso: string
) {
  const start = new Date(sinceIso).getTime()
  const span = Date.now() - start
  const bucketMs = span / HOUR_BUCKETS

  const buckets = Array.from({ length: HOUR_BUCKETS }, (_, i) => ({
    start: start + i * bucketMs,
    counts: {
      critical: 0,
      error: 0,
      warning: 0,
      info: 0,
      debug: 0,
    } as Record<LogSeverity, number>,
  }))

  const severityCounts: Record<LogSeverity, number> = {
    critical: 0, error: 0, warning: 0, info: 0, debug: 0,
  }

  const sourceTotals = new Map<string, number>()

  for (const e of events) {
    const t = new Date(e.timestamp).getTime()
    const idx = Math.min(HOUR_BUCKETS - 1, Math.max(0, Math.floor((t - start) / bucketMs)))
    buckets[idx]!.counts[e.severity] += 1
    severityCounts[e.severity] += 1
    sourceTotals.set(e.source_type, (sourceTotals.get(e.source_type) ?? 0) + 1)
  }

  const sparkline = buckets.map(
    (b) => b.counts.critical + b.counts.error + b.counts.warning + b.counts.info + b.counts.debug
  )

  return { buckets, sparkline, severityCounts, sourceTotals }
}

function openAlarmSeverity(arr: Array<{ severity: LogSeverity }>): Record<LogSeverity, number> {
  const out: Record<LogSeverity, number> = { critical: 0, error: 0, warning: 0, info: 0, debug: 0 }
  for (const a of arr) out[a.severity] += 1
  return out
}

const KPI_ACCENT = {
  accent: { ring: '', glow: '', value: 'var(--app-accent)', glowAlt: 'var(--app-glow)' },
  rose: { ring: 'border-rose-500/30', glow: 'from-rose-500/15', value: '#fda4af', glowAlt: 'rgba(244,63,94,0.18)' },
  amber: { ring: 'border-amber-500/30', glow: 'from-amber-500/10', value: '#fcd34d', glowAlt: 'rgba(245,158,11,0.18)' },
  emerald: { ring: 'border-emerald-500/30', glow: 'from-emerald-500/10', value: '#6ee7b7', glowAlt: 'rgba(16,185,129,0.18)' },
} as const

function KpiCard({
  label,
  value,
  sub,
  accent,
  pulse,
  children,
}: {
  label: string
  value: string
  sub: string
  accent: keyof typeof KPI_ACCENT
  pulse?: boolean
  children?: React.ReactNode
}) {
  const a = KPI_ACCENT[accent]
  const isAccent = accent === 'accent'
  return (
    <div
      className={`group relative overflow-hidden rounded-xl border bg-zinc-900 p-4 transition-colors ${isAccent ? '' : a.ring}`}
      style={
        isAccent
          ? ({ borderColor: 'var(--app-accent-dim)' } as React.CSSProperties)
          : undefined
      }
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(ellipse at top right, ${a.glowAlt}, transparent 60%)`,
        }}
      />
      <div className="relative">
        <div className="flex items-baseline justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
            {label}
          </p>
        </div>
        <p
          className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${pulse ? 'animate-pulse' : ''}`}
          style={{ color: a.value }}
        >
          {value}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>
        {children && <div className="mt-3 h-8">{children}</div>}
      </div>
    </div>
  )
}

function SeverityRatioBar({ counts }: { counts: Record<LogSeverity, number> }) {
  const order: LogSeverity[] = ['critical', 'error', 'warning', 'info', 'debug']
  const total = order.reduce((s, sev) => s + counts[sev], 0)
  if (total === 0) {
    return <div className="h-2 rounded-full bg-zinc-800" />
  }
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-zinc-800">
      {order.map((sev) => {
        const n = counts[sev]
        if (n === 0) return null
        const pct = (n / total) * 100
        return (
          <span
            key={sev}
            style={{ width: `${pct}%`, background: SEVERITY_COLOR[sev] }}
            title={`${sev}: ${n}`}
          />
        )
      })}
    </div>
  )
}

function SourceDotsRow({ sourceTotals }: { sourceTotals: Map<string, number> }) {
  const top = [...sourceTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  if (top.length === 0) return <div className="h-2 rounded-full bg-zinc-800" />
  return (
    <div className="flex items-center gap-1.5">
      {top.map(([src, n]) => {
        const tone = toneFor(src)
        return (
          <span
            key={src}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5"
            style={{ background: tone.color + '22' }}
            title={`${tone.label}: ${n}`}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.color }} />
            <span className="font-mono text-[10px] text-zinc-300 tabular-nums">{n}</span>
          </span>
        )
      })}
    </div>
  )
}

function AlarmSeverityDots({ counts }: { counts: Record<LogSeverity, number> }) {
  const order: LogSeverity[] = ['critical', 'error', 'warning']
  return (
    <div className="flex items-center gap-2">
      {order.map((sev) => (
        <span key={sev} className="flex items-center gap-1">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: SEVERITY_COLOR[sev], boxShadow: counts[sev] > 0 ? `0 0 6px ${SEVERITY_COLOR[sev]}` : undefined }}
          />
          <span className="font-mono text-[10px] tabular-nums text-zinc-400">{counts[sev]}</span>
        </span>
      ))}
    </div>
  )
}

function SeverityLegend({ counts }: { counts: Record<LogSeverity, number> }) {
  const order: LogSeverity[] = ['critical', 'error', 'warning', 'info', 'debug']
  return (
    <div className="mt-2 flex flex-wrap gap-3">
      {order.map((sev) => (
        <span key={sev} className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-400">
          <span className="h-1.5 w-1.5 rounded-sm" style={{ background: SEVERITY_COLOR[sev] }} />
          {sev}
          <span className="text-zinc-500 tabular-nums">· {counts[sev]}</span>
        </span>
      ))}
    </div>
  )
}

function EmptyActivity() {
  return (
    <div className="flex flex-col items-center justify-center py-10">
      <svg viewBox="0 0 48 48" className="h-8 w-8 text-zinc-700" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path d="M6 24h6l4-12 6 24 4-12 4 6h12" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="mt-3 text-sm text-zinc-400">No volume in the last {WINDOW_HOURS}h.</p>
      <Link href="/dashboard/ingest" className="mt-2 text-xs text-zinc-400 hover:text-zinc-200">
        → Ingest some logs
      </Link>
    </div>
  )
}

function EventRow({ event }: { event: RecentEventRow }) {
  const tone = toneFor(event.source_type)
  return (
    <li className="flex items-start gap-3 px-5 py-2.5 hover:bg-zinc-800/30 transition-colors">
      <span
        className="mt-0.5 inline-flex h-4 items-center rounded-sm px-1.5 font-mono text-[9px] uppercase tracking-wider"
        style={{ background: SEVERITY_COLOR[event.severity] + '22', color: SEVERITY_COLOR[event.severity] }}
      >
        {event.severity}
      </span>
      <span className="shrink-0 font-mono text-[10px] text-zinc-500 tabular-nums">
        {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
      <p className="min-w-0 flex-1 truncate text-xs text-zinc-300">{event.message}</p>
      <span
        className="shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[9px]"
        style={{ background: tone.color + '22', color: tone.color }}
      >
        {tone.label}
      </span>
    </li>
  )
}

function AlarmRowItem({ alarm }: { alarm: AlarmRow }) {
  const ruleMatch = /rule:([a-z_]+)/i.exec(alarm.notes ?? '')
  const rule = ruleMatch?.[1] ?? 'unspecified'
  return (
    <li className="flex items-start gap-3 px-5 py-2.5 hover:bg-zinc-800/30 transition-colors">
      <span
        className="mt-0.5 inline-flex h-4 items-center rounded-sm px-1.5 font-mono text-[9px] uppercase tracking-wider"
        style={{ background: SEVERITY_COLOR[alarm.severity] + '22', color: SEVERITY_COLOR[alarm.severity] }}
      >
        {alarm.severity}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-zinc-200">{rule.replace(/_/g, ' ')}</p>
        <p className="mt-0.5 font-mono text-[10px] text-zinc-500">
          {new Date(alarm.created_at).toLocaleString()}
        </p>
      </div>
      <span
        className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
          alarm.status === 'open'
            ? 'border-amber-500/30 bg-amber-500/5 text-amber-300'
            : 'border-zinc-700 bg-zinc-800/40 text-zinc-400'
        }`}
      >
        {alarm.status}
      </span>
    </li>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 ${className}`}>
      {children}
    </div>
  )
}

function CardHeader({
  kicker,
  title,
  right,
}: {
  kicker: string
  title: string
  right?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-800/70 px-5 py-3">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">{kicker}</p>
        <p className="text-sm font-semibold text-zinc-100">{title}</p>
      </div>
      {right}
    </div>
  )
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p
        className={`mt-0.5 font-mono font-semibold tabular-nums text-zinc-100 ${small ? 'text-lg' : 'text-2xl'}`}
      >
        {value}
      </p>
    </div>
  )
}

function StatusPill({
  label,
  tone,
}: {
  label: string
  tone: 'emerald' | 'amber' | 'rose' | 'accent'
}) {
  const cfg = {
    emerald: { border: 'border-emerald-500/20', bg: 'bg-emerald-500/5', dot: '#34d399', text: 'text-emerald-300' },
    amber: { border: 'border-amber-500/30', bg: 'bg-amber-500/5', dot: '#fbbf24', text: 'text-amber-300' },
    rose: { border: 'border-rose-500/30', bg: 'bg-rose-500/5', dot: '#fb7185', text: 'text-rose-300' },
    accent: { border: '', bg: '', dot: 'var(--app-accent)', text: '' },
  }[tone]

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${cfg.border} ${cfg.bg} ${cfg.text}`}
      style={
        tone === 'accent'
          ? {
              borderColor: 'var(--app-accent-dim)',
              background: 'var(--app-accent-dim)',
              color: 'var(--app-accent)',
            }
          : undefined
      }
    >
      <span className="relative flex h-1.5 w-1.5">
        <span
          className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
          style={{ background: cfg.dot }}
        />
        <span
          className="relative inline-flex h-1.5 w-1.5 rounded-full"
          style={{ background: cfg.dot }}
        />
      </span>
      {label}
    </span>
  )
}
