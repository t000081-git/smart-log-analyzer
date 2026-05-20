import { createClient } from '@/lib/supabase/server'
import TimelineGraph, {
  type TimelineEvent,
  type TimelineCluster,
  type RangeKey,
} from './_components/TimelineGraph'

export const dynamic = 'force-dynamic'

const MAX_EVENTS = 5000

const RANGES: Record<RangeKey, number> = {
  '1h': 1,
  '6h': 6,
  '24h': 24,
  '7d': 168,
}

interface LogEventRow {
  id: string
  timestamp: string
  severity: TimelineEvent['severity']
  source_type: string
  message: string
}

interface ClusterMemberRow {
  cluster_id: string
  log_event_id: string
}

interface ClusterRow {
  id: string
  label: string | null
  event_count: number
  first_seen: string | null
  last_seen: string | null
  severity_distribution: Record<string, number>
}

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  const params = await searchParams
  const range: RangeKey = (
    ['1h', '6h', '24h', '7d'].includes(params.range ?? '')
      ? params.range
      : '24h'
  ) as RangeKey
  const windowHours = RANGES[range]
  const since = new Date(Date.now() - windowHours * 3600 * 1000).toISOString()

  const supabase = await createClient()

  const eventsRes = await supabase
    .from('log_events')
    .select('id, timestamp, severity, source_type, message')
    .gte('timestamp', since)
    .order('timestamp', { ascending: true })
    .limit(MAX_EVENTS)

  const events: TimelineEvent[] = (eventsRes.data ?? []).map(
    (r: LogEventRow) => ({
      id: r.id,
      ts: r.timestamp,
      severity: r.severity,
      source_type: r.source_type,
      message: r.message.slice(0, 240),
    })
  )

  const eventIds = events.map((e) => e.id)
  let memberships: Record<string, string> = {}
  let clusters: TimelineCluster[] = []

  if (eventIds.length > 0) {
    const membersRes = await supabase
      .from('log_cluster_members')
      .select('cluster_id, log_event_id')
      .in('log_event_id', eventIds)

    memberships = (membersRes.data ?? []).reduce(
      (acc: Record<string, string>, m: ClusterMemberRow) => {
        acc[m.log_event_id] = m.cluster_id
        return acc
      },
      {}
    )

    const clusterIds = Array.from(new Set(Object.values(memberships)))
    if (clusterIds.length > 0) {
      const clustersRes = await supabase
        .from('log_clusters')
        .select('id, label, event_count, first_seen, last_seen, severity_distribution')
        .in('id', clusterIds)

      clusters = (clustersRes.data ?? []).map((c: ClusterRow) => ({
        id: c.id,
        label: c.label ?? 'unlabeled',
        event_count: c.event_count,
        first_seen: c.first_seen,
        last_seen: c.last_seen,
        severity_distribution: c.severity_distribution ?? {},
      }))
    }
  }

  return (
    <div className="max-w-6xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            /dashboard/timeline
          </span>
          <h1 className="mt-1 text-3xl font-semibold text-white tracking-tight">
            Timeline
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Stream of events with severity composition over time.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/5 px-3 py-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-400" />
          </span>
          <span className="font-mono text-xs text-sky-300">live · {range}</span>
        </div>
      </div>

      <TimelineGraph
        events={events}
        clusters={clusters}
        memberships={memberships}
        windowHours={windowHours}
        range={range}
      />
    </div>
  )
}
